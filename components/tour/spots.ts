/**
 * Pure logic of the per-spot tour (GH-11, D-009): which worlds make up the tour, where a
 * doorway arrow points, how the camera arrives in a room and how far it may move.
 * Units are three.js meters after marbleToThree (lib/geometry/frame.ts): +y up, floor at 0,
 * the spot's capture camera above the origin, azimuth 0 = the world's forward (-z).
 */
import type { Anchor, Gap, SpotLink, Vec3, World } from "@/lib/schemas/world";

/** Eye height at a spot, meters above the floor (splat-tour-viewer skill). */
export const EYE_HEIGHT = 1.5;
/** How far the camera may leave its spot: Marble worlds blur further out (GH-3). */
export const MAX_OFFSET_M = 1;
/** Doorway rays are cast this high above the floor. */
export const RAY_HEIGHT = 1;
/** An arrow sits this far before the wall or doorway frame the ray hits. */
export const ARROW_BEFORE_HIT_M = 0.5;
export const ARROW_MIN_M = 0.8;
export const ARROW_MAX_M = 3;
/** Arrow distance when the ray hits nothing (open plan, or no collider). */
export const ARROW_DEFAULT_M = 2;
/** Hits on surfaces steeper than this |normal.y| are floors, ceilings or tables, not walls. */
export const WALL_MAX_NORMAL_Y = 0.6;
/** Ignore hits closer than this: the capture camera's own floaters. */
export const MIN_WALL_HIT_M = 0.3;
/** The camera looks this much below the horizon when it arrives (radians): arrows are on the floor. */
export const ARRIVAL_PITCH = -0.14;

const DEG = Math.PI / 180;

/** Normalizes degrees to [0, 360). */
export function normalizeDeg(deg: number): number {
  const d = deg % 360;
  return d < 0 ? d + 360 : d;
}

/** Unit direction on the floor plane for an azimuth: (sin az, 0, -cos az). */
export function azimuthDirection(azimuthDeg: number): Vec3 {
  const a = azimuthDeg * DEG;
  return { x: Math.sin(a), y: 0, z: -Math.cos(a) };
}

/** Inverse of azimuthDirection for any horizontal direction (y is ignored). */
export function directionAzimuth(dir: Vec3): number {
  return normalizeDeg(Math.atan2(dir.x, -dir.z) / DEG);
}

/** Where the camera stands at a spot. */
export function spotEye(): Vec3 {
  return { x: 0, y: EYE_HEIGHT, z: 0 };
}

/**
 * Direction to face when arriving at `target` from `fromSpot`: into the room, i.e. the
 * target's doorway back to where we came from, turned 180 degrees. Without such a link
 * (Jump to room, first load), the world's forward (the first ring photo).
 */
export function arrivalAzimuth(target: Pick<World, "links">, fromSpot: string | null): number {
  const back = fromSpot ? target.links.find((l) => l.to === fromSpot) : undefined;
  return back ? normalizeDeg(back.azimuth + 180) : 0;
}

/** A look direction with pitch (radians, negative = down) from an azimuth. */
export function lookDirection(azimuthDeg: number, pitch = 0): Vec3 {
  const flat = azimuthDirection(azimuthDeg);
  const c = Math.cos(pitch);
  return { x: flat.x * c, y: Math.sin(pitch), z: flat.z * c };
}

/** Keeps a point within MAX_OFFSET_M of the spot horizontally and at a sane height. */
export function clampToSpot(p: Vec3, maxOffset = MAX_OFFSET_M): Vec3 {
  const r = Math.hypot(p.x, p.z);
  const k = r > maxOffset ? maxOffset / r : 1;
  return { x: p.x * k, y: Math.min(Math.max(p.y, 0.5), 2.2), z: p.z * k };
}

export interface RayHit {
  distance: number;
  /** y component of the hit face's unit normal. */
  normalY: number;
}

/**
 * Distance from the spot to a doorway arrow along its ray: just before the first wall-like
 * hit, clamped so arrows are neither under the camera nor in the next room.
 */
export function arrowDistance(hits: RayHit[]): number {
  const wall = hits
    .filter((h) => h.distance >= MIN_WALL_HIT_M && Math.abs(h.normalY) <= WALL_MAX_NORMAL_Y)
    .sort((a, b) => a.distance - b.distance)[0];
  if (!wall) return ARROW_DEFAULT_M;
  return Math.min(ARROW_MAX_M, Math.max(ARROW_MIN_M, wall.distance - ARROW_BEFORE_HIT_M));
}

export interface DoorwayArrow {
  to: string;
  label: string;
  azimuth: number;
  /** On the floor (y = 0). */
  position: Vec3;
  /** Unit direction the arrow points along. */
  direction: Vec3;
}

/** Arrow positions for a spot's links, given each link's hit distance along its ray. */
export function placeArrows(
  links: SpotLink[],
  labels: Map<string, string>,
  distanceFor: (link: SpotLink, direction: Vec3) => number,
): DoorwayArrow[] {
  return links
    .filter((l) => labels.has(l.to))
    .map((link) => {
      const direction = azimuthDirection(link.azimuth);
      const d = distanceFor(link, direction);
      return {
        to: link.to,
        label: labels.get(link.to)!,
        azimuth: link.azimuth,
        position: { x: direction.x * d, y: 0, z: direction.z * d },
        direction,
      };
    });
}

/** "Kitchen" for a spot row, falling back to the spot key with a capital. */
export function spotLabel(world: Pick<World, "spot" | "spot_label">): string {
  if (world.spot_label) return world.spot_label;
  return world.spot.charAt(0).toUpperCase() + world.spot.slice(1).replace(/[-_]/g, " ");
}

const VIEWABLE = new Set<World["status"]>(["ready", "published", "archived"]);

/** A world row can be shown when it has a splat in our storage. */
export function isViewable(world: World, storageOrigin: string | null): boolean {
  return VIEWABLE.has(world.status) && servedFromOurStorage(world.spz_url, storageOrigin);
}

/**
 * True when a URL points at our Supabase storage. The viewer loads nothing else, so a page
 * view can never reach World Labs (CLAUDE.md hard rule).
 */
export function servedFromOurStorage(url: string | null, storageOrigin: string | null): boolean {
  if (!url || !storageOrigin) return false;
  try {
    const u = new URL(url);
    const origin = new URL(storageOrigin);
    return u.origin === origin.origin && u.pathname.startsWith("/storage/v1/object/public/");
  } catch {
    return false;
  }
}

export interface TourVersion {
  version: number;
  worlds: World[];
  /** Spot to start at. */
  entrySpot: string;
  preview: boolean;
}

/**
 * Picks the version to show from all of a listing's world rows: `?version=n` when given
 * (host preview), else the version of the listing's published entry world, else the newest
 * version with a published row. Only viewable rows count. The entry spot is the published
 * world's spot when it is in that version, else the spot most other spots link to.
 */
export function pickTourVersion(
  rows: World[],
  opts: { version?: number | null; publishedWorldId: string | null; storageOrigin: string | null },
): TourVersion | null {
  const viewable = rows.filter((w) => isViewable(w, opts.storageOrigin));
  const published = opts.publishedWorldId
    ? viewable.find((w) => w.id === opts.publishedWorldId)
    : undefined;
  let version: number | undefined;
  if (opts.version != null) version = opts.version;
  else if (published) version = published.version;
  else {
    const versions = viewable.filter((w) => w.status === "published").map((w) => w.version);
    if (versions.length) version = Math.max(...versions);
  }
  if (version === undefined) return null;
  const worlds = viewable
    .filter((w) => w.version === version)
    .sort((a, b) => a.spot.localeCompare(b.spot));
  if (worlds.length === 0) return null;
  const entry =
    published && published.version === version
      ? published.spot
      : (worlds.find((w) => w.spot === published?.spot)?.spot ?? hubSpot(worlds));
  return {
    version,
    worlds,
    entrySpot: entry,
    preview: opts.version != null && published?.version !== version,
  };
}

/** The spot with the most links (the hall), ties broken by order. */
export function hubSpot(worlds: Pick<World, "spot" | "links">[]): string {
  return [...worlds].sort((a, b) => b.links.length - a.links.length)[0].spot;
}

/** Spots one doorway away, for preloading. */
export function neighbourSpots(
  world: Pick<World, "links">,
  worlds: Pick<World, "spot">[],
): string[] {
  const known = new Set(worlds.map((w) => w.spot));
  return [...new Set(world.links.map((l) => l.to))].filter((s) => known.has(s));
}

/** AI-filled means the gap is still open or the host was asked to re-shoot it (D-031, GH-21). */
export function isAiFilled(gap: Pick<Gap, "status">): boolean {
  return gap.status === "open" || gap.status === "requested";
}

export type RoomBadge = "real" | "partly-ai";

/** "Built from real footage" unless the current spot has an AI-filled gap. */
export function roomBadge(gaps: Pick<Gap, "status">[]): RoomBadge {
  return gaps.some(isAiFilled) ? "partly-ai" : "real";
}

/**
 * Where the camera goes for an anchor in its own spot: the eye is pulled back within reach
 * of the spot; it looks at `look_at`, or along its saved direction for a room's default view.
 */
export function anchorView(anchor: Pick<Anchor, "position" | "look_at">): {
  eye: Vec3;
  target: Vec3;
} {
  const eye = clampToSpot(anchor.position);
  if (anchor.look_at) return { eye, target: anchor.look_at };
  // No target: look the way the anchor's eye is offset from the spot, else straight ahead.
  const r = Math.hypot(anchor.position.x, anchor.position.z);
  const dir =
    r > 0.05 ? { x: anchor.position.x / r, y: 0, z: anchor.position.z / r } : azimuthDirection(0);
  return { eye, target: { x: eye.x + dir.x, y: eye.y, z: eye.z + dir.z } };
}

/** The anchor to start at: the `?anchor=` id if it belongs to the tour, else none. */
export function startAnchor(anchors: Anchor[], worlds: Pick<World, "id">[], id: string | null) {
  if (!id) return null;
  const ids = new Set(worlds.map((w) => w.id));
  return anchors.find((a) => a.id === id && ids.has(a.world_id)) ?? null;
}
