import { describe, expect, it } from "vitest";
import {
  boxCorners,
  closeGaps,
  pointInPolygon,
  polygonArea,
  polygonCentroid,
  polygonExtents,
  removeJogs,
  roomOutline,
  signedArea,
  simplifyCollinear,
  traceRegion,
  wallPointsBox,
} from "./rooms";
import type { Point2 } from "./slice";
import { rotatePoint, type Wall } from "./walls";

const DEG = Math.PI / 180;

function rectWalls(minX: number, maxX: number, minZ: number, maxZ: number): Wall[] {
  return [
    [minX, minZ, maxX, minZ],
    [maxX, minZ, maxX, maxZ],
    [maxX, maxZ, minX, maxZ],
    [minX, maxZ, minX, minZ],
  ];
}

const turn = (walls: Wall[], angle: number): Wall[] =>
  walls.map(
    ([x1, z1, x2, z2]) =>
      [...rotatePoint([x1, z1], angle), ...rotatePoint([x2, z2], angle)] as Wall,
  );

/** An L-shaped room: 5 x 4 m with the 2 x 2 m corner at +x, +z cut away. */
const L_POINTS: Point2[] = [
  [-2, -2],
  [3, -2],
  [3, 0],
  [1, 0],
  [1, 2],
  [-2, 2],
];
const lWalls = (): Wall[] =>
  L_POINTS.map((p, i) => [...p, ...L_POINTS[(i + 1) % L_POINTS.length]] as Wall);

describe("polygon helpers", () => {
  it("computes the shoelace area of rectangles and L-shapes, either orientation", () => {
    const rect: Point2[] = [
      [0, 0],
      [4, 0],
      [4, 3],
      [0, 3],
    ];
    expect(polygonArea(rect)).toBeCloseTo(12);
    expect(polygonArea([...rect].reverse())).toBeCloseTo(12);
    expect(signedArea(rect)).toBeGreaterThan(0);
    expect(polygonArea(L_POINTS)).toBeCloseTo(16);
  });

  it("returns 0 for degenerate polygons", () => {
    expect(polygonArea([])).toBe(0);
    expect(
      polygonArea([
        [0, 0],
        [1, 1],
      ]),
    ).toBe(0);
    expect(
      polygonArea([
        [0, 0],
        [1, 1],
        [2, 2],
      ]),
    ).toBeCloseTo(0);
  });

  it("finds the centroid and tests points inside", () => {
    const c = polygonCentroid([
      [0, 0],
      [4, 0],
      [4, 2],
      [0, 2],
    ]);
    expect(c[0]).toBeCloseTo(2);
    expect(c[1]).toBeCloseTo(1);
    expect(pointInPolygon([0, 0], L_POINTS)).toBe(true);
    expect(pointInPolygon([2, 1], L_POINTS)).toBe(false);
    expect(polygonCentroid([])).toEqual([0, 0]);
  });

  it("measures width and length along the polygon's own axes, even when turned", () => {
    const rect = boxCorners({ angle: 30 * DEG, minX: -2, maxX: 2, minZ: -1.6, maxZ: 1.6 });
    const e = polygonExtents(rect);
    expect(e.angle).toBeCloseTo(30 * DEG, 3);
    expect(e.width).toBeCloseTo(3.2, 3);
    expect(e.length).toBeCloseTo(4, 3);
    const l = polygonExtents(L_POINTS);
    expect(l.width).toBeCloseTo(4);
    expect(l.length).toBeCloseTo(5);
  });

  it("drops collinear and repeated points", () => {
    expect(
      simplifyCollinear([
        [0, 0],
        [1, 0],
        [2, 0],
        [2, 0],
        [2, 2],
        [0, 2],
      ]),
    ).toEqual([
      [0, 0],
      [2, 0],
      [2, 2],
      [0, 2],
    ]);
  });
});

describe("removeJogs", () => {
  it("straightens a 5 cm step and keeps a 1 m one", () => {
    const stepped: Point2[] = [
      [0, 0],
      [3, 0],
      [3, 0.05],
      [4, 0.05],
      [4, 3],
      [0, 3],
    ];
    const out = removeJogs(stepped, 0.1);
    expect(out).toHaveLength(4);
    // The shorter side (1 m at z = 0.05) moved onto the 3 m side's line.
    expect(polygonArea(out)).toBeCloseTo(12);
    expect(removeJogs(L_POINTS, 0.1)).toHaveLength(6);
  });
});

describe("traceRegion", () => {
  it("traces an L of cells as one rectilinear loop", () => {
    // 3 x 2 cells with the top right one missing.
    const region = new Uint8Array([1, 1, 1, 1, 1, 0]);
    const loop = traceRegion(region, 3, 2);
    expect(loop).toHaveLength(6);
    expect(polygonArea(loop)).toBe(5);
  });

  it("keeps the outer boundary of a region with a hole", () => {
    const region = new Uint8Array([1, 1, 1, 1, 0, 1, 1, 1, 1]);
    const loop = traceRegion(region, 3, 3);
    expect(polygonArea(loop)).toBe(9);
  });
});

describe("closeGaps", () => {
  it("bridges a doorway between collinear wall pieces and nothing wider than the limit", () => {
    const h = [
      { offset: 0, from: -2, to: -0.5 },
      { offset: 0.03, from: 0.5, to: 2 },
      { offset: 0, from: 4, to: 6 },
    ];
    const { h: closers } = closeGaps(h, [], 1.2, 0.1);
    expect(closers).toHaveLength(1);
    expect(closers[0].from).toBeCloseTo(-0.5);
    expect(closers[0].to).toBeCloseTo(0.5);
  });

  it("runs a wall end on to a perpendicular wall (a door next to a corner)", () => {
    const h = [{ offset: 0, from: -2, to: 1 }];
    const v = [{ offset: 2, from: -3, to: 3 }];
    const { h: closers } = closeGaps(h, v, 1.2, 0.1);
    expect(closers).toEqual([{ offset: 0, from: 1, to: 2 }]);
  });
});

describe("roomOutline", () => {
  it("outlines a closed rectangle exactly", () => {
    const o = roomOutline(rectWalls(-2, 2, -1.5, 1.5), 0)!;
    expect(o.method).toBe("walls");
    expect(o.area_m2).toBeCloseTo(12, 2);
    expect(o.polygon).toHaveLength(4);
    expect(signedArea(o.polygon)).toBeGreaterThan(0);
  });

  it("follows an L-shaped room", () => {
    const o = roomOutline(lWalls(), 0)!;
    expect(o.method).toBe("walls");
    expect(o.polygon).toHaveLength(6);
    expect(o.area_m2).toBeCloseTo(16, 2);
  });

  it("closes a 1 m doorway and a door next to a corner", () => {
    const walls: Wall[] = [
      [-2, -1.5, -0.5, -1.5], // door from -0.5 to 0.5 in the bottom wall
      [0.5, -1.5, 2, -1.5],
      [2, -1.5, 2, 1.5],
      [2, 1.5, -1, 1.5], // door in the corner at -2..-1 on the top wall
      [-2, 1.5, -2, -1.5],
    ];
    const o = roomOutline(walls, 0)!;
    expect(o.method).toBe("walls");
    expect(o.area_m2).toBeCloseTo(12, 2);
  });

  it("works on a room turned by any angle", () => {
    for (const deg of [17, 30, 45, 71]) {
      const o = roomOutline(turn(lWalls(), deg * DEG), deg * DEG)!;
      expect(o.method).toBe("walls");
      expect(o.area_m2).toBeCloseTo(16, 2);
      const e = polygonExtents(o.polygon);
      expect(e.width).toBeCloseTo(4, 2);
      expect(e.length).toBeCloseTo(5, 2);
    }
  });

  it("ignores furniture inside the room and walls of the next room", () => {
    const walls: Wall[] = [
      ...rectWalls(-2, 2, -1.5, 1.5),
      [-0.5, 0.5, 0.3, 0.5], // a wardrobe side
      [2.12, -1.5, 2.12, 1.5], // the next room's wall, behind this one
      [2.12, -1.5, 5, -1.5],
    ];
    const o = roomOutline(walls, 0)!;
    expect(o.area_m2).toBeCloseTo(12, 2);
  });

  it("snaps the outline onto walls that are slightly off the cell grid", () => {
    const o = roomOutline(rectWalls(-1.93, 2.07, -1.512, 1.488), 0)!;
    expect(o.area_m2).toBeCloseTo(12, 2);
    const xs = o.polygon.map((p) => p[0]);
    expect(Math.min(...xs)).toBeCloseTo(-1.93, 5);
    expect(Math.max(...xs)).toBeCloseTo(2.07, 5);
  });

  it("falls back to the given box when an opening is wider than the gap limit", () => {
    const walls: Wall[] = [
      [-2, -1.5, 2, -1.5],
      [2, -1.5, 2, 1.5],
      [-2, 1.5, -2, -1.5], // the top side is open
    ];
    const fallback = { angle: 0, minX: -2, maxX: 2, minZ: -1.5, maxZ: 1.4 };
    const o = roomOutline(walls, 0, { fallback })!;
    expect(o.method).toBe("box");
    expect(o.area_m2).toBeCloseTo(4 * 2.9);
    // Without a box: the box of the wall points around the spot.
    const own = roomOutline(walls, 0)!;
    expect(own.method).toBe("box");
    expect(own.area_m2).toBeCloseTo(12);
  });

  it("falls back for degenerate input", () => {
    expect(roomOutline([], 0)).toBeNull();
    expect(roomOutline([[0, 0, 0, 0]], 0)).toBeNull();
    expect(
      roomOutline([], 0, { fallback: { angle: 0, minX: -1, maxX: 1, minZ: -1, maxZ: 1 } }),
    ).toMatchObject({
      method: "box",
      area_m2: 4,
    });
    // Two parallel walls: no closed room, no box around the spot on both axes.
    const parallel: Wall[] = [
      [-2, -1, 2, -1],
      [-2, 1, 2, 1],
    ];
    expect(roomOutline(parallel, 0)?.method).toBe("box");
  });

  it("falls back when the closed region is too small to be a room", () => {
    const o = roomOutline(rectWalls(-0.5, 0.5, -0.5, 0.5), 0)!;
    expect(o.method).toBe("box");
    expect(o.area_m2).toBeCloseTo(1);
  });

  it("finds the room from a spot standing close to a wall", () => {
    const o = roomOutline(rectWalls(-0.1, 3.9, -1.5, 1.5), 0)!;
    expect(o.method).toBe("walls");
    expect(o.area_m2).toBeCloseTo(12, 2);
  });
});

describe("wallPointsBox", () => {
  it("is null when the spot is not inside the box", () => {
    expect(wallPointsBox(rectWalls(1, 3, 1, 3), 0, 8)).toBeNull();
    expect(wallPointsBox(rectWalls(-1, 1, -1, 1), 0, 8)).toMatchObject({ minX: -1, maxZ: 1 });
  });
});
