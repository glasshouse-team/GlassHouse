/**
 * One floor plan per spot world, each holding the whole home in that spot's own frame (owner:
 * Temuri, GH-18). Walls, labels, polygons and doors are in the world's x/z meters, so the tour's
 * camera position (x, z) lands on the plan without any conversion: the minimap dot is the camera.
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
import type { Point2 } from "./slice";
import type { Wall } from "./walls";

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
  /** v1: the room's footprint rectangle, four corners. */
  polygon: Point2[];
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
}

/** Footprints, clipped walls and placement of every spot in the root's frame. */
export function layoutHome(spots: SpotWalls[]): HomeLayout {
  const footprints = new Map<string, Footprint>();
  const roomWalls = new Map<string, Wall[]>();
  for (const s of spots) {
    const footprint = roomFootprint(s.walls, s.angle);
    footprints.set(s.spot, footprint);
    roomWalls.set(s.spot, clipWalls(s.walls, footprint));
  }
  const placement = placeRooms(
    spots.map((s) => ({
      spot: s.spot,
      name: s.name,
      links: s.links,
      footprint: footprints.get(s.spot)!,
    })),
  );
  return { footprints, placement, roomWalls };
}

const round = (n: number) => Math.round(n * 1000) / 1000 + 0; // + 0 turns -0 into 0
const roundPoint = ([x, z]: Point2): Point2 => [round(x), round(z)];

/** The whole home in `target`'s frame. */
export function planInSpotFrame(spots: SpotWalls[], layout: HomeLayout, target: string): HomePlan {
  const { footprints, placement, roomWalls } = layout;
  const toTarget = invertPose(placement.poses.get(target)!);
  const walls: Wall[] = [];
  const rooms: PlanRoom[] = [];
  for (const s of spots) {
    const pose = composePose(toTarget, placement.poses.get(s.spot)!);
    const footprint = footprints.get(s.spot)!;
    for (const w of roomWalls.get(s.spot)!) {
      walls.push(applyPoseToWall(pose, w).map(round) as Wall);
    }
    rooms.push({
      spot: s.spot,
      name: s.name,
      label: roundPoint(applyPose(pose, footprintCenter(footprint))),
      polygon: footprintCorners(footprint).map((p) => roundPoint(applyPose(pose, p))),
      area_m2: null,
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
