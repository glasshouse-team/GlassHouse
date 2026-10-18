import { describe, expect, it } from "vitest";
import {
  type CoverageWorld,
  coverageExplanation,
  coveragePercent,
  formatCoverage,
  publishedCoverage,
} from "./coverage";

const L = "listing-1";
let n = 0;
function world(over: Partial<CoverageWorld>): CoverageWorld {
  n += 1;
  return {
    id: `w${n}`,
    listing_id: L,
    version: 1,
    spot: "kitchen",
    status: "ready",
    coverage_score: null,
    ...over,
  };
}

describe("publishedCoverage", () => {
  it("is null without a published world", () => {
    expect(publishedCoverage(null, [world({ coverage_score: 0.9 })])).toBeNull();
    expect(publishedCoverage("missing", [world({ coverage_score: 0.9 })])).toBeNull();
  });

  it("averages the spots of the published version (D-009)", () => {
    const entry = world({ spot: "living", status: "published", coverage_score: 0.9 });
    const worlds = [
      entry,
      world({ spot: "kitchen", status: "published", coverage_score: 0.6 }),
      world({ spot: "bedroom", status: "published", coverage_score: 0.9 }),
      // Another listing and an archived older version do not count.
      world({ listing_id: "other", spot: "kitchen", coverage_score: 0.1 }),
      world({ version: 0, spot: "bath", status: "archived", coverage_score: 0.1 }),
    ];
    const coverage = publishedCoverage(entry.id, worlds);
    expect(coverage).toMatchObject({ scoredSpots: 3, totalSpots: 3 });
    expect(coverage?.score).toBeCloseTo(0.8);
    // Float means like 0.7999999999999999 still read as 80%.
    expect(formatCoverage(coverage?.score ?? 0)).toBe("80% filmed");
  });

  it("follows the published version after a fill-in (v2 copies the other spots)", () => {
    const v1 = [
      world({ spot: "living", status: "archived", coverage_score: 0.9 }),
      world({ spot: "kitchen", status: "archived", coverage_score: 0.5 }),
    ];
    const v2Entry = world({ version: 2, spot: "living", status: "published", coverage_score: 0.9 });
    const v2 = [
      v2Entry,
      world({ version: 2, spot: "kitchen", status: "published", coverage_score: 0.95 }),
    ];
    expect(publishedCoverage(v1[0].id, [...v1, ...v2])?.score).toBeCloseTo(0.7);
    expect(publishedCoverage(v2Entry.id, [...v1, ...v2])?.score).toBeCloseTo(0.925);
    expect(publishedCoverage(v2Entry.id, [...v1, ...v2])?.totalSpots).toBe(2);
  });

  it("skips spots the gap check has not scored yet, null when none is", () => {
    const entry = world({ spot: "living", status: "published", coverage_score: null });
    const kitchen = world({ spot: "kitchen", status: "published", coverage_score: 0.7 });
    expect(publishedCoverage(entry.id, [entry, kitchen])).toEqual({
      score: 0.7,
      scoredSpots: 1,
      totalSpots: 2,
    });
    expect(publishedCoverage(entry.id, [entry])).toBeNull();
  });
});

describe("formatCoverage", () => {
  it("rounds down to whole percent", () => {
    expect(formatCoverage(0.92)).toBe("92% filmed");
    expect(formatCoverage(0.999)).toBe("99% filmed");
    expect(formatCoverage(0.29)).toBe("29% filmed");
    expect(formatCoverage(1)).toBe("100% filmed");
    expect(formatCoverage(0)).toBe("0% filmed");
  });

  it("clamps out-of-range scores", () => {
    expect(coveragePercent(1.2)).toBe(100);
    expect(coveragePercent(-0.1)).toBe(0);
  });
});

describe("coverageExplanation", () => {
  it("says what the number means, and that it is an average over rooms", () => {
    expect(coverageExplanation({ score: 0.92, scoredSpots: 1, totalSpots: 1 })).toMatch(
      /^92% of what the 3D tour shows was filmed by the host/,
    );
    expect(coverageExplanation({ score: 0.8, scoredSpots: 5, totalSpots: 5 })).toMatch(
      /Average over all 5 rooms/,
    );
    expect(coverageExplanation({ score: 0.8, scoredSpots: 3, totalSpots: 5 })).toMatch(
      /the 3 of 5 rooms checked so far/,
    );
  });
});
