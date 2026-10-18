import { describe, expect, it } from "vitest";
import type { Anchor } from "@/lib/schemas/world";
import {
  excerpt,
  fanAzimuth,
  firstName,
  PIN_PULL,
  PIN_STACK_M,
  placePins,
  resolvePin,
  ROOM_PIN_DISTANCE_M,
  ROOM_PIN_HEIGHT_M,
  type ReviewPin,
} from "./review-pins";

const W1 = "00000000-0000-4000-8000-000000000001";
const W2 = "00000000-0000-4000-8000-000000000002";

const anchor = (over: Partial<Anchor>): Anchor => ({
  id: "a",
  world_id: W1,
  name: "x",
  kind: "object",
  room: null,
  position: { x: 0, y: 1.5, z: 0 },
  look_at: null,
  source: "manual",
  ...over,
});

const desk = anchor({
  id: "desk-v1",
  name: "desk with ultrawide monitor",
  room: "Living room",
  position: { x: 0.4, y: 1.5, z: -0.6 },
  look_at: { x: 1.4, y: 1.0, z: -2.6 },
});
const living = anchor({ id: "living-v1", name: "Living room", kind: "room", room: "Living room" });
const bath = anchor({
  id: "bath-v1",
  world_id: W2,
  name: "Bathroom",
  kind: "room",
  room: "Bathroom",
});
const anchors = [desk, living, bath];

const pin = (over: Partial<ReviewPin>): ReviewPin => ({
  id: "c1",
  claim: "real desk with big ultrawide monitor",
  sentiment: "positive",
  room: "Living room",
  anchorId: "desk-v1",
  anchorName: "desk with ultrawide monitor",
  anchorRoom: "Living room",
  author: "Tamar",
  review: "Quiet flat and a real desk.",
  ...over,
});

describe("firstName and excerpt", () => {
  it("keeps the reviewer's first name", () => {
    expect(firstName("Tamar Beridze")).toBe("Tamar");
    expect(firstName("  ")).toBe("Guest");
    expect(firstName(null)).toBe("Guest");
  });

  it("cuts long reviews at a word", () => {
    expect(excerpt("short  review ")).toBe("short review");
    const long = "word ".repeat(100);
    const cut = excerpt(long, 50);
    expect(cut.length).toBeLessThanOrEqual(50);
    expect(cut.endsWith("word…")).toBe(true);
  });
});

describe("resolvePin", () => {
  it("uses the stored anchor id when it is in this version", () => {
    expect(resolvePin(pin({}), anchors)?.id).toBe("desk-v1");
  });

  it("finds the same anchor in another version by name and room", () => {
    const v2Desk = { ...desk, id: "desk-v2", world_id: W2 };
    expect(resolvePin(pin({}), [v2Desk])?.id).toBe("desk-v2");
  });

  it("falls back to the room anchor when the anchor is gone", () => {
    expect(
      resolvePin(pin({ anchorId: null, anchorName: null, anchorRoom: null }), anchors)?.id,
    ).toBe("living-v1");
    expect(
      resolvePin(pin({ anchorId: "deleted", anchorName: "sofa", anchorRoom: "Bathroom" }), anchors)
        ?.id,
    ).toBe("bath-v1");
  });

  it("pins neutral claims too, and skips claims with no anchor and no room", () => {
    expect(resolvePin(pin({ sentiment: "neutral" }), anchors)?.id).toBe("desk-v1");
    expect(
      resolvePin(pin({ anchorId: null, anchorName: null, anchorRoom: null, room: null }), anchors),
    ).toBeNull();
  });
});

describe("fanAzimuth", () => {
  it("alternates around straight ahead", () => {
    expect([0, 1, 2, 3, 4].map((i) => fanAzimuth(i, 30))).toEqual([0, 30, -30, 60, -60]);
  });
});

describe("placePins", () => {
  it("puts an object claim just in front of the surface the anchor looks at", () => {
    const [p] = placePins([pin({})], anchors);
    const t = desk.look_at!;
    const e = desk.position;
    expect(p.worldId).toBe(W1);
    expect(p.position.x).toBeCloseTo(t.x + (e.x - t.x) * PIN_PULL, 3);
    expect(p.position.y).toBeCloseTo(t.y + (e.y - t.y) * PIN_PULL, 3);
    expect(p.position.z).toBeCloseTo(t.z + (e.z - t.z) * PIN_PULL, 3);
  });

  it("stacks several claims on one anchor upward", () => {
    const [a, b] = placePins([pin({ id: "c1" }), pin({ id: "c2" })], anchors);
    expect(b.position.x).toBe(a.position.x);
    expect(b.position.z).toBe(a.position.z);
    expect(b.position.y - a.position.y).toBeCloseTo(PIN_STACK_M, 3);
  });

  it("fans room claims around the room's default view, per world", () => {
    const room = { anchorId: "bath-v1", anchorName: "Bathroom", anchorRoom: "Bathroom" };
    const placed = placePins(
      [
        pin({ id: "b1", ...room }),
        pin({ id: "b2", ...room }),
        pin({ id: "l1", anchorId: "living-v1", anchorName: "Living room" }),
      ],
      anchors,
    );
    const [b1, b2, l1] = placed;
    // Straight ahead is (0, 0, -1) (azimuth 0).
    expect(b1.position).toEqual({ x: 0, y: ROOM_PIN_HEIGHT_M, z: -ROOM_PIN_DISTANCE_M });
    expect(Math.hypot(b2.position.x, b2.position.z)).toBeCloseTo(ROOM_PIN_DISTANCE_M, 2);
    expect(b2.position.x).toBeGreaterThan(0); // +35 degrees: to the right
    // The living room's fan starts over: its first claim is straight ahead too.
    expect(l1.worldId).toBe(W1);
    expect(l1.position).toEqual({ x: 0, y: ROOM_PIN_HEIGHT_M, z: -ROOM_PIN_DISTANCE_M });
  });

  it("drops claims it cannot place", () => {
    expect(
      placePins(
        [pin({ anchorId: null, anchorName: null, anchorRoom: null, room: "garden" })],
        anchors,
      ),
    ).toEqual([]);
    expect(placePins([pin({})], [])).toEqual([]);
  });
});
