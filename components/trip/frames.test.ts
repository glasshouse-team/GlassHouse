import { describe, expect, it } from "vitest";
import { fitSize, frameTimes, pickEvenly } from "./frames";

describe("pickEvenly", () => {
  it("keeps short lists and spreads long ones from first to last", () => {
    expect(pickEvenly([1, 2, 3], 8)).toEqual([1, 2, 3]);
    const picked = pickEvenly(
      Array.from({ length: 31 }, (_, i) => i),
      8,
    );
    expect(picked).toHaveLength(8);
    expect(picked[0]).toBe(0);
    expect(picked.at(-1)).toBe(30);
  });
});

describe("frameTimes", () => {
  it("takes one frame a second, at most 8, inside the clip", () => {
    expect(frameTimes(3.2)).toEqual([0.5, 1.5, 2.5]);
    const long = frameTimes(45);
    expect(long).toHaveLength(8);
    expect(long[0]).toBe(0.5);
    expect(long.at(-1)).toBe(44.5);
    expect(frameTimes(0.4)).toEqual([0.2]);
    expect(frameTimes(Number.POSITIVE_INFINITY)).toEqual([0]);
  });
});

describe("fitSize", () => {
  it("fits the long side into 1024 px and never enlarges", () => {
    expect(fitSize(1920, 1080)).toEqual({ width: 1024, height: 576 });
    expect(fitSize(1080, 1920)).toEqual({ width: 576, height: 1024 });
    expect(fitSize(640, 480)).toEqual({ width: 640, height: 480 });
  });
});
