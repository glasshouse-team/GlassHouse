import { describe, expect, it } from "vitest";
import type { PlacedGap } from "./gap-findings";
import { falseGaps, foundNear, MEASURED_HERO2, targetMet, voteGaps, writeGate } from "./gap-vote";

const gap = (
  x: number,
  severity = 2,
  issue: PlacedGap["issue"] = "invented",
  viewId = "v4",
): PlacedGap => ({
  viewId,
  viewIds: [viewId],
  issue,
  description: `gap at ${x} s${severity}`,
  severity,
  dir: { x: -1, y: 0, z: 0 },
  position: { x, y: 1.4, z: 0 },
});

const KNOWN = { x: -1.02, y: 1.2, z: 0 };

describe("voteGaps", () => {
  it("keeps a gap found by 2 of 3 runs within 1 m, drops one found once", () => {
    const voted = voteGaps([[gap(-1.0), gap(3)], [gap(-1.3)], []]);
    expect(voted).toHaveLength(1);
    expect(voted[0].runs).toEqual([0, 1]);
    expect(voted[0].position).toEqual({ x: -1.15, y: 1.4, z: 0 });
  });

  it("does not count two gaps of the same run as two votes", () => {
    expect(voteGaps([[gap(-1.0), gap(-1.2)], [], []])).toEqual([]);
  });

  it("does not join gaps further apart than 1 m", () => {
    expect(voteGaps([[gap(0)], [gap(1.5)], [gap(3)]])).toEqual([]);
  });

  it("takes the most common issue, the median severity and the most severe description", () => {
    const [v] = voteGaps([
      [gap(-1, 3, "invented", "v4")],
      [gap(-1.1, 1, "smeared", "v5")],
      [gap(-0.9, 2, "invented", "v4")],
    ]);
    expect(v.issue).toBe("invented");
    expect(v.severity).toBe(2);
    expect(v.description).toBe("gap at -1 s3");
    expect(v.viewIds).toEqual(["v4", "v5"]);
    expect(v.runs).toEqual([0, 1, 2]);
  });

  it("with one run and minVotes 1 keeps every gap", () => {
    expect(voteGaps([[gap(0), gap(3)]], { minVotes: 1 })).toHaveLength(2);
  });

  it("puts the gaps with most votes first", () => {
    const voted = voteGaps([[gap(5), gap(-1)], [gap(5.2), gap(-1.1)], [gap(-1.05)]]);
    expect(voted.map((v) => v.runs.length)).toEqual([3, 2]);
  });
});

describe("evaluation", () => {
  it("finds the known gap within 1 m (3D distance)", () => {
    expect(foundNear([gap(-1.017)], KNOWN)).toBe(true);
    expect(foundNear([gap(0.5)], KNOWN)).toBe(false);
    expect(foundNear([], KNOWN)).toBe(false);
  });

  it("counts false gaps of severity 2+ away from the known gap", () => {
    const gaps = [gap(-1.0, 3), gap(2.5, 2), gap(4, 1)];
    expect(falseGaps(gaps, [KNOWN]).map((g) => g.position.x)).toEqual([2.5]);
    expect(falseGaps(gaps).map((g) => g.position.x)).toEqual([-1.0, 2.5]);
  });

  it("meets the target only with the wall in 3 of 3 and at most 1 false gap on v2", () => {
    expect(targetMet({ knownFound: 3, evaluations: 3, maxFalseGapsV2: 1 })).toBe(true);
    expect(targetMet({ knownFound: 2, evaluations: 3, maxFalseGapsV2: 0 })).toBe(false);
    expect(targetMet({ knownFound: 3, evaluations: 3, maxFalseGapsV2: 2 })).toBe(false);
    expect(targetMet({ knownFound: 1, evaluations: 1, maxFalseGapsV2: 0 })).toBe(false);
  });
});

describe("writeGate", () => {
  const good = { knownFound: 3, evaluations: 3, maxFalseGapsV2: 0 };
  it("refuses without a measured evaluation or one below target", () => {
    expect(writeGate(null, []).ok).toBe(false);
    expect(writeGate({ ...good, knownFound: 2 }, []).ok).toBe(false);
  });
  it("refuses a pass that missed the known wall", () => {
    expect(writeGate(good, [{ missedKnown: false }, { missedKnown: true }]).ok).toBe(false);
    expect(writeGate(good, [{ missedKnown: false }])).toEqual({ ok: true });
  });
  it("matches the recorded measurement", () => {
    expect(writeGate(MEASURED_HERO2, []).ok).toBe(
      MEASURED_HERO2 !== null && targetMet(MEASURED_HERO2),
    );
  });
});
