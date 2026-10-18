/**
 * The known invented area of hero 2 (GH-19, owner: Temuri, D-026). Kitchen v1 was generated
 * from its 8-photo middle ring without photos 1019 and 1020 (ring positions 7 and 8, azimuth
 * 270 and 315 deg), so Marble invented that wall: a door, an air conditioner and cables. v2 has
 * all 8 photos. `pnpm gaps --mark-known` stores that gap and the coverage scores from the ring
 * photo counts (not from the automatic check). Pure, no I/O: the script does the reads and writes.
 * The automatic check (GH-19 part 2) must keep this gap when it clears its own open gaps, and
 * must not re-run the coverage step here once it writes measured scores (D-041).
 */
import type { Gap, GapIssue, Vec3 } from "@/lib/schemas/world";
import { HERO_LISTINGS } from "@/seed/fixtures";

/** Photos in one spot's ring (D-009): 8, turning right 45 deg each. */
export const RING_SIZE = 8;

/** Ring azimuth of a photo, in degrees clockwise from the ring's first photo. */
export function ringAzimuth(position: number, ringSize = RING_SIZE): number {
  return ((((position * 360) / ringSize) % 360) + 360) % 360;
}

/**
 * Horizontal unit direction for an azimuth after marbleToThree: (sin az, 0, -cos az), the same
 * convention as SpotLinkSchema. Rounded to 1e-9 so 90 deg gives exactly z = 0.
 */
export function azimuthToDirection(azimuthDeg: number): Vec3 {
  const r = (azimuthDeg * Math.PI) / 180;
  const clean = (v: number) => Math.round(v * 1e9) / 1e9 + 0;
  return { x: clean(Math.sin(r)), y: 0, z: clean(-Math.cos(r)) };
}

/** Share of a spot's ring that went into its world: (ring - missing) / ring, 0..1. */
export function ringCoverage(ringPhotos: number, missingPhotos: number): number {
  if (!Number.isInteger(ringPhotos) || ringPhotos <= 0) throw new Error("ringPhotos must be > 0");
  if (!Number.isInteger(missingPhotos) || missingPhotos < 0 || missingPhotos > ringPhotos)
    throw new Error("missingPhotos must be between 0 and ringPhotos");
  return (ringPhotos - missingPhotos) / ringPhotos;
}

/** One known invented area, described by the capture that caused it. */
export interface KnownGap {
  listingId: string;
  version: number;
  spot: string;
  room: string;
  /** Photos left out of the ring, by file name number. */
  missingPhotos: number[];
  /** Their ring positions, 0-based (the first ring photo is 0). */
  missingPositions: number[];
  /** Where to aim the ray, degrees clockwise from the first ring photo. */
  azimuth: number;
  /** Ray height above the floor, meters. */
  rayHeight: number;
  issue: GapIssue;
  severity: number;
  radiusM: number;
  description: string;
}

export const HERO2_LISTING_ID = HERO_LISTINGS.hero2.id;

/**
 * Hero 2 kitchen v1. The ring is ~/Desktop/house/kitchen/middle, IMG_1013..1020 taken 2 s apart
 * in that order, so 1013 = 0 deg and 1019 / 1020 = positions 6 / 7 = 270 / 315 deg. The ray goes
 * along 270 deg (photo 1019, aimed at the photo-frame wall): v1's panorama shows the invented
 * door and air conditioner between about 237 and 290 deg, and v1's collider differs from v2's
 * there (210-300 deg).
 */
export const HERO2_KITCHEN_V1: KnownGap = {
  listingId: HERO2_LISTING_ID,
  version: 1,
  spot: "kitchen",
  room: "Kitchen",
  missingPhotos: [1019, 1020],
  missingPositions: [6, 7],
  azimuth: 270,
  rayHeight: 1.2,
  issue: "invented",
  severity: 3,
  radiusM: 1.0,
  description:
    "The wall with the photo frame was not photographed in this version; the door, air conditioner and cables you see there were invented by the 3D model. Re-shoot this wall.",
};

export const KNOWN_GAPS: readonly KnownGap[] = [HERO2_KITCHEN_V1];

/** The gaps columns this script writes (the rest keep their defaults). */
export type KnownGapRow = Pick<
  Gap,
  | "world_id"
  | "room"
  | "issue"
  | "description"
  | "severity"
  | "position"
  | "view_dir"
  | "radius_m"
  | "screenshot_url"
  | "status"
>;

/** The columns the key reads; `issue` is a plain string as the database returns it. */
export interface GapKeyFields {
  world_id: string;
  issue: string;
  description: string;
}

/**
 * Idempotency key: the same world, issue and description is the same known gap, whatever
 * its status (a host may have requested a fill-in since). No unique index exists on gaps.
 */
export function knownGapKey(gap: GapKeyFields): string {
  return `${gap.world_id}|${gap.issue}|${gap.description}`;
}

const mm = (v: number) => Math.round(v * 1000) / 1000 + 0;

/** The ray's start: the spot centre (the capture camera, x = z = 0) at `rayHeight`. */
export function rayOrigin(known: KnownGap): Vec3 {
  return { x: 0, y: known.rayHeight, z: 0 };
}

/** The point `distance` meters along the known gap's ray, rounded to millimetres. */
export function hitPoint(known: KnownGap, distance: number): Vec3 {
  const o = rayOrigin(known);
  const d = azimuthToDirection(known.azimuth);
  return { x: mm(o.x + d.x * distance), y: mm(o.y + d.y * distance), z: mm(o.z + d.z * distance) };
}

/** The row to store for a known gap whose ray hit the collider `distance` meters out. */
export function knownGapRow(known: KnownGap, worldId: string, distance: number): KnownGapRow {
  return {
    world_id: worldId,
    room: known.room,
    issue: known.issue,
    description: known.description,
    severity: known.severity,
    position: hitPoint(known, distance),
    view_dir: azimuthToDirection(known.azimuth),
    radius_m: known.radiusM,
    screenshot_url: null,
    status: "open",
  };
}

/** Only insert when no gap with the same key exists; never touch an existing one. */
export function gapToInsert(
  row: KnownGapRow,
  existing: readonly GapKeyFields[],
): KnownGapRow | null {
  const key = knownGapKey(row);
  return existing.some((g) => knownGapKey(g) === key) ? null : row;
}

export interface CoverageWorldRow {
  id: string;
  listing_id: string;
  version: number;
  spot: string;
  coverage_score: number | null;
}

/**
 * Coverage from the ring photo count for every spot world of the known gaps' listings: the
 * known spot-version gets (8 - missing) / 8, every other spot row (v1 copies and v2) 1.0. Only
 * rows whose stored score differs come back, so a re-run changes nothing.
 */
export function coverageUpdates(
  worlds: readonly CoverageWorldRow[],
  known: readonly KnownGap[] = KNOWN_GAPS,
): { id: string; spot: string; version: number; coverage_score: number }[] {
  const listings = new Set(known.map((k) => k.listingId));
  const updates: { id: string; spot: string; version: number; coverage_score: number }[] = [];
  for (const w of worlds) {
    if (!listings.has(w.listing_id)) continue;
    const hit = known.find(
      (k) => k.listingId === w.listing_id && k.version === w.version && k.spot === w.spot,
    );
    const score = hit ? ringCoverage(RING_SIZE, hit.missingPhotos.length) : 1;
    const stored = w.coverage_score === null ? null : Number(w.coverage_score);
    if (stored === null || Math.abs(stored - score) > 5e-4) {
      updates.push({ id: w.id, spot: w.spot, version: w.version, coverage_score: score });
    }
  }
  return updates;
}
