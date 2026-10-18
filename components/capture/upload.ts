/**
 * Browser upload of one capture (GH-22): POST /api/captures for signed URLs, PUT each file with
 * XMLHttpRequest for a progress bar, retrying a file whole on failure (D-013: no resumable
 * upload), then PATCH the capture to "uploaded" (or "failed").
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

const RETRIES = 3;

/** PUT one file to a Supabase signed upload URL, reporting 0..1 progress. */
export function putWithProgress(
  url: string,
  file: Blob,
  contentType: string,
  onProgress: (share: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
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
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Upload failed (${xhr.status})`));
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.ontimeout = () => reject(new Error("Upload timed out"));
    xhr.send(file);
  });
}

async function readError(res: Response): Promise<string> {
  const json = (await res.json().catch(() => null)) as { message?: string; error?: string } | null;
  return json?.message ?? json?.error ?? `HTTP ${res.status}`;
}

async function patchStatus(captureId: string, status: "uploaded" | "failed"): Promise<Response> {
  return fetch(`/api/captures/${captureId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ status }),
  });
}

/**
 * Uploads one capture end to end. `files` are in upload order (a ring's photos, or one video).
 * Progress is the share of all bytes sent. Resolves with the capture id.
 */
export async function uploadCapture(
  request: CaptureRequest,
  files: Blob[],
  onProgress: (share: number) => void,
): Promise<string> {
  const isRing = request.kind === "ring";
  const body = isRing
    ? { ...request, files: files.map((f) => ({ contentType: "image/jpeg", sizeBytes: f.size })) }
    : { ...request, file: { contentType: files[0]!.type, sizeBytes: files[0]!.size } };
  const res = await fetch("/api/captures", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await readError(res));
  const { captureId, uploads } = (await res.json()) as {
    captureId: string;
    uploads: SignedUploadTarget[];
  };

  const total = files.reduce((sum, f) => sum + f.size, 0) || 1;
  let done = 0;
  try {
    for (let i = 0; i < files.length; i++) {
      const file = files[i]!;
      const target = uploads[i]!;
      for (let attempt = 1; ; attempt++) {
        try {
          await putWithProgress(
            target.signedUrl,
            file,
            file.type || "application/octet-stream",
            (s) => onProgress((done + s * file.size) / total),
          );
          break;
        } catch (error) {
          if (attempt >= RETRIES) throw error;
          await new Promise((r) => setTimeout(r, 1000 * attempt));
        }
      }
      done += file.size;
      onProgress(done / total);
    }
  } catch (error) {
    await patchStatus(captureId, "failed").catch(() => {});
    throw error;
  }

  const confirm = await patchStatus(captureId, "uploaded");
  if (!confirm.ok) throw new Error(await readError(confirm));
  return captureId;
}
