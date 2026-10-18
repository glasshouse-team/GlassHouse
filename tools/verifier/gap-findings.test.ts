import { describe, expect, it } from "vitest";
import type { GapCheckResult } from "@/lib/schemas/verifier";
import {
  gapCandidates,
  mergeGaps,
  missingViews,
  placeAlongRay,
  viewCoverage,
} from "./gap-findings";
import { directionAzimuth, viewSpecs } from "./gap-views";

const views = viewSpecs();

const result: GapCheckResult = {
  views: [
    { view_id: "v0", issue: "none", description: "ok", bbox: null, severity: null },
    {
      view_id: "v4",
      issue: "invented",
      description: " A door that is not there. ",
      bbox: { x: 0.5, y: 0, w: 0.5, h: 1 },
      severity: 3,
    },
    { view_id: "v5", issue: "blank", description: "no box", bbox: null, severity: 2 },
    {
      view_id: "v9",
      issue: "blank",
      description: "unknown view",
      bbox: { x: 0, y: 0, w: 1, h: 1 },
      severity: 2,
    },
  ],
  objects: [],
};

describe("gapCandidates", () => {
  it("makes one ray per finding with an issue, a box and a known view", () => {
    const c = gapCandidates(result, views);
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ viewId: "v4", issue: "invented", severity: 3 });
    expect(c[0].description).toBe("A door that is not there.");
    // v4 looks at 240 deg; the box centre is a quarter of the view right of centre.
    const expected = 240 + (Math.atan(0.5) * 180) / Math.PI;
    expect(directionAzimuth(c[0].dir)).toBeCloseTo(expected, 6);
    expect(c[0].dir.y).toBeCloseTo(0, 9);
  });
});

describe("placeAlongRay", () => {
  it("uses the hit distance, or 2 m on a miss", () => {
    const o = { x: 0, y: 1.5, z: 0 };
    const d = { x: -1, y: 0, z: 0 };
    expect(placeAlongRay(o, d, 1.0204)).toEqual({ x: -1.02, y: 1.5, z: 0 });
    expect(placeAlongRay(o, d, null)).toEqual({ x: -2, y: 1.5, z: 0 });
  });
});

describe("mergeGaps", () => {
  const base = { issue: "invented" as const, description: "d", dir: { x: 1, y: 0, z: 0 } };
  it("merges gaps within 1 m into the most severe one", () => {
    const merged = mergeGaps([
      { ...base, viewId: "v4", severity: 2, position: { x: 0, y: 1, z: 0 } },
      { ...base, viewId: "v5", severity: 3, position: { x: 0.6, y: 1, z: 0 } },
      { ...base, viewId: "v1", severity: 2, position: { x: 3, y: 1, z: 0 } },
    ]);
    expect(merged).toHaveLength(2);
    expect(merged[0]).toMatchObject({ viewId: "v5", severity: 3, viewIds: ["v5", "v4"] });
    expect(merged[1].viewIds).toEqual(["v1"]);
  });
});

describe("viewCoverage", () => {
  it("is the share of views without an issue", () => {
    // Only v0 is answered and clean; v1-v3 are missing, v4 and v5 flagged, v9 is ignored.
    expect(viewCoverage(result, views)).toBeCloseTo(1 / 6, 9);
    const allClean = views.map((v) => ({
      view_id: v.id,
      issue: "none" as const,
      description: "ok",
      bbox: null,
      severity: null,
    }));
    expect(viewCoverage({ views: allClean, objects: [] }, views)).toBe(1);
    expect(viewCoverage({ views: [], objects: [] }, views)).toBe(0);
    expect(viewCoverage(result, [])).toBeNull();
  });

  it("lists the views the model did not answer", () => {
    expect(missingViews(result, views)).toEqual(["v1", "v2", "v3"]);
  });
});
