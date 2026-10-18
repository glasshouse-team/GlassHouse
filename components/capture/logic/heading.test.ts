import { describe, expect, it } from "vitest";
import { angleDelta, headingFromEvent, normalizeDeg, turnRate } from "./heading";

describe("normalizeDeg", () => {
  it("maps angles into [0, 360)", () => {
    expect(normalizeDeg(0)).toBe(0);
    expect(normalizeDeg(360)).toBe(0);
    expect(normalizeDeg(-10)).toBe(350);
    expect(normalizeDeg(725)).toBe(5);
    expect(Object.is(normalizeDeg(-360), -0)).toBe(false);
  });
});

describe("headingFromEvent", () => {
  it("uses webkitCompassHeading on iOS", () => {
    expect(headingFromEvent({ alpha: 10, webkitCompassHeading: 90 })).toBe(90);
  });

  it("uses 360 - alpha elsewhere", () => {
    expect(headingFromEvent({ alpha: 90 })).toBe(270);
    expect(headingFromEvent({ alpha: 0 })).toBe(0);
  });

  it("adds the screen orientation angle", () => {
    expect(headingFromEvent({ alpha: 90 }, 90)).toBe(0);
    expect(headingFromEvent({ alpha: null, webkitCompassHeading: 300 }, 90)).toBe(30);
  });

  it("returns null without a reading (desktop, permission denied)", () => {
    expect(headingFromEvent({ alpha: null })).toBeNull();
    expect(headingFromEvent({ alpha: Number.NaN, webkitCompassHeading: null })).toBeNull();
  });
});

describe("angleDelta", () => {
  it("takes the shortest signed turn, across the wrap", () => {
    expect(angleDelta(350, 10)).toBe(20);
    expect(angleDelta(10, 350)).toBe(-20);
    expect(angleDelta(0, 180)).toBe(180);
    expect(angleDelta(90, 45)).toBe(-45);
  });
});

describe("turnRate", () => {
  it("is 0 with fewer than two samples", () => {
    expect(turnRate([])).toBe(0);
    expect(turnRate([{ t: 0, heading: 10 }])).toBe(0);
  });

  it("measures degrees per second across 359 -> 0", () => {
    const samples = [
      { t: 0, heading: 340 },
      { t: 0.5, heading: 355 },
      { t: 1, heading: 10 },
    ];
    expect(turnRate(samples)).toBeCloseTo(30);
  });

  it("only looks at the last window", () => {
    const samples = [
      { t: 0, heading: 0 },
      { t: 1, heading: 180 }, // a fast turn long ago
      { t: 4, heading: 180 },
      { t: 5, heading: 190 },
    ];
    expect(turnRate(samples, 1)).toBeCloseTo(10);
  });
});
