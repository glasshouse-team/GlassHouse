import { describe, expect, it } from "vitest";
import { segmentLength, sliceMesh, sliceTriangle } from "./slice";

// Axis-aligned box from (0,0,0) to (4,3,2.5): a 4 m x 2.5 m room, 3 m high.
function boxMesh(w: number, h: number, d: number) {
  const v = [
    [0, 0, 0],
    [w, 0, 0],
    [w, h, 0],
    [0, h, 0],
    [0, 0, d],
    [w, 0, d],
    [w, h, d],
    [0, h, d],
  ];
  const faces = [
    [0, 1, 2, 3],
    [5, 4, 7, 6], // front, back
    [4, 0, 3, 7],
    [1, 5, 6, 2], // left, right
    [3, 2, 6, 7],
    [4, 5, 1, 0], // top, bottom
  ];
  const index: number[] = [];
  for (const [a, b, c, e] of faces) index.push(a, b, c, a, c, e);
  return { positions: new Float32Array(v.flat()), index: new Uint32Array(index) };
}

describe("sliceTriangle", () => {
  it("returns null when the plane misses the triangle", () => {
    expect(sliceTriangle([0, 0, 0], [1, 0, 0], [0, 0, 1], 1)).toBeNull();
  });

  it("returns the crossing segment", () => {
    const seg = sliceTriangle([0, 0, 0], [2, 0, 0], [0, 2, 0], 1);
    expect(seg).not.toBeNull();
    expect(segmentLength(seg!)).toBeCloseTo(1);
  });
});

describe("sliceMesh", () => {
  it("cuts a box room into walls whose total length is its perimeter", () => {
    const { positions, index } = boxMesh(4, 3, 2.5);
    const segments = sliceMesh(positions, index, 1.3);
    const total = segments.reduce((sum, s) => sum + segmentLength(s), 0);
    expect(total).toBeCloseTo(2 * (4 + 2.5), 5);
    // Floor and ceiling are not cut at 1.3 m.
    for (const [[x1, z1], [x2, z2]] of segments) {
      const onWall =
        [x1, x2].every((x) => Math.abs(x) < 1e-6 || Math.abs(x - 4) < 1e-6) ||
        [z1, z2].every((z) => Math.abs(z) < 1e-6 || Math.abs(z - 2.5) < 1e-6);
      expect(onWall).toBe(true);
    }
  });

  it("finds nothing above the ceiling", () => {
    const { positions, index } = boxMesh(4, 3, 2.5);
    expect(sliceMesh(positions, index, 3.5)).toHaveLength(0);
  });
});
