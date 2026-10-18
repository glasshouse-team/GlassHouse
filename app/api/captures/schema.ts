/**
 * Request bodies and storage paths for /api/captures (GH-22). Pure, tested in schema.test.ts.
 *
 * Every raw capture goes to the private `captures` bucket (docs/ARCHITECTURE.md):
 *   video: {listingId}/{captureId}/raw.(mp4|webm|mov)
 *   ring:  {listingId}/{captureId}/ring/00.jpg ... (8 ring photos, then one per doorway)
 * `captures.raw_url` stores "captures/<path>" (bucket and path; a private bucket has no URL).
 * A ring's `heading_track` has one sample per photo, in upload order, so photo i's compass
 * heading is heading_track[i]; photos 8 and up are doorway photos (D-009). With the compass off
 * the track is empty and the ring carries the "no_compass" flag; nothing in between is accepted.
 */
import { z } from "zod";
import { HeadingSampleSchema, RoomMarkerSchema } from "@/lib/schemas/world";
import { CLIP_MAX_SECONDS, MAX_UPLOAD_BYTES } from "@/components/capture/logic/recording";
import { MAX_RING_FILES, RING_PHOTOS } from "@/components/capture/logic/coverage";

/** A 30 s clip sampled at 10 Hz is 300 samples; leave room for faster sensors. */
const MAX_HEADING_SAMPLES = 3_000;
/** MediaRecorder stops a little after the cap; allow one second of slack. */
const MAX_DURATION_S = CLIP_MAX_SECONDS + 1;

const VideoFile = z.object({
  // video/quicktime: an iPhone file picked in the upload fallback (.mov; World Labs takes mov).
  contentType: z.enum(["video/mp4", "video/webm", "video/quicktime"]),
  sizeBytes: z.number().int().positive().max(MAX_UPLOAD_BYTES),
});
const PhotoFile = z.object({
  contentType: z.literal("image/jpeg"),
  sizeBytes: z
    .number()
    .int()
    .positive()
    .max(15 * 1024 * 1024),
});

const Common = {
  listingId: z.uuid(),
  roomMarkers: z.array(RoomMarkerSchema.extend({ room: z.string().trim().min(1).max(60) })).max(40),
  headingTrack: z.array(HeadingSampleSchema).max(MAX_HEADING_SAMPLES),
  qualityFlags: z.array(z.enum(["too_fast", "too_dark", "shaky", "no_compass"])).max(4),
};

export const CreateCaptureSchema = z.discriminatedUnion("kind", [
  z.object({
    ...Common,
    kind: z.literal("walkthrough"),
    durationS: z.number().positive().max(MAX_DURATION_S),
    file: VideoFile,
  }),
  z.object({
    ...Common,
    kind: z.literal("fill_in"),
    gapId: z.uuid().optional(),
    durationS: z.number().positive().max(MAX_DURATION_S),
    file: VideoFile,
  }),
  z
    .object({
      ...Common,
      kind: z.literal("ring"),
      files: z.array(PhotoFile).min(RING_PHOTOS).max(MAX_RING_FILES),
    })
    .refine(
      (ring) =>
        ring.headingTrack.length === ring.files.length ||
        (ring.headingTrack.length === 0 && ring.qualityFlags.includes("no_compass")),
      {
        path: ["headingTrack"],
        message: 'A ring needs one heading per photo, or none with the "no_compass" flag.',
      },
    ),
]);
export type CreateCapture = z.infer<typeof CreateCaptureSchema>;

/**
 * PATCH body. "uploaded" and "failed" end an upload; "uploading" reopens a failed one so the
 * browser can re-send its missing files to the same signed URLs (a retry keeps the row).
 */
export const UpdateCaptureSchema = z.object({
  status: z.enum(["uploaded", "failed", "uploading"]),
});
export type CaptureStatusUpdate = z.infer<typeof UpdateCaptureSchema>["status"];

/** The status a row must have for a PATCH to move it to `next` (the update is conditional). */
export function requiredStatus(next: CaptureStatusUpdate): "uploading" | "failed" {
  return next === "uploading" ? "failed" : "uploading";
}

/** File name of ring photo i inside the ring folder: 00.jpg, 01.jpg, ... */
export function ringPhotoName(i: number): string {
  return `${String(i).padStart(2, "0")}.jpg`;
}

export interface StoredFile {
  name: string;
  /** Bytes, from the storage listing's metadata; null when the listing has none. */
  size: number | null;
}

export interface UploadCheck {
  complete: boolean;
  /** Files of this capture found in storage. */
  fileCount: number;
  /** Expected files that are not in storage. */
  missing: string[];
}

/**
 * Whether every file of a capture is in storage, so a PATCH "uploaded" can be trusted by
 * POST /api/worlds. A ring expects one photo per heading sample (00.jpg ... in upload order);
 * a compass-off ring has no headings, so it expects the 8 ring photos, and its doorway photos
 * are covered by the byte check: the stored files must add up to the declared `size_bytes`.
 */
export function checkUpload(
  capture: { kind: string; path: string; headingCount: number; sizeBytes: number | null },
  stored: readonly StoredFile[],
): UploadCheck {
  let expected: string[];
  let mine: StoredFile[];
  if (capture.kind === "ring") {
    const count = capture.headingCount > 0 ? capture.headingCount : RING_PHOTOS;
    expected = Array.from({ length: count }, (_, i) => ringPhotoName(i));
    mine = stored.filter((f) => /^\d{2}\.jpg$/.test(f.name));
  } else {
    const name = capture.path.split("/").pop() ?? "";
    expected = [name];
    mine = stored.filter((f) => f.name === name);
  }
  const names = new Set(mine.map((f) => f.name));
  const missing = expected.filter((n) => !names.has(n));
  const sizes = mine.map((f) => f.size);
  const bytesKnown = capture.sizeBytes !== null && sizes.every((s) => s !== null);
  const bytesOk =
    !bytesKnown || sizes.reduce<number>((sum, s) => sum + (s ?? 0), 0) === capture.sizeBytes;
  return { complete: missing.length === 0 && bytesOk, fileCount: mine.length, missing };
}

/** Object paths inside the `captures` bucket for one capture, in upload order. */
export function captureObjectPaths(
  listingId: string,
  captureId: string,
  body: Pick<CreateCapture, "kind"> & {
    file?: { contentType: string };
    files?: readonly unknown[];
  },
): string[] {
  const base = `${listingId}/${captureId}`;
  if (body.kind === "ring")
    return (body.files ?? []).map((_, i) => `${base}/ring/${ringPhotoName(i)}`);
  const type = body.file?.contentType;
  const ext = type === "video/webm" ? "webm" : type === "video/quicktime" ? "mov" : "mp4";
  return [`${base}/raw.${ext}`];
}

/** What `captures.raw_url` stores: the bucket and the file (video) or folder (ring). */
export function rawUrlFor(kind: CreateCapture["kind"], paths: readonly string[]): string {
  const first = paths[0] ?? "";
  return kind === "ring" ? `captures/${first.replace(/[^/]+$/, "")}` : `captures/${first}`;
}

/** Feed line for a finished upload, e.g. "Giorgi uploaded an 8-photo ring of the Kitchen". */
export function uploadSummary(
  name: string,
  kind: CreateCapture["kind"],
  rooms: readonly string[],
  fileCount: number,
  durationS: number | null,
): string {
  const where = rooms.length
    ? ` of ${rooms.slice(0, 3).join(", ")}${rooms.length > 3 ? "…" : ""}`
    : "";
  if (kind === "ring") {
    const article = fileCount === 8 || fileCount === 11 ? "an" : "a";
    return `${name} uploaded ${article} ${fileCount}-photo ring${where}`;
  }
  const secs = durationS ? ` (${Math.round(durationS)} s)` : "";
  return `${name} uploaded a ${kind === "fill_in" ? "fill-in" : "walkthrough"} clip${secs}${where}`;
}
