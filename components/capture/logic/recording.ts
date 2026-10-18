/**
 * Recorder settings and helpers (GH-22). Pure, tested in recording.test.ts.
 */

/** World Labs takes videos up to 30 s and the server has no ffmpeg (D-009, D-015). Same as lib/media.ts. */
export const CLIP_MAX_SECONDS = 30;
/** About 6 MB for 30 s, well under World Labs' 20 MB URL-input limit. */
export const VIDEO_BITS_PER_SECOND = 1_500_000;
/** Storage refuses bigger files on the Free plan; the API checks the same number. */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

/** In order of preference: mp4/H.264 plays everywhere and World Labs takes it directly. */
export const MIME_CANDIDATES = [
  "video/mp4;codecs=avc1",
  "video/mp4",
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm",
] as const;

/** First type the browser can record, or null (then the page offers the file-input fallback). */
export function pickMimeType(isTypeSupported: (type: string) => boolean): string | null {
  for (const type of MIME_CANDIDATES) {
    try {
      if (isTypeSupported(type)) return type;
    } catch {
      // Some browsers throw on codec strings they do not know.
    }
  }
  return null;
}

/** "video/mp4;codecs=avc1" -> "video/mp4"; anything that is not webm is stored as mp4. */
export function baseMimeType(type: string): "video/mp4" | "video/webm" {
  return type.toLowerCase().startsWith("video/webm") ? "video/webm" : "video/mp4";
}

export function extensionFor(type: string): "mp4" | "webm" {
  return baseMimeType(type) === "video/webm" ? "webm" : "mp4";
}

/** Room checklist pre-filled from the listing (ticket: Entrance, Living room, Kitchen, ...). */
export function defaultRooms(bedrooms: number, baths: number): string[] {
  const rooms = ["Entrance", "Living room", "Kitchen"];
  const beds = Math.max(0, Math.floor(bedrooms));
  for (let i = 1; i <= beds; i++) rooms.push(beds === 1 ? "Bedroom" : `Bedroom ${i}`);
  const fullBaths = Math.max(1, Math.round(baths));
  for (let i = 1; i <= fullBaths; i++) rooms.push(fullBaths === 1 ? "Bathroom" : `Bathroom ${i}`);
  return rooms;
}

/** "0:07" style clock for the overlay. */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
