/**
 * Whole-home plan from per-spot walls (owner: Temuri, GH-18, D-009). Each spot world has its own
 * frame: the capture spot at the origin, azimuth 0 along -z (a link's direction is
 * (sin az, 0, -cos az)). A room's footprint is a rectangle around its spot, aligned with its
 * walls; rooms are placed by the spot graph: a link A -> B at azimuth az puts B along that
 * direction, so the two rectangles touch at the doorway, and the back link B -> A at az' turns B
 * by az + 180 - az'. Everything is meters on the floor plane, [x, z].
 */
import type { SpotLink } from "@/lib/schemas/world";
import type { Point2 } from "./slice";
import { rotatePoint, type Wall } from "./walls";

/** Where a spot's frame sits in another frame: rotate by `rot` (radians, x toward z), then move. */
export interface Pose {
  x: number;
  z: number;
  rot: number;
}

export const IDENTITY: Pose = { x: 0, z: 0, rot: 0 };

export function applyPose(pose: Pose, p: Point2): Point2 {
  const [x, z] = rotatePoint(p, pose.rot);
  return [x + pose.x, z + pose.z];
}

/** a after b: first b, then a. */
export function composePose(a: Pose, b: Pose): Pose {
  const [x, z] = applyPose(a, [b.x, b.z]);
  return { x, z, rot: a.rot + b.rot };
}

export function invertPose(pose: Pose): Pose {
  const [x, z] = rotatePoint([-pose.x, -pose.z], -pose.rot);
  return { x, z, rot: -pose.rot };
}

export function applyPoseToWall(pose: Pose, [x1, z1, x2, z2]: Wall): Wall {
  return [...applyPose(pose, [x1, z1]), ...applyPose(pose, [x2, z2])] as Wall;
}

const DEG = Math.PI / 180;

/** Unit direction of an azimuth in degrees: (sin az, -cos az) on [x, z]. */
export function azimuthDir(azDeg: number): Point2 {
  return [Math.sin(azDeg * DEG), -Math.cos(azDeg * DEG)];
}

/**
 * An azimuth turned by a pose rotation. The azimuth turns clockwise seen from above (+x toward
 * +z), the same sense as rotatePoint, so a direction at az in a frame posed with `rot` points
 * at az + rot (in degrees) in the outer frame.
 */
export function rotateAzimuth(azDeg: number, rot: number): number {
  return azDeg + rot / DEG;
}

/** A room footprint: a rectangle in the spot frame, axis-aligned after rotating by -angle. */
export interface Footprint {
  angle: number;
  /** Bounds in the straightened frame (rotatePoint(p, -angle)). The spot is inside. */
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export function footprintCorners(f: Footprint): Point2[] {
  return (
    [
      [f.minX, f.minZ],
      [f.maxX, f.minZ],
      [f.maxX, f.maxZ],
      [f.minX, f.maxZ],
    ] as Point2[]
  ).map((p) => rotatePoint(p, f.angle));
}

export function footprintCenter(f: Footprint): Point2 {
  return rotatePoint([(f.minX + f.maxX) / 2, (f.minZ + f.maxZ) / 2], f.angle);
}

/** First hit distance of a ray from `origin` along unit `dir` with the walls, or null. */
export function rayToWalls(walls: Wall[], origin: Point2, dir: Point2): number | null {
  let best: number | null = null;
  for (const [x1, z1, x2, z2] of walls) {
    const ex = x2 - x1;
    const ez = z2 - z1;
    const denom = dir[0] * ez - dir[1] * ex;
    if (Math.abs(denom) < 1e-12) continue;
    const ox = x1 - origin[0];
    const oz = z1 - origin[1];
    const t = (ox * ez - oz * ex) / denom;
    const u = (ox * dir[1] - oz * dir[0]) / denom;
    if (t > 1e-6 && u >= 0 && u <= 1 && (best === null || t < best)) best = t;
  }
  return best;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/**
 * The room around the spot: in each of the four wall directions, cast a fan of rays (+-25
 * degrees, every 5) from the spot and take the median distance to the first wall along that
 * axis. A doorway or a window on one side is outvoted by the wall around it. A side with no
 * walls falls back to `fallback` meters.
 */
export function roomFootprint(walls: Wall[], angle: number, fallback = 1.5): Footprint {
  const sides: number[] = [];
  for (let side = 0; side < 4; side++) {
    const base = angle + (side * Math.PI) / 2; // +x, +z, -x, -z in the straightened frame
    const hits: number[] = [];
    for (let k = -5; k <= 5; k++) {
      const a = base + k * 5 * DEG;
      const t = rayToWalls(walls, [0, 0], [Math.cos(a), Math.sin(a)]);
      // Project onto the side's axis: the distance to that wall's plane.
      if (t !== null) hits.push(t * Math.cos(k * 5 * DEG));
    }
    sides.push(median(hits) ?? fallback);
  }
  return { angle, maxX: sides[0], maxZ: sides[1], minX: -sides[2], minZ: -sides[3] };
}

/** Distance from inside the footprint (the spot frame origin) to its edge along `dir`. */
export function footprintExit(f: Footprint, dir: Point2): number {
  const [dx, dz] = rotatePoint(dir, -f.angle);
  const ts: number[] = [];
  if (dx > 1e-9) ts.push(f.maxX / dx);
  if (dx < -1e-9) ts.push(f.minX / dx);
  if (dz > 1e-9) ts.push(f.maxZ / dz);
  if (dz < -1e-9) ts.push(f.minZ / dz);
  return Math.max(0, Math.min(...ts));
}

/**
 * Walls kept for a room: those with both ends within `margin` of its footprint (walls of the
 * next room seen through a door are dropped), minus short pieces deep inside the room
 * (furniture sides): under `clutterLength` and more than `margin` from every footprint edge.
 */
export function clipWalls(walls: Wall[], f: Footprint, margin = 0.3, clutterLength = 0.6): Wall[] {
  const local = (p: Point2) => rotatePoint(p, -f.angle);
  const inside = ([x, z]: Point2, m: number) =>
    x >= f.minX - m && x <= f.maxX + m && z >= f.minZ - m && z <= f.maxZ + m;
  return walls.filter(([x1, z1, x2, z2]) => {
    const p = local([x1, z1]);
    const q = local([x2, z2]);
    if (!inside(p, margin) || !inside(q, margin)) return false;
    const deep = inside(p, -margin) && inside(q, -margin);
    return !deep || Math.hypot(x2 - x1, z2 - z1) >= clutterLength;
  });
}

export interface SpotRoom {
  spot: string;
  name: string;
  links: SpotLink[];
  footprint: Footprint;
}

export interface Placement {
  /** Spot frame -> home frame (the root spot's frame). */
  poses: Map<string, Pose>;
  /** Doorways in the home frame: the exit point of each placed link. */
  doors: { from: string; to: string; at: Point2 }[];
}

/** Gap kept between two rooms placed through a doorway: about a wall's thickness (meters). */
export const WALL_GAP = 0.12;

/** Bounds of a posed footprint in a frame turned by -axis (axis-aligned there when snapped). */
export function posedBounds(f: Footprint, pose: Pose, axis: number) {
  const pts = footprintCorners(f).map((p) => rotatePoint(applyPose(pose, p), -axis));
  return {
    minX: Math.min(...pts.map((p) => p[0])),
    maxX: Math.max(...pts.map((p) => p[0])),
    minZ: Math.min(...pts.map((p) => p[1])),
    maxZ: Math.max(...pts.map((p) => p[1])),
  };
}

type Bounds = ReturnType<typeof posedBounds>;

/** Overlap area of two bounds (0 when they only touch). */
export function overlapArea(a: Bounds, b: Bounds): number {
  const w = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
  const h = Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ);
  return w > 0 && h > 0 ? w * h : 0;
}

/** Angle in (-pi/4, pi/4]: the turn that brings `angle` onto the nearest multiple of 90 degrees. */
function quarterResidual(angle: number): number {
  return angle - Math.round(angle / (Math.PI / 2)) * (Math.PI / 2);
}

export interface PlaceOptions {
  /** Root spot (default: "entrance", else the spot with most links). */
  root?: string;
  /**
   * Turn every room so its walls run parallel to the root's (homes are mostly right-angled; link
   * azimuths are only accurate to some degrees). Default true.
   */
  manhattan?: boolean;
  /** Overlap (m2) a placed room may have with the others before it is pushed further out. */
  maxOverlap?: number;
}

/**
 * Places every room in the root's frame by walking the spot graph breadth first. A room that
 * lands on top of one already placed is pushed further along its link (10 cm steps, up to 4 m).
 * Unreachable rooms go in a row to the right.
 */
export function placeRooms(rooms: SpotRoom[], options: PlaceOptions = {}): Placement {
  const { root, manhattan = true, maxOverlap = 0.25 } = options;
  const bySpot = new Map(rooms.map((r) => [r.spot, r]));
  const start =
    (root && bySpot.has(root) && root) ||
    (bySpot.has("entrance") && "entrance") ||
    [...rooms].sort((a, b) => b.links.length - a.links.length)[0]?.spot;
  const poses = new Map<string, Pose>();
  const doors: Placement["doors"] = [];
  if (!start) return { poses, doors };
  poses.set(start, IDENTITY);
  const axis = bySpot.get(start)!.footprint.angle;
  const placedBounds = new Map<string, Bounds>([
    [start, posedBounds(bySpot.get(start)!.footprint, IDENTITY, axis)],
  ]);
  const queue = [start];
  while (queue.length > 0) {
    const a = bySpot.get(queue.shift()!)!;
    const poseA = poses.get(a.spot)!;
    for (const link of a.links) {
      const b = bySpot.get(link.to);
      if (!b || poses.has(b.spot)) continue;
      const back = b.links.find((l) => l.to === a.spot);
      const backAz = back ? back.azimuth : link.azimuth + 180;
      // B's frame turns so that its back link points opposite to the forward link...
      let rotB = poseA.rot + (link.azimuth + 180 - backAz) * DEG;
      // ...then onto the root's wall axes.
      if (manhattan) rotB -= quarterResidual(rotB + b.footprint.angle - axis);
      const homeAz = rotateAzimuth(link.azimuth, poseA.rot);
      const dir = azimuthDir(homeAz);
      const outA = footprintExit(a.footprint, azimuthDir(link.azimuth));
      // The way back to A in B's own frame.
      const inB = footprintExit(b.footprint, azimuthDir(homeAz + 180 - rotB / DEG));
      let dist = outA + WALL_GAP + inB;
      const poseAt = (d: number): Pose => ({
        x: poseA.x + dir[0] * d,
        z: poseA.z + dir[1] * d,
        rot: rotB,
      });
      const overlap = (d: number) => {
        const bounds = posedBounds(b.footprint, poseAt(d), axis);
        let total = 0;
        for (const other of placedBounds.values()) total += overlapArea(bounds, other);
        return total;
      };
      for (let push = 0; push < 40 && overlap(dist) > maxOverlap; push++) dist += 0.1;
      if (overlap(dist) > maxOverlap) dist = outA + WALL_GAP + inB; // no free spot: keep the door
      poses.set(b.spot, poseAt(dist));
      placedBounds.set(b.spot, posedBounds(b.footprint, poseAt(dist), axis));
      doors.push({
        from: a.spot,
        to: b.spot,
        at: [poseA.x + dir[0] * (outA + WALL_GAP / 2), poseA.z + dir[1] * (outA + WALL_GAP / 2)],
      });
      queue.push(b.spot);
    }
  }
  // Rooms the graph does not reach: a row to the right of everything placed.
  let right = 0;
  for (const r of rooms) {
    const pose = poses.get(r.spot);
    if (!pose) continue;
    for (const p of footprintCorners(r.footprint)) right = Math.max(right, applyPose(pose, p)[0]);
  }
  for (const r of rooms) {
    if (poses.has(r.spot)) continue;
    const f = r.footprint;
    const halfWidth = Math.max(f.maxX - f.minX, f.maxZ - f.minZ) / 2;
    poses.set(r.spot, { x: right + 1 + halfWidth, z: 0, rot: 0 });
    right += 1 + 2 * halfWidth;
  }
  return { poses, doors };
}
