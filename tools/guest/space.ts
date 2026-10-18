/**
 * Ask the space (GH-20, Beka): tools the guest agent uses to show a place in the 3D tour.
 * Each tool returns `{ ok, summary, action, honestyNote? }`; the panel runs `action` through
 * useTour(). Code, not the model, checks that the anchor, room or fact exists and decides the
 * honesty note, so the agent can't point at, or vouch for, something this home doesn't have.
 */
import { tool } from "ai";
import { z } from "zod";
import type { TourAction } from "@/components/tour-ext/actions";
import type { Anchor, Gap, Vec3 } from "@/lib/schemas/world";

/** An anchor this close (x/z, meters) to an AI-filled gap of the same world gets the note. */
export const HONESTY_RADIUS_M = 1.5;
export const HONESTY_NOTE = "That area is partly AI-filled; the host hasn't filmed it yet.";

export interface SpaceSpot {
  worldId: string;
  spot: string;
  label: string | null;
}

export interface SpaceFact {
  key: string;
  value: string | number | boolean;
  confidence: number;
}

/** Everything the agent may talk about in one version of one home (all of its spots). */
export interface Space {
  listingId: string;
  listingTitle: string;
  version: number;
  /** The spot the guest stands in now, when the panel knows it. */
  currentWorldId: string | null;
  spots: SpaceSpot[];
  anchors: Anchor[];
  /** All gaps of these worlds; only `open` and `requested` count as AI-filled. */
  gaps: Gap[];
  facts: SpaceFact[];
}

export type SpaceToolResult =
  | {
      ok: true;
      summary: string;
      action: TourAction;
      /** What the guest sees in the answer, for the model to say. */
      shown: string;
      honestyNote?: string;
    }
  | { ok: false; summary: string; error: string };

export function isAiFilled(gap: Gap): boolean {
  return gap.status === "open" || gap.status === "requested";
}

/** Floor-plane distance in meters (height ignored: a gap on the floor still counts). */
export function distanceXZ(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/**
 * The AI-filled gap of the anchor's own world nearest to the anchor (where the camera stands
 * or what it looks at), if it is within HONESTY_RADIUS_M. Coordinates of other worlds mean
 * nothing here (D-009), so gaps of other spots never count.
 */
export function nearbyGap(anchor: Anchor, gaps: Gap[]): Gap | null {
  const points = anchor.look_at ? [anchor.position, anchor.look_at] : [anchor.position];
  let best: { gap: Gap; d: number } | null = null;
  for (const gap of gaps) {
    if (gap.world_id !== anchor.world_id || !isAiFilled(gap) || !gap.position) continue;
    const d = Math.min(...points.map((p) => distanceXZ(p, gap.position!)));
    if (d <= HONESTY_RADIUS_M && (!best || d < best.d)) best = { gap, d };
  }
  return best?.gap ?? null;
}

export function honestyNoteForAnchor(anchor: Anchor, gaps: Gap[]): string | undefined {
  return nearbyGap(anchor, gaps) ? HONESTY_NOTE : undefined;
}

const norm = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, " ");

/** By id; or by name when exactly one anchor has it (models sometimes pass the name). */
export function findAnchor(space: Space, idOrName: string): Anchor | null {
  const byId = space.anchors.find((a) => a.id === idOrName.trim());
  if (byId) return byId;
  const named = space.anchors.filter((a) => norm(a.name) === norm(idOrName));
  return named.length === 1 ? named[0] : null;
}

/** Room names the tour knows: anchor rooms, room anchors and spot labels. */
export function knownRooms(space: Space): string[] {
  const rooms = new Map<string, string>();
  const add = (name: string | null | undefined) => {
    if (name?.trim() && !rooms.has(norm(name))) rooms.set(norm(name), name.trim());
  };
  for (const a of space.anchors) {
    add(a.room);
    if (a.kind === "room") add(a.name);
  }
  for (const s of space.spots) add(s.label);
  return [...rooms.values()];
}

export function findRoom(space: Space, name: string): string | null {
  return knownRooms(space).find((r) => norm(r) === norm(name)) ?? null;
}

/** A fact by key; "fact:washer" works too. */
export function findFact(space: Space, factKey: string): SpaceFact | null {
  const key = factKey.trim().replace(/^fact:/, "");
  return space.facts.find((f) => f.key === key) ?? null;
}

function spotLabel(space: Space, worldId: string): string | null {
  const spot = space.spots.find((s) => s.worldId === worldId);
  return spot ? (spot.label ?? spot.spot) : null;
}

/** "the desk", "the Kitchen", for feed lines and answers. */
function anchorLabel(anchor: Anchor): string {
  return anchor.kind === "room" ? anchor.name : `the ${anchor.name}`;
}

function describeAnchor(space: Space, anchor: Anchor): string {
  const where = anchor.room ?? spotLabel(space, anchor.world_id);
  return where && norm(where) !== norm(anchor.name)
    ? `${anchorLabel(anchor)} (${where})`
    : anchorLabel(anchor);
}

const UNKNOWN_ANCHOR =
  "No anchor with that id in this home. Use an id from the anchors list, or say you can't see one.";

export function flyTo(space: Space, guestName: string, anchorId: string): SpaceToolResult {
  const anchor = findAnchor(space, anchorId);
  if (!anchor)
    return {
      ok: false,
      summary: "Guest agent looked for a spot this home doesn't have",
      error: UNKNOWN_ANCHOR,
    };
  return {
    ok: true,
    summary: `Guest agent showed ${guestName} ${anchorLabel(anchor)}`,
    action: { type: "fly_to", anchorId: anchor.id },
    shown: describeAnchor(space, anchor),
    ...withNote(honestyNoteForAnchor(anchor, space.gaps)),
  };
}

export function lookToward(space: Space, guestName: string, anchorId: string): SpaceToolResult {
  const anchor = findAnchor(space, anchorId);
  if (!anchor)
    return {
      ok: false,
      summary: "Guest agent looked for a spot this home doesn't have",
      error: UNKNOWN_ANCHOR,
    };
  // In another spot, runTourAction moves there instead of aiming across worlds (D-009).
  return {
    ok: true,
    summary: `Guest agent turned ${guestName} toward ${anchorLabel(anchor)}`,
    action: { type: "look_toward", anchorId: anchor.id },
    shown: describeAnchor(space, anchor),
    ...withNote(honestyNoteForAnchor(anchor, space.gaps)),
  };
}

export function highlightRoom(space: Space, guestName: string, name: string): SpaceToolResult {
  const room = findRoom(space, name);
  if (!room)
    return {
      ok: false,
      summary: "Guest agent looked for a room this home doesn't have",
      error: `No room called "${name}" in this home. Rooms: ${knownRooms(space).join(", ") || "none"}.`,
    };
  const roomGap = space.gaps.some((g) => isAiFilled(g) && g.room && norm(g.room) === norm(room));
  return {
    ok: true,
    summary: `Guest agent highlighted the ${room} for ${guestName}`,
    action: { type: "highlight_room", room },
    shown: room,
    ...withNote(roomGap ? HONESTY_NOTE : undefined),
  };
}

export function showFact(space: Space, guestName: string, factKey: string): SpaceToolResult {
  const fact = findFact(space, factKey);
  if (!fact)
    return {
      ok: false,
      summary: "Guest agent looked for a fact this home doesn't have",
      error: "No fact with that key in this home. Use a key from the facts list.",
    };
  return {
    ok: true,
    summary: `Guest agent showed ${guestName} the checked fact "${fact.key.replaceAll("_", " ")}"`,
    action: { type: "show_fact", key: fact.key, value: fact.value },
    shown: `${fact.key}: ${String(fact.value)}`,
  };
}

function withNote(note: string | undefined): { honestyNote?: string } {
  return note ? { honestyNote: note } : {};
}

/** What the model reads about the home: short, ids for anchors, no coordinates. */
export function spaceCard(space: Space) {
  const notes = new Map(space.anchors.map((a) => [a.id, honestyNoteForAnchor(a, space.gaps)]));
  return {
    current_spot: space.currentWorldId ? spotLabel(space, space.currentWorldId) : null,
    spots: space.spots.map((s) => s.label ?? s.spot),
    anchors: space.anchors.map((a) => ({
      id: a.id,
      name: a.name,
      kind: a.kind,
      room: a.room ?? spotLabel(space, a.world_id),
      in_current_spot: a.world_id === space.currentWorldId,
      near_ai_filled_area: Boolean(notes.get(a.id)),
    })),
    ai_filled_areas: space.gaps.filter(isAiFilled).map((g) => ({
      room: g.room ?? spotLabel(space, g.world_id),
      description: g.description,
    })),
    facts: space.facts.map((f) => ({ key: f.key, value: f.value })),
  };
}

/** The four Ask-the-space tools over one loaded home. */
export function spaceTools(space: Space, guestName: string) {
  return {
    fly_to: tool({
      description:
        "Move the guest to the room spot that holds this anchor and turn the camera to it. Use for anything outside the current spot.",
      inputSchema: z.object({ anchorId: z.string().describe("an id from the anchors list") }),
      execute: async ({ anchorId }) => flyTo(space, guestName, anchorId),
    }),
    look_toward: tool({
      description:
        "Turn the camera toward an anchor without moving. Best for anchors in the current spot.",
      inputSchema: z.object({ anchorId: z.string().describe("an id from the anchors list") }),
      execute: async ({ anchorId }) => lookToward(space, guestName, anchorId),
    }),
    highlight_room: tool({
      description: "Highlight a room on the minimap and in the scene.",
      inputSchema: z.object({ room: z.string().describe("a room name from the anchors or spots") }),
      execute: async ({ room }) => highlightRoom(space, guestName, room),
    }),
    show_fact: tool({
      description: "Show a fact the Verifier checked in the photos as a chip under the answer.",
      inputSchema: z.object({ factKey: z.string().describe("a key from the facts list") }),
      execute: async ({ factKey }) => showFact(space, guestName, factKey),
    }),
  };
}

/** Safe tool inputs for the public feed (D-024): ids, room names and fact keys only. */
export const SPACE_LOG_INPUTS = {
  fly_to: ["anchorId"],
  look_toward: ["anchorId"],
  highlight_room: ["room"],
  show_fact: ["factKey"],
};
