/**
 * Request bodies and storage paths for /api/captures (GH-22). Pure, tested in schema.test.ts.
 *
 * Every raw capture goes to the private `captures` bucket (docs/ARCHITECTURE.md):
 *   video: {listingId}/{captureId}/raw.(mp4|webm)
 *   ring:  {listingId}/{captureId}/ring/00.jpg ... (8 ring photos, then one per doorway)
 * `captures.raw_url` stores "captures/<path>" (bucket and path; a private bucket has no URL).
 * A ring's `heading_track` has one sample per photo, in upload order, so photo i's compass
 * heading is heading_track[i]; photos 8 and up are doorway photos (D-009).
 */
import { z } from "zod";
import { HeadingSampleSchema, RoomMarkerSchema } from "@/lib/schemas/world";
import { CLIP_MAX_SECONDS, MAX_UPLOAD_BYTES } from "@/components/capture/logic/recording";
import { RING_PHOTOS } from "@/components/capture/logic/coverage";

/** 8 ring photos plus up to 4 doorway photos. */
export const MAX_RING_FILES = RING_PHOTOS + 4;
/** A 30 s clip sampled at 10 Hz is 300 samples; leave room for faster sensors. */
const MAX_HEADING_SAMPLES = 3_000;
/** MediaRecorder stops a little after the cap; allow one second of slack. */
const MAX_DURATION_S = CLIP_MAX_SECONDS + 1;

const VideoFile = z.object({
  contentType: z.enum(["video/mp4", "video/webm"]),
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
  z.object({
    ...Common,
    kind: z.literal("ring"),
    files: z.array(PhotoFile).min(RING_PHOTOS).max(MAX_RING_FILES),
  }),
]);
export type CreateCapture = z.infer<typeof CreateCaptureSchema>;

export const UpdateCaptureSchema = z.object({ status: z.enum(["uploaded", "failed"]) });

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
    return (body.files ?? []).map((_, i) => `${base}/ring/${String(i).padStart(2, "0")}.jpg`);
  const ext = body.file?.contentType === "video/webm" ? "webm" : "mp4";
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
