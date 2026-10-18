/**
 * Review pins in the tour (GH-24): which anchor of the shown version each review claim sits
 * at, and where its label goes in the room. Pure: tested in review-pins.test.ts; rendered by
 * ReviewPins.tsx. Units are meters, floor at y = 0 (lib/geometry/frame.ts).
 */
import { z } from "zod";
import { ClaimSentiment } from "@/lib/schemas/verifier";
import type { Anchor, Vec3 } from "@/lib/schemas/world";
import { roomKey } from "@/lib/geometry/room-names";
import { azimuthDirection, clampToSpot } from "./spots";

/** One claim as the tour page loads it (components/tour/data.ts). */
export const ReviewPinSchema = z.object({
  id: z.string(),
  claim: z.string(),
  sentiment: ClaimSentiment,
  /** The room the claim is about, as stored. */
  room: z.string().nullable(),
  /** The anchor the split pinned it to (in the version published at split time). */
  anchorId: z.string().nullable(),
  anchorName: z.string().nullable(),
  anchorRoom: z.string().nullable(),
  /** Reviewer's first name. */
  author: z.string(),
  /** The source review, cut to REVIEW_EXCERPT_CHARS. */
  review: z.string(),
});
export type ReviewPin = z.infer<typeof ReviewPinSchema>;

export interface PlacedPin {
  pin: ReviewPin;
  anchor: Anchor;
  worldId: string;
  position: Vec3;
}

export const REVIEW_EXCERPT_CHARS = 220;
/** Labels of object claims sit this share of the way from the surface back to the eye. */
export const PIN_PULL = 0.15;
/** Several claims on one anchor stack upward this far apart. */
export const PIN_STACK_M = 0.24;
/** Room claims (no object) float this far from the spot at this height, fanned out. */
export const ROOM_PIN_DISTANCE_M = 1.2;
export const ROOM_PIN_HEIGHT_M = 1.35;
/** Fan step between room claims, degrees: 0, +35, -35, +70, -70... */
export const ROOM_PIN_FAN_DEG = 35;

/** "Tamar Beridze" -> "Tamar"; empty -> "Guest". */
export function firstName(name: string | null | undefined): string {
  const first = (name ?? "").trim().split(/\s+/)[0];
  return first || "Guest";
}

/** The review cut at a word to at most `max` characters. */
export function excerpt(text: string, max = REVIEW_EXCERPT_CHARS): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

const same = (a: string | null | undefined, b: string | null | undefined) =>
  (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();

/**
 * The anchor of the shown version a claim belongs to. Anchors differ per world version, so:
 * the stored anchor id if it is in this version, else an anchor with the same name and room,
 * else the room's own anchor. Neutral claims are pinned too, in grey ("the bathroom is
 * compact" is worth seeing where it is; D-046).
 */
export function resolvePin(pin: ReviewPin, anchors: Anchor[]): Anchor | null {
  if (pin.anchorId) {
    const byId = anchors.find((a) => a.id === pin.anchorId);
    if (byId) return byId;
  }
  if (pin.anchorName) {
    const byName = anchors.find(
      (a) => same(a.name, pin.anchorName) && same(a.room, pin.anchorRoom),
    );
    if (byName) return byName;
  }
  const key = roomKey(pin.anchorRoom) ?? roomKey(pin.room);
  if (key === null) return null;
  return (
    anchors.find((a) => a.kind === "room" && (roomKey(a.room) ?? roomKey(a.name)) === key) ?? null
  );
}

/** i-th slot of the fan: 0, +step, -step, +2 step, -2 step... */
export function fanAzimuth(i: number, step = ROOM_PIN_FAN_DEG): number {
  if (i === 0) return 0;
  const k = Math.ceil(i / 2);
  return i % 2 === 1 ? k * step : -k * step;
}

const round = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Where each label goes. An anchor with a look_at (an object): just in front of the surface it
 * looks at, stacked upward when several claims share it. An anchor without (a room): fanned
 * around the room's default view (azimuth 0, which is what anchorView looks at), one slot each.
 */
export function placePins(pins: ReviewPin[], anchors: Anchor[]): PlacedPin[] {
  const stack = new Map<string, number>();
  const fan = new Map<string, number>();
  const placed: PlacedPin[] = [];
  for (const pin of pins) {
    const anchor = resolvePin(pin, anchors);
    if (!anchor) continue;
    let p: Vec3;
    if (anchor.look_at) {
      const k = stack.get(anchor.id) ?? 0;
      stack.set(anchor.id, k + 1);
      const t = anchor.look_at;
      const e = anchor.position;
      p = {
        x: t.x + (e.x - t.x) * PIN_PULL,
        y: t.y + (e.y - t.y) * PIN_PULL + k * PIN_STACK_M,
        z: t.z + (e.z - t.z) * PIN_PULL,
      };
    } else {
      const j = fan.get(anchor.world_id) ?? 0;
      fan.set(anchor.world_id, j + 1);
      const eye = clampToSpot(anchor.position);
      const d = azimuthDirection(fanAzimuth(j));
      p = {
        x: eye.x + d.x * ROOM_PIN_DISTANCE_M,
        y: ROOM_PIN_HEIGHT_M,
        z: eye.z + d.z * ROOM_PIN_DISTANCE_M,
      };
    }
    placed.push({
      pin,
      anchor,
      worldId: anchor.world_id,
      position: { x: round(p.x), y: round(p.y), z: round(p.z) },
    });
  }
  return placed;
}
