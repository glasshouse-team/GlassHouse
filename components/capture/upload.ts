/**
 * Browser upload of one capture (GH-22): POST /api/captures for signed URLs, PUT each file with
 * XMLHttpRequest for a progress bar, retrying a file whole on failure (D-013: no resumable
 * upload), then PATCH the capture to "uploaded" (or "failed").
 *
 * A retry keeps the capture row: the caller holds the `UploadSession` (capture id, signed URLs,
 * which files were sent), the row is reopened with PATCH "uploading", and only the missing files
 * are PUT again to the same URLs. Only when those URLs are refused (expired: storage answers 400
 * or 403) is a new capture registered with POST.
 */

export interface SignedUploadTarget {
  bucket: string;
  path: string;
  signedUrl: string;
  token: string;
}

export interface CaptureRequest {
  listingId: string;
  kind: "walkthrough" | "ring" | "fill_in";
  gapId?: string;
  durationS?: number;
  roomMarkers: { room: string; t: number }[];
  headingTrack: { t: number; heading: number }[];
  qualityFlags: string[];
}

/** One capture row and its signed URLs, kept across retries. Mutated by `uploadCapture`. */
export interface UploadSession {
  captureId: string;
  uploads: SignedUploadTarget[];
  /** sent[i]: file i reached storage. */
  sent: boolean[];
  /** The row was marked "failed" and has to be reopened before a retry. */
  failed: boolean;
}

export type PutFile = (
  url: string,
  file: Blob,
  contentType: string,
  onProgress: (share: number) => void,
) => Promise<void>;

/** A PUT that storage answered with an HTTP status (a network error has none). */
export class UploadHttpError extends Error {
  constructor(readonly status: number) {
    super(`Upload failed (${status})`);
    this.name = "UploadHttpError";
  }
}

const RETRIES = 3;

/** Storage refuses an expired or invalid signed upload URL with 400 or 403. */
export function isExpiredUrl(error: unknown): boolean {
  return error instanceof UploadHttpError && (error.status === 400 || error.status === 403);
}

/** PUT one file to a Supabase signed upload URL, reporting 0..1 progress. */
export const putWithProgress: PutFile = (url, file, contentType, onProgress) =>
  new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("content-type", contentType);
    xhr.setRequestHeader("x-upsert", "true");
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (anon) xhr.setRequestHeader("apikey", anon);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new UploadHttpError(xhr.status));
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.ontimeout = () => reject(new Error("Upload timed out"));
    xhr.send(file);
  });

async function readError(res: Response): Promise<{ code?: string; message: string }> {
  const json = (await res.json().catch(() => null)) as { message?: string; error?: string } | null;
  return { code: json?.error, message: json?.message ?? json?.error ?? `HTTP ${res.status}` };
}

async function patchStatus(
  captureId: string,
  status: "uploaded" | "failed" | "uploading",
): Promise<Response> {
  return fetch(`/api/captures/${captureId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ status }),
  });
}

async function register(request: CaptureRequest, files: Blob[]): Promise<UploadSession> {
  const body =
    request.kind === "ring"
      ? { ...request, files: files.map((f) => ({ contentType: "image/jpeg", sizeBytes: f.size })) }
      : { ...request, file: { contentType: files[0]!.type, sizeBytes: files[0]!.size } };
  const res = await fetch("/api/captures", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await readError(res)).message);
  const { captureId, uploads } = (await res.json()) as {
    captureId: string;
    uploads: SignedUploadTarget[];
  };
  return { captureId, uploads, sent: files.map(() => false), failed: false };
}

/** Gives the row up as failed (best effort) so a later retry knows to reopen it. */
async function markFailed(session: UploadSession): Promise<void> {
  session.failed = true;
  await patchStatus(session.captureId, "failed").catch(() => {});
}

export interface UploadOptions {
  /** The session of an earlier attempt of this capture; null or absent for the first one. */
  session?: UploadSession | null;
  /** Called whenever a new capture row is registered, so the caller can keep it for a retry. */
  onSession?: (session: UploadSession) => void;
  /** File PUT; tests pass a fake. */
  put?: PutFile;
  /** Pause between PUT attempts of one file; tests pass 0. */
  backoffMs?: number;
}

/**
 * Uploads one capture end to end, or resumes an earlier attempt (`options.session`). `files`
 * are in upload order (a ring's photos, or one video). Progress is the share of all bytes sent.
 * Resolves with the capture id.
 */
export async function uploadCapture(
  request: CaptureRequest,
  files: Blob[],
  onProgress: (share: number) => void,
  options: UploadOptions = {},
): Promise<string> {
  const put = options.put ?? putWithProgress;
  const backoff = options.backoffMs ?? 1000;
  let session = options.session ?? null;

  if (session?.failed) {
    const reopened = await patchStatus(session.captureId, "uploading").catch(() => null);
    if (reopened?.ok) session.failed = false;
    else session = null; // The row is gone or final: start over with a new one.
  }
  let fresh = !session;
  if (!session) {
    session = await register(request, files);
    options.onSession?.(session);
  }

  const total = files.reduce((sum, f) => sum + f.size, 0) || 1;
  for (;;) {
    try {
      await sendMissing(session, files, total, put, backoff, onProgress);
      break;
    } catch (error) {
      await markFailed(session);
      // Old signed URLs expired: register the capture again, once.
      if (fresh || !isExpiredUrl(error)) throw error;
      session = await register(request, files);
      options.onSession?.(session);
      fresh = true;
    }
  }

  const confirm = await patchStatus(session.captureId, "uploaded");
  if (!confirm.ok) {
    const { code, message } = await readError(confirm);
    if (code === "files_missing") {
      // Storage does not have every file: send them all again on the next retry.
      session.sent = files.map(() => false);
      await markFailed(session);
    }
    throw new Error(message);
  }
  return session.captureId;
}

async function sendMissing(
  session: UploadSession,
  files: Blob[],
  total: number,
  put: PutFile,
  backoff: number,
  onProgress: (share: number) => void,
): Promise<void> {
  let done = files.reduce((sum, f, i) => sum + (session.sent[i] ? f.size : 0), 0);
  onProgress(done / total);
  for (let i = 0; i < files.length; i++) {
    if (session.sent[i]) continue;
    const file = files[i]!;
    const target = session.uploads[i];
    if (!target) throw new Error("The server returned fewer upload URLs than files.");
    for (let attempt = 1; ; attempt++) {
      try {
        await put(target.signedUrl, file, file.type || "application/octet-stream", (s) =>
          onProgress((done + s * file.size) / total),
        );
        break;
      } catch (error) {
        // An expired URL will not work on a second try either.
        if (attempt >= RETRIES || isExpiredUrl(error)) throw error;
        await new Promise((r) => setTimeout(r, backoff * attempt));
      }
    }
    session.sent[i] = true;
    done += file.size;
    onProgress(done / total);
  }
}
