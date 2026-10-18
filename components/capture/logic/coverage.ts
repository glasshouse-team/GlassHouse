/**
 * Coverage ring for the phone recorder (GH-22). Pure logic, tested in coverage.test.ts.
 * Video mode: 36 bins of 10 degrees per room fill as the compass heading passes them.
 * Ring mode (D-009): 8 photos per spot, one every 45 degrees turning right.
 */
import { angleDelta, normalizeDeg, type HeadingSample } from "./heading";

export const RING_BINS = 36;
/** Aim for at least this many degrees per room (mobile-capture skill). */
export const RING_TARGET_DEGREES = 330;
/** D-009: one 8-photo ring per spot, turning right about 45 degrees each time. */
export const RING_PHOTOS = 8;
export const RING_STEP_DEGREES = 360 / RING_PHOTOS;
/** Plus one photo per doorway (D-009), at most 4. */
export const MAX_DOORWAY_PHOTOS = 4;
export const MAX_RING_FILES = RING_PHOTOS + MAX_DOORWAY_PHOTOS;
/** A ring photo counts as aimed when the heading is this close to its target. */
export const AIM_TOLERANCE_DEGREES = 10;
/** Neighbouring samples closer than this fill the bins between them (slow sensors skip bins). */
const MAX_INTERPOLATE_DEGREES = 30;

/** Index of the bin a heading falls in (10-degree bins by default). */
export function binFor(heading: number, bins = RING_BINS): number {
  return Math.floor(normalizeDeg(heading) / (360 / bins)) % bins;
}

export interface RingCoverage {
  filled: boolean[];
  /** Degrees covered: filled bins times the bin width. */
  degrees: number;
  /** 0..1 share of the full circle. */
  share: number;
  /** At least RING_TARGET_DEGREES covered. */
  done: boolean;
}

/** Which bins the samples have filled. */
export function ringCoverage(
  samples: readonly Pick<HeadingSample, "heading">[],
  bins = RING_BINS,
): RingCoverage {
  const filled = new Array<boolean>(bins).fill(false);
  const width = 360 / bins;
  samples.forEach((sample, i) => {
    filled[binFor(sample.heading, bins)] = true;
    const prev = samples[i - 1];
    if (!prev) return;
    const delta = angleDelta(prev.heading, sample.heading);
    if (Math.abs(delta) > MAX_INTERPOLATE_DEGREES) return;
    const steps = Math.ceil(Math.abs(delta) / width);
    for (let s = 1; s < steps; s++) filled[binFor(prev.heading + (delta * s) / steps, bins)] = true;
  });
  const count = filled.filter(Boolean).length;
  const degrees = count * width;
  return { filled, degrees, share: count / bins, done: degrees >= RING_TARGET_DEGREES };
}

export interface RoomMarker {
  room: string;
  t: number;
}

/** The heading samples recorded while `markers[index]` was the current room. */
export function samplesForRoom(
  track: readonly HeadingSample[],
  markers: readonly RoomMarker[],
  index: number,
): HeadingSample[] {
  const start = markers[index]?.t ?? 0;
  const end = markers[index + 1]?.t ?? Number.POSITIVE_INFINITY;
  return track.filter((s) => s.t >= start && s.t < end);
}

/** Heading the next ring photo should face: the first photo's heading plus 45 degrees a step. */
export function ringTarget(startHeading: number, photoIndex: number): number {
  return normalizeDeg(startHeading + photoIndex * RING_STEP_DEGREES);
}

export type AimHint = { kind: "aimed" } | { kind: "turn"; direction: "right" | "left"; by: number };

/** How far to turn to face `target`; "aimed" within the tolerance. */
export function aimHint(current: number, target: number): AimHint {
  const delta = angleDelta(current, target);
  if (Math.abs(delta) <= AIM_TOLERANCE_DEGREES) return { kind: "aimed" };
  return { kind: "turn", direction: delta > 0 ? "right" : "left", by: Math.round(Math.abs(delta)) };
}

/**
 * World Labs azimuths for ring photos: degrees clockwise from the first photo, rounded.
 * Without compass headings it falls back to the planned 45-degree steps.
 */
export function ringAzimuths(headings: readonly (number | null)[]): number[] {
  const first = headings[0];
  return headings.map((h, i) =>
    first == null || h == null
      ? normalizeDeg(i * RING_STEP_DEGREES)
      : Math.round(normalizeDeg(h - first)) % 360,
  );
}
