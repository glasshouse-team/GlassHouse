import { describe, expect, it } from "vitest";
import {
  gapTourHref,
  groupGapTasks,
  recordNowHref,
  recordNowLabel,
  severityLabel,
  type GapTaskGap,
  type GapTaskWorld,
} from "./gap-tasks";

const L = "11111111-1111-4111-8111-111111111111";

function world(
  id: string,
  version: number,
  spot: string,
  status: string,
  coverage_score: number | null,
): GapTaskWorld {
  return {
    id,
    listing_id: L,
    version,
    spot,
    spot_label: spot[0].toUpperCase() + spot.slice(1),
    status,
    coverage_score,
  };
}

function gap(id: string, world_id: string, severity: number, status = "open"): GapTaskGap {
  return { id, world_id, room: null, description: `gap ${id}`, severity, status };
}

// Hero 2 after `pnpm demo:reset`: v1 (kitchen 6/8 photos) is live, v2 is complete and ready.
const worlds = [
  world("v1-kitchen", 1, "kitchen", "published", 0.75),
  world("v1-living", 1, "living", "published", 1),
  world("v2-kitchen", 2, "kitchen", "ready", 1),
  world("v2-living", 2, "living", "ready", 1),
];

describe("groupGapTasks", () => {
  it("puts the published version first with its open gaps by room and its mean coverage", () => {
    const out = groupGapTasks(L, worlds, [gap("a", "v1-kitchen", 3)], "v1-kitchen");
    expect(out.map((v) => [v.version, v.published])).toEqual([
      [1, true],
      [2, false],
    ]);
    expect(out[0].coverage?.score).toBeCloseTo(0.875);
    expect(out[0].rooms).toEqual([
      {
        spot: "kitchen",
        room: "Kitchen",
        gaps: [gap("a", "v1-kitchen", 3)],
        href: `/tour/${L}?version=1&spot=kitchen`,
      },
    ]);
    expect(out[1].rooms).toEqual([]);
    expect(out[1].coverage?.score).toBe(1);
  });

  it("drops filled and dismissed gaps, keeps requested ones, sorts most severe first", () => {
    const out = groupGapTasks(
      L,
      worlds,
      [
        gap("low", "v1-kitchen", 1),
        gap("done", "v1-kitchen", 3, "filled"),
        gap("no", "v1-living", 2, "dismissed"),
        gap("asked", "v1-kitchen", 2, "requested"),
      ],
      "v1-kitchen",
    );
    expect(out[0].rooms).toHaveLength(1);
    expect(out[0].rooms[0].gaps.map((g) => g.id)).toEqual(["asked", "low"]);
  });

  it("uses the gap's own room name when it has one", () => {
    const out = groupGapTasks(
      L,
      worlds,
      [{ ...gap("a", "v2-living", 2), room: "Living room" }],
      "v1-kitchen",
    );
    expect(out[1].rooms[0].room).toBe("Living room");
    expect(out[1].rooms[0].href).toBe(`/tour/${L}?version=2&spot=living`);
  });

  it("hides archived and failed versions but never the published one", () => {
    const rows = [
      world("old", 1, "kitchen", "archived", 0.5),
      world("bad", 2, "kitchen", "failed", null),
      world("live", 3, "kitchen", "published", 1),
    ];
    expect(groupGapTasks(L, rows, [], "live").map((v) => v.version)).toEqual([3]);
    // Without a published version, newest first.
    const ready = [world("a", 1, "kitchen", "ready", 1), world("b", 2, "kitchen", "ready", 1)];
    expect(groupGapTasks(L, ready, [], null).map((v) => v.version)).toEqual([2, 1]);
  });

  it("ignores gaps on worlds of another listing or not in the list", () => {
    const other = { ...world("x", 1, "kitchen", "published", 1), listing_id: "other" };
    const out = groupGapTasks(
      L,
      [...worlds, other],
      [gap("a", "x", 3), gap("b", "missing", 3)],
      "v1-kitchen",
    );
    expect(out.flatMap((v) => v.rooms)).toEqual([]);
  });

  it("has no coverage when no spot is scored", () => {
    const out = groupGapTasks(L, [world("a", 1, "kitchen", "ready", null)], [], null);
    expect(out[0].coverage).toBeNull();
  });
});

describe("gapTourHref and severityLabel", () => {
  it("encodes the spot and names severities", () => {
    expect(gapTourHref(L, 2, "living room")).toBe(`/tour/${L}?version=2&spot=living%20room`);
    expect([1, 2, 3, 4].map(severityLabel)).toEqual(["Minor", "Noticeable", "Major", "Severity 4"]);
  });
});

describe("Record now", () => {
  it("links to the phone capture page in fill-in mode for that gap", () => {
    const gapId = "22222222-2222-4222-8222-222222222222";
    expect(recordNowHref(L, gapId)).toBe(`/host/capture/${L}?gap=${gapId}`);
    expect(recordNowHref("a b", "c&d")).toBe("/host/capture/a%20b?gap=c%26d");
  });

  it("reads Record again once the re-shoot was started", () => {
    expect(recordNowLabel("open")).toBe("Record now");
    expect(recordNowLabel("requested")).toBe("Record again");
  });
});
