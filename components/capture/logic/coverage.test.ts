import { describe, expect, it } from "vitest";
import {
  RING_BINS,
  aimHint,
  binFor,
  ringAzimuths,
  ringCoverage,
  ringTarget,
  samplesForRoom,
} from "./coverage";

describe("binFor", () => {
  it("puts headings in 10-degree bins", () => {
    expect(binFor(0)).toBe(0);
    expect(binFor(9.9)).toBe(0);
    expect(binFor(10)).toBe(1);
    expect(binFor(359.9)).toBe(35);
    expect(binFor(360)).toBe(0);
    expect(binFor(-5)).toBe(35);
  });
});

describe("ringCoverage", () => {
  it("is empty without samples", () => {
    const c = ringCoverage([]);
    expect(c.filled).toHaveLength(RING_BINS);
    expect(c.degrees).toBe(0);
    expect(c.done).toBe(false);
  });

  it("fills one bin per sample when samples are far apart", () => {
    const c = ringCoverage([{ heading: 5 }, { heading: 95 }, { heading: 185 }]);
    expect(c.degrees).toBe(30);
    expect(c.filled[0]).toBe(true);
    expect(c.filled[9]).toBe(true);
    expect(c.filled[18]).toBe(true);
  });

  it("fills the bins between close samples, across the wrap", () => {
    const c = ringCoverage([{ heading: 350 }, { heading: 15 }]);
    expect(c.filled[35]).toBe(true);
    expect(c.filled[0]).toBe(true);
    expect(c.filled[1]).toBe(true);
    expect(c.degrees).toBe(30);
  });

  it("is done after a full slow turn", () => {
    const samples = Array.from({ length: 73 }, (_, i) => ({ heading: i * 5 }));
    const c = ringCoverage(samples);
    expect(c.degrees).toBe(360);
    expect(c.share).toBe(1);
    expect(c.done).toBe(true);
  });

  it("is not done at 300 degrees", () => {
    const samples = Array.from({ length: 61 }, (_, i) => ({ heading: i * 5 }));
    const c = ringCoverage(samples);
    expect(c.degrees).toBeLessThan(330);
    expect(c.done).toBe(false);
  });
});

describe("samplesForRoom", () => {
  const track = [0, 1, 2, 3, 4, 5].map((t) => ({ t, heading: t * 10 }));
  const markers = [
    { room: "Entrance", t: 0 },
    { room: "Kitchen", t: 3 },
  ];
  it("splits the heading track at room markers", () => {
    expect(samplesForRoom(track, markers, 0).map((s) => s.t)).toEqual([0, 1, 2]);
    expect(samplesForRoom(track, markers, 1).map((s) => s.t)).toEqual([3, 4, 5]);
  });
});

describe("ring photos (D-009)", () => {
  it("targets 45-degree steps from the first photo", () => {
    expect(ringTarget(350, 0)).toBe(350);
    expect(ringTarget(350, 1)).toBe(35);
    expect(ringTarget(350, 7)).toBe(305);
  });

  it("tells the host which way to turn", () => {
    expect(aimHint(40, 45)).toEqual({ kind: "aimed" });
    expect(aimHint(0, 45)).toEqual({ kind: "turn", direction: "right", by: 45 });
    expect(aimHint(10, 340)).toEqual({ kind: "turn", direction: "left", by: 30 });
  });

  it("turns photo headings into azimuths from the first photo", () => {
    expect(ringAzimuths([350, 36, 80, 124])).toEqual([0, 46, 90, 134]);
  });

  it("falls back to planned steps without a compass", () => {
    expect(ringAzimuths([null, null, null])).toEqual([0, 45, 90]);
    expect(ringAzimuths([100, null, 190])).toEqual([0, 45, 90]);
  });
});
