import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  UploadHttpError,
  uploadCapture,
  type CaptureRequest,
  type PutFile,
  type UploadSession,
} from "./upload";

const request: CaptureRequest = {
  listingId: "11111111-1111-4111-8111-111111111111",
  kind: "ring",
  roomMarkers: [{ room: "Kitchen", t: 0 }],
  headingTrack: Array.from({ length: 3 }, (_, i) => ({ t: i, heading: i * 45 })),
  qualityFlags: [],
};
const files = [0, 1, 2].map((i) => new Blob([`photo-${i}`], { type: "image/jpeg" }));

/** A fake server: counts POSTs, records PATCHes, and answers "uploaded" as `confirm` says. */
let posts = 0;
let patches: Array<{ id: string; status: string }> = [];
let confirm: { status: number; error?: string } = { status: 200 };

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

beforeEach(() => {
  posts = 0;
  patches = [];
  confirm = { status: 200 };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      if (url === "/api/captures") {
        posts++;
        const id = `capture-${posts}`;
        const uploads = files.map((_, i) => ({
          bucket: "captures",
          path: `${id}/${i}`,
          signedUrl: `https://signed/${id}/${i}`,
          token: "t",
        }));
        return json(201, { captureId: id, uploads });
      }
      const id = url.split("/").pop()!;
      const { status } = JSON.parse(String(init.body)) as { status: string };
      patches.push({ id, status });
      if (status === "uploaded" && confirm.status !== 200)
        return json(confirm.status, { error: confirm.error, message: confirm.error });
      return json(200, { captureId: id, status });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

/** A PUT that fails (with `error`) for the urls in `failing`, and records every url it got. */
function fakePut(failing: Set<string>, error: () => Error = () => new Error("network")) {
  const urls: string[] = [];
  const put: PutFile = async (url) => {
    urls.push(url);
    if (failing.has(url)) throw error();
  };
  return { put, urls };
}

async function firstAttemptFailingOn(url: string) {
  let session: UploadSession | null = null;
  const first = fakePut(new Set([url]));
  await expect(
    uploadCapture(request, files, () => {}, {
      put: first.put,
      backoffMs: 0,
      onSession: (s) => (session = s),
    }),
  ).rejects.toThrow("network");
  return session!;
}

describe("uploadCapture", () => {
  it("uploads every file and confirms the capture", async () => {
    const { put, urls } = fakePut(new Set());
    const progress: number[] = [];
    const id = await uploadCapture(request, files, (p) => progress.push(p), { put, backoffMs: 0 });
    expect(id).toBe("capture-1");
    expect(urls).toHaveLength(3);
    expect(progress.at(-1)).toBe(1);
    expect(patches).toEqual([{ id: "capture-1", status: "uploaded" }]);
  });

  it("retries on the same row: reopens it and re-sends only the missing files", async () => {
    const session = await firstAttemptFailingOn("https://signed/capture-1/1");
    expect(session.sent).toEqual([true, false, false]);
    expect(patches).toEqual([{ id: "capture-1", status: "failed" }]);

    const retry = fakePut(new Set());
    const id = await uploadCapture(request, files, () => {}, {
      session,
      put: retry.put,
      backoffMs: 0,
    });
    expect(id).toBe("capture-1");
    expect(posts).toBe(1); // no new capture row
    expect(retry.urls).toEqual(["https://signed/capture-1/1", "https://signed/capture-1/2"]);
    expect(patches.slice(1)).toEqual([
      { id: "capture-1", status: "uploading" },
      { id: "capture-1", status: "uploaded" },
    ]);
  });

  it("registers a new capture only when the old signed URLs expired", async () => {
    const session = await firstAttemptFailingOn("https://signed/capture-1/2");
    const expired = fakePut(
      new Set(["https://signed/capture-1/2"]),
      () => new UploadHttpError(403),
    );
    let latest: UploadSession | null = null;
    const id = await uploadCapture(request, files, () => {}, {
      session,
      put: expired.put,
      backoffMs: 0,
      onSession: (s) => (latest = s),
    });
    expect(id).toBe("capture-2");
    expect(posts).toBe(2);
    expect(latest!.captureId).toBe("capture-2");
    // The expired URL is tried once (no pointless retries), then all files go to the new row.
    expect(expired.urls).toEqual([
      "https://signed/capture-1/2",
      "https://signed/capture-2/0",
      "https://signed/capture-2/1",
      "https://signed/capture-2/2",
    ]);
    expect(patches.filter((p) => p.id === "capture-1").map((p) => p.status)).toEqual([
      "failed",
      "uploading",
      "failed",
    ]);
  });

  it("sends everything again after the server reports files missing", async () => {
    confirm = { status: 409, error: "files_missing" };
    let session: UploadSession | null = null;
    const { put } = fakePut(new Set());
    await expect(
      uploadCapture(request, files, () => {}, {
        put,
        backoffMs: 0,
        onSession: (s) => (session = s),
      }),
    ).rejects.toThrow("files_missing");
    expect(session!.sent).toEqual([false, false, false]);
    expect(session!.failed).toBe(true);

    confirm = { status: 200 };
    const retry = fakePut(new Set());
    await uploadCapture(request, files, () => {}, { session, put: retry.put, backoffMs: 0 });
    expect(retry.urls).toHaveLength(3);
    expect(posts).toBe(1);
  });
});
