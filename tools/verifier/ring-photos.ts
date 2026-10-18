/**
 * Real ring photos of a spot for the gap check (GH-19, owner: Temuri, D-047). A spot's middle
 * ring is 8 photos taken turning right 45 deg each, the first at azimuth 0, the same azimuth the
 * panorama's centre column has (tools/verifier/gap-views.ts). So every 90 deg panorama view can
 * be compared with the 2-3 real photos that face the same way, instead of any photo of the room.
 *
 * Pure (tested): folder matching, ring order, which photos face a view. Reading a folder is in
 * ./ring-folder.ts (script only), so routes that import this never trace local files.
 */
import { RING_SIZE } from "./known-gap";

/** Long side of a ring photo sent to the model. */
export const RING_PHOTO_PX = 768;
/**
 * A ring photo faces a view when its azimuth is at most this far from the view's yaw: half the
 * view's 90 deg plus about half a portrait phone photo's ~54 deg width, so the two overlap.
 */
export const FACING_MAX_DEG = 67.5;
/** Ring photos per view. */
export const PHOTOS_PER_VIEW = 3;

export interface RingPhoto {
  /** File name, e.g. IMG_1019.HEIC. */
  name: string;
  /** Degrees clockwise from the ring's first photo. */
  azimuth: number;
  jpeg: Buffer;
}

/** Spot names that the ring folders call differently. */
const FOLDER_ALIASES: Record<string, string[]> = {
  bathroom: ["toilet", "wc", "restroom", "shower room"],
  living: ["living room", "lounge"],
  entrance: ["entrance hall", "hall", "hallway"],
};

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** The ring folder (by name) of a spot: its id, its label or an alias; null when none fits. */
export function matchRingFolder(
  spot: string,
  spotLabel: string | null,
  folders: readonly string[],
): string | null {
  const names = [spot, spotLabel ?? "", ...(FOLDER_ALIASES[norm(spot)] ?? [])]
    .map(norm)
    .filter(Boolean);
  const exact = folders.find((f) => names.includes(norm(f)));
  if (exact) return exact;
  return (
    folders.find((f) => names.some((n) => norm(f).startsWith(n) || n.startsWith(norm(f)))) ?? null
  );
}

/** Smallest angle between two azimuths, 0..180. */
export function angularDistance(a: number, b: number): number {
  const d = (((a - b) % 360) + 360) % 360;
  return d > 180 ? 360 - d : d;
}

/**
 * The ring order of the files in a folder: image files sorted by name (the phone numbers them
 * in shooting order), the first `ringSize`; extra photos (doorways) are left out.
 */
export function ringOrder(files: readonly string[], ringSize = RING_SIZE): string[] {
  return files
    .filter((f) => /\.(heic|heif|jpe?g|png)$/i.test(f) && !f.startsWith("."))
    .sort((a, b) => a.localeCompare(b, "en", { numeric: true }))
    .slice(0, ringSize);
}

/** Ring photos facing a view (nearest first), at most `max`, none further than `maxDeg`. */
export function photosFacing<P extends { azimuth: number }>(
  photos: readonly P[],
  yaw: number,
  max = PHOTOS_PER_VIEW,
  maxDeg = FACING_MAX_DEG,
): P[] {
  return photos
    .map((p) => ({ p, d: angularDistance(p.azimuth, yaw) }))
    .filter((x) => x.d <= maxDeg)
    .sort((a, b) => a.d - b.d)
    .slice(0, max)
    .map((x) => x.p);
}
