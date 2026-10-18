/**
 * One floor plan per spot world, each holding the whole home in that spot's own frame (owner:
 * Temuri, GH-18). Walls, labels, polygons and doors are in the world's x/z meters, so the tour's
 * camera position (x, z) lands on the plan without any conversion: the minimap dot is the camera.
 * v2: each room is its closed wall outline around the spot (rooms.ts) with its area in m2; the
 * footprint rectangle still places the rooms and is the outline's fallback. Areas here are in
 * the 3D's own meters (Marble's metric scale); a host calibration scales them (calibrate.ts).
 */
import type { SpotLink } from "@/lib/schemas/world";
import {
  applyPose,
  applyPoseToWall,
  clipWalls,
  composePose,
  footprintCenter,
  footprintCorners,
  invertPose,
  placeRooms,
  roomFootprint,
  type Footprint,
  type Placement,
} from "./plan";
import { pointInPolygon, polygonCentroid, roomOutline, type RoomOutline } from "./rooms";
import type { Point2 } from "./slice";
import { rotatePoint, type Wall } from "./walls";

/** v1 does not measure door openings: doors carry this nominal width (meters). */
export const NOMINAL_DOOR_WIDTH = 0.8;

export interface SpotWalls {
  spot: string;
  /** Room name for labels and Jump to room (worlds.spot_label, else the spot key). */
  name: string;
  links: SpotLink[];
  /** Straight walls in the spot's frame (walls.ts). */
  walls: Wall[];
  /** Main wall angle in radians (walls.ts). */
  angle: number;
}

export interface PlanRoom {
  spot: string;
  name: string;
  label: Point2;
  /** The room's outline (v2), else its footprint rectangle. */
  polygon: Point2[];
  /** Floor area in the 3D's meters; null when the spot saw no walls at all. */
  area_m2: number | null;
}

export interface HomePlan {
  /** The spot whose frame this plan is in (its room is "you are here"). */
  spot: string;
  walls: Wall[];
  rooms: PlanRoom[];
  doors: { at: Point2; width_m: number }[];
}

export interface HomeLayout {
  footprints: Map<string, Footprint>;
  placement: Placement;
  /** Each room's walls, clipped to its footprint, in its own frame. */
  roomWalls: Map<string, Wall[]>;
  /** Each room's outline in its own frame (null: no walls and nothing to fall back on). */
  outlines: Map<string, RoomOutline | null>;
}

/**
 * Walls for the outline: everything the spot saw except short pieces deep inside the footprint
 * (furniture sides; the same rule as clipWalls). Walls of the next room stay: the doorway
 * between them is closed before the fill, so they never reach the region.
 */
export function outlineWalls(walls: Wall[], f: Footprint, margin = 0.3, clutterLength = 0.6) {
  const deep = (x: number, z: number) => {
    const [lx, lz] = rotatePoint([x, z], -f.angle);
    return (
      lx >= f.minX + margin &&
      lx <= f.maxX - margin &&
      lz >= f.minZ + margin &&
      lz <= f.maxZ - margin
    );
  };
  return walls.filter(
    ([x1, z1, x2, z2]) =>
      !(deep(x1, z1) && deep(x2, z2) && Math.hypot(x2 - x1, z2 - z1) < clutterLength),
  );
}

/** Footprints, clipped walls and placement of every spot in the root's frame. */
export function layoutHome(spots: SpotWalls[]): HomeLayout {
  const footprints = new Map<string, Footprint>();
  const roomWalls = new Map<string, Wall[]>();
  const outlines = new Map<string, RoomOutline | null>();
  for (const s of spots) {
    const footprint = roomFootprint(s.walls, s.angle);
    footprints.set(s.spot, footprint);
    roomWalls.set(s.spot, clipWalls(s.walls, footprint));
    outlines.set(
      s.spot,
      s.walls.length === 0
        ? null
        : roomOutline(outlineWalls(s.walls, footprint), s.angle, { fallback: footprint }),
    );
  }
  const placement = placeRooms(
    spots.map((s) => ({
      spot: s.spot,
      name: s.name,
      links: s.links,
      footprint: footprints.get(s.spot)!,
    })),
  );
  return { footprints, placement, roomWalls, outlines };
}

const round = (n: number) => Math.round(n * 1000) / 1000 + 0; // + 0 turns -0 into 0
const roundPoint = ([x, z]: Point2): Point2 => [round(x), round(z)];
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Label point: the outline's centroid when it lies inside (not for every L), else the footprint's centre. */
function labelPoint(polygon: Point2[] | null, f: Footprint): Point2 {
  if (polygon) {
    const c = polygonCentroid(polygon);
    if (pointInPolygon(c, polygon)) return c;
  }
  return footprintCenter(f);
}

/** The whole home in `target`'s frame. */
export function planInSpotFrame(spots: SpotWalls[], layout: HomeLayout, target: string): HomePlan {
  const { footprints, placement, roomWalls, outlines } = layout;
  const toTarget = invertPose(placement.poses.get(target)!);
  const walls: Wall[] = [];
  const rooms: PlanRoom[] = [];
  for (const s of spots) {
    const pose = composePose(toTarget, placement.poses.get(s.spot)!);
    const footprint = footprints.get(s.spot)!;
    for (const w of roomWalls.get(s.spot)!) {
      walls.push(applyPoseToWall(pose, w).map(round) as Wall);
    }
    const outline = outlines.get(s.spot) ?? null;
    const local = outline?.polygon ?? footprintCorners(footprint);
    rooms.push({
      spot: s.spot,
      name: s.name,
      label: roundPoint(applyPose(pose, labelPoint(outline?.polygon ?? null, footprint))),
      polygon: local.map((p) => roundPoint(applyPose(pose, p))),
      area_m2: outline ? round2(outline.area_m2) : null,
    });
  }
  const doors = placement.doors.map((d) => ({
    at: roundPoint(applyPose(toTarget, d.at)),
    width_m: NOMINAL_DOOR_WIDTH,
  }));
  return { spot: target, walls, rooms, doors };
}

/** One plan per spot, each in that spot's frame. */
export function buildHomePlans(spots: SpotWalls[]): HomePlan[] {
  if (spots.length === 0) return [];
  const layout = layoutHome(spots);
  return spots.map((s) => planInSpotFrame(spots, layout, s.spot));
}
