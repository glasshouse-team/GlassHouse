import { describe, expect, it } from "vitest";
import { GapSchema } from "@/lib/schemas/world";
import {
  HERO2_KITCHEN_V1,
  HERO2_LISTING_ID,
  azimuthToDirection,
  coverageUpdates,
  hitPoint,
  knownGapKey,
  knownGapRow,
  planKnownGap,
  ringAzimuth,
  ringCoverage,
} from "./known-gap";

const WORLD = "e1a36976-df7f-4015-8770-879c2c0eb03b";

describe("ringAzimuth", () => {
  it("turns 45 deg per photo of an 8-photo ring", () => {
    expect(ringAzimuth(0)).toBe(0);
    expect(ringAzimuth(6)).toBe(270);
    expect(ringAzimuth(7)).toBe(315);
    expect(ringAzimuth(8)).toBe(0);
  });

  it("puts the skipped photos 1019 and 1020 at 270 and 315 deg", () => {
    expect(HERO2_KITCHEN_V1.missingPositions.map((p) => ringAzimuth(p))).toEqual([270, 315]);
  });
});

describe("azimuthToDirection", () => {
  it("follows the doorway-arrow convention (sin az, 0, -cos az)", () => {
    expect(azimuthToDirection(0)).toEqual({ x: 0, y: 0, z: -1 });
    expect(azimuthToDirection(90)).toEqual({ x: 1, y: 0, z: 0 });
    expect(azimuthToDirection(180)).toEqual({ x: 0, y: 0, z: 1 });
    expect(azimuthToDirection(270)).toEqual({ x: -1, y: 0, z: 0 });
  });

  it("returns a unit vector", () => {
    const d = azimuthToDirection(292.5);
    expect(Math.hypot(d.x, d.y, d.z)).toBeCloseTo(1, 9);
  });
});

describe("ringCoverage", () => {
  it("is the share of ring photos used", () => {
    expect(ringCoverage(8, 2)).toBe(0.75);
    expect(ringCoverage(8, 0)).toBe(1);
  });

  it("rejects impossible counts", () => {
    expect(() => ringCoverage(0, 0)).toThrow();
    expect(() => ringCoverage(8, 9)).toThrow();
    expect(() => ringCoverage(8, -1)).toThrow();
  });
});

describe("knownGapRow", () => {
  it("places the gap where the ray hits, at ray height, looking along the ray", () => {
    const row = knownGapRow(HERO2_KITCHEN_V1, WORLD, 1.0234);
    expect(row.position).toEqual({ x: -1.023, y: 1.2, z: 0 });
    expect(row.view_dir).toEqual({ x: -1, y: 0, z: 0 });
    expect(row).toMatchObject({
      world_id: WORLD,
      room: "Kitchen",
      issue: "invented",
      severity: 3,
      radius_m: 0.7,
      status: "open",
      screenshot_url: null,
    });
  });

  it("is a valid gap row", () => {
    const row = knownGapRow(HERO2_KITCHEN_V1, WORLD, 1);
    const parsed = GapSchema.safeParse({
      ...row,
      id: "00000000-0000-4000-8000-000000000001",
      filled_by_capture: null,
    });
    expect(parsed.success).toBe(true);
  });

  it("rounds the hit point to millimetres", () => {
    expect(hitPoint({ ...HERO2_KITCHEN_V1, azimuth: 0 }, 2.00049)).toEqual({ x: 0, y: 1.2, z: -2 });
  });
});

describe("idempotency", () => {
  const row = knownGapRow(HERO2_KITCHEN_V1, WORLD, 1);
  const stored = { ...row, id: "g1" };

  it("keys on world, issue and room, not the wording", () => {
    expect(knownGapKey(row)).toBe(`${WORLD}|invented|Kitchen`);
    expect(knownGapKey({ ...row, description: "Reworded." } as typeof row)).toBe(knownGapKey(row));
  });

  it("inserts only when the key is new", () => {
    expect(planKnownGap(row, [])).toEqual({ kind: "insert", row });
    expect(planKnownGap(row, [{ ...stored, world_id: "other" }])).toEqual({ kind: "insert", row });
    expect(planKnownGap(row, [{ ...stored, room: "Bedroom" }])).toEqual({ kind: "insert", row });
  });

  it("changes nothing when the stored row matches, whatever its status", () => {
    expect(planKnownGap(row, [{ ...stored, status: "requested" }])).toEqual({
      kind: "none",
      id: "g1",
    });
    // Positions read back from jsonb within half a millimetre count as equal.
    const nudged = { ...stored, position: { x: -1.0002, y: 1.2, z: 0 } };
    expect(planKnownGap(row, [nudged]).kind).toBe("none");
  });

  it("updates the one row when the radius or wording changed", () => {
    const old = { ...stored, radius_m: 1, description: "Old wording." };
    expect(planKnownGap(row, [old])).toEqual({
      kind: "update",
      id: "g1",
      changes: { radius_m: 0.7, description: HERO2_KITCHEN_V1.description },
    });
  });
});

describe("coverageUpdates", () => {
  const w = (id: string, version: number, spot: string, coverage_score: number | null) => ({
    id,
    listing_id: HERO2_LISTING_ID,
    version,
    spot,
    coverage_score,
  });

  it("scores kitchen v1 from its ring and every other hero-2 spot 1.0", () => {
    const updates = coverageUpdates([
      w("k1", 1, "kitchen", null),
      w("e1", 1, "entrance", null),
      w("k2", 2, "kitchen", null),
      w("e2", 2, "entrance", null),
    ]);
    expect(Object.fromEntries(updates.map((u) => [u.id, u.coverage_score]))).toEqual({
      k1: 0.75,
      e1: 1,
      k2: 1,
      e2: 1,
    });
  });

  it("skips rows that already hold the score and other listings", () => {
    expect(
      coverageUpdates([
        w("k1", 1, "kitchen", 0.75),
        w("k2", 2, "kitchen", 1),
        { ...w("x", 1, "kitchen", null), listing_id: "00000000-0000-4000-8000-0000000000b1" },
      ]),
    ).toEqual([]);
  });

  it("fixes a wrong stored score", () => {
    expect(coverageUpdates([w("k1", 1, "kitchen", 0.5)])).toEqual([
      { id: "k1", spot: "kitchen", version: 1, coverage_score: 0.75 },
    ]);
  });
});
