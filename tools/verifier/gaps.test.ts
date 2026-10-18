import { describe, expect, it } from "vitest";
import type { PlacedGap } from "./gap-findings";
import { isKnownGapRow, photosForSpot, planGapWrite } from "./gaps";
import { HERO2_KITCHEN_V1 } from "./known-gap";

const known = {
  id: "known",
  issue: "invented",
  room: "Kitchen",
  description: HERO2_KITCHEN_V1.description,
  status: "open",
  position: { x: -1.02, y: 1.2, z: 0 },
};

const found = (severity: number, x: number): PlacedGap => ({
  viewId: "v4",
  viewIds: ["v4"],
  issue: "invented",
  description: "A door that is not there.",
  severity,
  dir: { x: -1, y: 0, z: 0 },
  position: { x, y: 1.4, z: 0 },
});

describe("planGapWrite", () => {
  it("never deletes the known gap or a gap a host acted on, and replaces old automatic gaps", () => {
    const plan = planGapWrite(
      [
        known,
        {
          id: "req",
          issue: "blank",
          room: "Kitchen",
          description: "x",
          status: "requested",
          position: null,
        },
        {
          id: "old",
          issue: "blank",
          room: "Kitchen",
          description: "y",
          status: "open",
          position: null,
        },
      ],
      [],
      "Kitchen",
      [HERO2_KITCHEN_V1],
    );
    expect(plan.deleteIds).toEqual(["old"]);
    expect(plan.keep.map((g) => g.id)).toEqual(["known", "req"]);
  });

  it("skips findings near a kept gap and below severity 2", () => {
    const plan = planGapWrite(
      [{ ...known, status: "requested" }],
      [found(3, -1.0), found(2, 2.5), found(1, 4)],
      "Kitchen",
    );
    expect(plan.insert.map((g) => g.position.x)).toEqual([2.5]);
  });

  it("adds no second row with the known gap's (issue, room) key in its world", () => {
    const smeared = { ...found(2, 3), issue: "smeared" as const };
    const plan = planGapWrite([known], [found(2, 3), smeared], "Kitchen", [HERO2_KITCHEN_V1]);
    expect(plan.insert.map((g) => g.issue)).toEqual(["smeared"]);
  });

  it("recognises the known gap by issue and room in a known-gap world only", () => {
    expect(isKnownGapRow(known, [HERO2_KITCHEN_V1])).toBe(true);
    expect(isKnownGapRow({ ...known, room: "Bedroom" }, [HERO2_KITCHEN_V1])).toBe(false);
    expect(isKnownGapRow(known, [])).toBe(false);
  });
});

describe("photosForSpot", () => {
  const photos = [
    { room_label: "living room", sort: 2 },
    { room_label: "kitchen", sort: 7 },
    { room_label: "kitchen", sort: 6 },
    { room_label: null, sort: 1 },
    { room_label: "living room", sort: 1 },
  ];
  it("matches the room label to the spot key or label, in photo order", () => {
    expect(photosForSpot(photos, "kitchen", "Kitchen").map((p) => p.sort)).toEqual([6, 7]);
    expect(photosForSpot(photos, "living", "Living room").map((p) => p.sort)).toEqual([1, 2]);
    expect(photosForSpot(photos, "bedroom", "Bedroom")).toEqual([]);
    expect(photosForSpot(photos, "living", "Living room", 1)).toHaveLength(1);
  });
});
