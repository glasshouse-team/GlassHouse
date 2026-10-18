/**
 * Pure glue between the tour's spots and the GH-18 floor plans (GH-11): which spot `?spot=`
 * opens, which plan room is "you are here", and which spot a tapped room leads to. The plan's
 * room names come from `spot_label`, else the spot key (D-040).
 */
import type { StoredPlan } from "@/components/floorplan/data";
import type { World } from "@/lib/schemas/world";
import { spotLabel } from "./spots";

/** Floor plan per world id (components/floorplan/data.ts rows), as the page hands them over. */
export type TourPlans = Record<string, StoredPlan>;

type SpotRow = Pick<World, "spot" | "spot_label">;

const norm = (s: string) => s.trim().toLowerCase();

function matches(world: SpotRow, name: string): boolean {
  const n = norm(name);
  return (
    norm(world.spot) === n ||
    norm(spotLabel(world)) === n ||
    (world.spot_label !== null && norm(world.spot_label) === n)
  );
}

/**
 * The spot of `?spot=<spot>` (FloorPlanCard links that way), or null when it is missing or not a
 * spot of this tour version. Accepts the spot key or its room name, any case.
 */
export function spotFromSearch(
  value: string | string[] | undefined,
  worlds: SpotRow[],
): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || !raw.trim()) return null;
  const exact = worlds.find((w) => w.spot === raw);
  if (exact) return exact.spot;
  return worlds.find((w) => matches(w, raw))?.spot ?? null;
}

/** The spot a plan room belongs to, or null (a room the tour has no world for). */
export function roomSpot(roomName: string, worlds: SpotRow[]): string | null {
  const byKey = worlds.find((w) => (w.spot_label ?? w.spot) === roomName);
  if (byKey) return byKey.spot;
  return worlds.find((w) => matches(w, roomName))?.spot ?? null;
}

/** The plan room of a spot: its name as drawn on the plan, or null if the plan lacks it. */
export function spotRoom(world: SpotRow, rooms: { name: string }[]): string | null {
  const exact = rooms.find((r) => r.name === (world.spot_label ?? world.spot));
  if (exact) return exact.name;
  return rooms.find((r) => matches(world, r.name))?.name ?? null;
}

/**
 * The room to light up: highlightRoom(name) from the tour (a spot key, or a free name), else
 * the current spot's room.
 */
export function highlightedPlanRoom(
  highlighted: string | null,
  current: SpotRow,
  worlds: SpotRow[],
  rooms: { name: string }[],
): string | null {
  if (highlighted) {
    const world = worlds.find((w) => w.spot === highlighted || matches(w, highlighted));
    const room = world
      ? spotRoom(world, rooms)
      : rooms.find((r) => norm(r.name) === norm(highlighted))?.name;
    if (room) return room;
  }
  return spotRoom(current, rooms);
}
