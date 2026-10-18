import { describe, expect, it } from "vitest";
import { accelMagnitude, averageLuma, currentWarnings, qualityFlags } from "./warnings";

describe("averageLuma", () => {
  it("averages Rec. 709 luminance", () => {
    const white = new Uint8ClampedArray([255, 255, 255, 255, 255, 255, 255, 255]);
    expect(averageLuma(white)).toBeCloseTo(255);
    const mixed = new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255]);
    expect(averageLuma(mixed)).toBeCloseTo(127.5);
    expect(averageLuma(new Uint8ClampedArray([]))).toBe(0);
  });

  it("weights green most", () => {
    const green = averageLuma([0, 255, 0, 255]);
    const blue = averageLuma([0, 0, 255, 255]);
    expect(green).toBeGreaterThan(blue);
  });
});

describe("accelMagnitude", () => {
  it("handles missing axes", () => {
    expect(accelMagnitude({ x: 3, y: 4, z: null })).toBe(5);
    expect(accelMagnitude({})).toBe(0);
  });
});

describe("currentWarnings", () => {
  it("warns on fast turns, dark frames and shakes", () => {
    expect(currentWarnings({ turnRate: 90, luma: 20, shakePeak: 6 })).toEqual([
      "too_fast",
      "too_dark",
      "shaky",
    ]);
  });

  it("stays quiet within limits", () => {
    expect(currentWarnings({ turnRate: 30, luma: 120, shakePeak: 1 })).toEqual([]);
  });

  it("never warns about a missing sensor", () => {
    expect(currentWarnings({ turnRate: null, luma: null, shakePeak: null })).toEqual([]);
    expect(currentWarnings({})).toEqual([]);
  });
});

describe("qualityFlags", () => {
  it("keeps warnings that were on often enough", () => {
    const history = [
      ["too_dark"],
      ["too_dark", "shaky"],
      [],
      [],
      [],
      [],
      [],
      [],
      [],
      ["too_dark"],
    ] as const;
    expect(qualityFlags(history.map((h) => [...h]))).toEqual(["too_dark"]);
    expect(qualityFlags([])).toEqual([]);
  });
});
