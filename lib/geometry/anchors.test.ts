import { describe, expect, it } from "vitest";
import { ANCHOR_EYE_HEIGHT, aimDirection, anchorFromHit, firstHit } from "./anchors";

const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 6);

describe("aimDirection", () => {
  it("points along (sin az, 0, -cos az) on the floor plane", () => {
    const north = aimDirection(0);
    close(north.x, 0);
    close(north.y, 0);
    close(north.z, -1);
    const east = aimDirection(90);
    close(east.x, 1);
    close(east.z, 0);
    const south = aimDirection(180);
    close(south.z, 1);
    const west = aimDirection(270);
    close(west.x, -1);
  });

  it("tilts down with a negative pitch and stays a unit vector", () => {
    const d = aimDirection(45, -30);
    close(d.y, -0.5);
    close(Math.hypot(d.x, d.y, d.z), 1);
    close(d.x, Math.sin(Math.PI / 4) * Math.cos(Math.PI / 6));
  });
});

describe("firstHit", () => {
  it("takes the nearest hit past the floaters", () => {
    expect(firstHit([2.4, 0.1, 1.3])).toBe(1.3);
  });
  it("is null without a solid hit", () => {
    expect(firstHit([])).toBeNull();
    expect(firstHit([0.05, Number.NaN])).toBeNull();
  });
});

describe("anchorFromHit", () => {
  it("looks at the hit point and stands back toward the spot centre at eye height", () => {
    const a = anchorFromHit({ azimuth: 90, rayHeight: 1.1 }, 2.5);
    expect(a.look_at).toEqual({ x: 2.5, y: 1.1, z: 0 });
    // 2.5 m out, 1.5 m back: 1 m from the centre, along the same direction.
    expect(a.position).toEqual({ x: 1, y: ANCHOR_EYE_HEIGHT, z: 0 });
  });

  it("never stands further than maxOffset from the spot", () => {
    const a = anchorFromHit({ azimuth: 180, rayHeight: 1 }, 4);
    expect(a.position.z).toBeCloseTo(1, 6);
    expect(Math.hypot(a.position.x, a.position.z)).toBeLessThanOrEqual(1 + 1e-9);
  });

  it("stays at the centre when the object is closer than the backoff", () => {
    const a = anchorFromHit({ azimuth: 270, rayHeight: 0.6 }, 0.9);
    expect(a.position).toEqual({ x: 0, y: ANCHOR_EYE_HEIGHT, z: 0 });
    expect(a.look_at).toEqual({ x: -0.9, y: 0.6, z: 0 });
  });

  it("uses the floor-plane reach of a pitched ray for the backoff", () => {
    // Down 30 degrees from 1.45 m: 2 m along the ray is 1.732 m out and 1 m down.
    const a = anchorFromHit({ azimuth: 0, rayHeight: 1.45, pitch: -30 }, 2, { backoff: 1.2 });
    expect(a.look_at.y).toBeCloseTo(0.45, 3);
    expect(a.look_at.z).toBeCloseTo(-1.732, 3);
    expect(a.position.z).toBeCloseTo(-0.532, 3);
    expect(a.position.x).toBeCloseTo(0, 6);
  });

  it("rounds to millimetres", () => {
    const a = anchorFromHit({ azimuth: 33, rayHeight: 1.234567 }, 1.111111);
    for (const v of [a.position, a.look_at])
      for (const n of [v.x, v.y, v.z]) expect(Math.round(n * 1000) / 1000).toBe(n);
  });
});
