/**
 * Object anchors placed from a direction (owner: Temuri, GH-11). Pure: given the spot's
 * azimuth to an object (degrees clockwise from the spot's first ring photo, as in
 * docs/hero-worlds.json) and how far a ray from the spot centre travelled before it hit the
 * collider, work out where the camera stands and what it looks at. Units are three.js meters
 * after marbleToThree (floor y = 0, spot centre above x = z = 0); azimuth az points along
 * (sin az, 0, -cos az).
 */
import type { Vec3 } from "@/lib/schemas/world";

const DEG = Math.PI / 180;

/** Eye height of an object anchor's camera (same as the floor plan's room anchors). */
export const ANCHOR_EYE_HEIGHT = 1.6;
/** How far the camera stands back from the object, toward the spot centre. */
export const ANCHOR_BACKOFF_M = 1.5;
/** The viewer keeps the camera within this of the spot (components/tour/spots MAX_OFFSET_M). */
export const ANCHOR_MAX_OFFSET_M = 1;
/** Hits closer than this are the capture camera's own floaters, not the object. */
export const MIN_OBJECT_HIT_M = 0.25;

/** How to aim at one object from its spot. */
export interface AnchorAim {
  /** Degrees clockwise from the spot's first ring photo. */
  azimuth: number;
  /** Height of the ray's origin above the spot centre, meters. */
  rayHeight: number;
  /** Ray pitch in degrees, negative = down (aim at a table top or a cooktop). */
  pitch?: number;
}

/** Unit ray direction for an azimuth and pitch: (sin az cos p, sin p, -cos az cos p). */
export function aimDirection(azimuthDeg: number, pitchDeg = 0): Vec3 {
  const a = azimuthDeg * DEG;
  const p = pitchDeg * DEG;
  return { x: Math.sin(a) * Math.cos(p), y: Math.sin(p), z: -Math.cos(a) * Math.cos(p) };
}

/** The ray's origin for an aim: above the spot centre. */
export function aimOrigin(aim: AnchorAim): Vec3 {
  return { x: 0, y: aim.rayHeight, z: 0 };
}

/** Nearest hit distance at or beyond `min`, or null when the ray hit nothing solid. */
export function firstHit(distances: number[], min = MIN_OBJECT_HIT_M): number | null {
  const valid = distances.filter((d) => Number.isFinite(d) && d >= min);
  return valid.length ? Math.min(...valid) : null;
}

/** Millimetres; `|| 0` turns -0 into 0 so stored JSON stays clean. */
const round3 = (n: number) => Math.round(n * 1000) / 1000 || 0;
const r3 = (v: Vec3): Vec3 => ({ x: round3(v.x), y: round3(v.y), z: round3(v.z) });

/**
 * The anchor for an aim whose ray hit the collider `hitDistance` meters out: `look_at` is the
 * hit point; `position` stands `backoff` meters back from it toward the spot centre on the
 * floor plane, at eye height, never behind the centre and never further out than `maxOffset`
 * (the viewer would pull it back anyway).
 */
export function anchorFromHit(
  aim: AnchorAim,
  hitDistance: number,
  {
    backoff = ANCHOR_BACKOFF_M,
    eyeHeight = ANCHOR_EYE_HEIGHT,
    maxOffset = ANCHOR_MAX_OFFSET_M,
  }: { backoff?: number; eyeHeight?: number; maxOffset?: number } = {},
): { position: Vec3; look_at: Vec3 } {
  const dir = aimDirection(aim.azimuth, aim.pitch ?? 0);
  const origin = aimOrigin(aim);
  const look_at = {
    x: origin.x + dir.x * hitDistance,
    y: origin.y + dir.y * hitDistance,
    z: origin.z + dir.z * hitDistance,
  };
  const flat = aimDirection(aim.azimuth, 0);
  const reach = Math.hypot(look_at.x, look_at.z);
  const s = Math.min(maxOffset, Math.max(0, reach - backoff));
  return { position: r3({ x: flat.x * s, y: eyeHeight, z: flat.z * s }), look_at: r3(look_at) };
}
