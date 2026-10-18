import { describe, expect, it } from "vitest";
import { ceilingHeight, colliderToThree, robustExtent } from "./collider";
import { meshGlb } from "./glb-fixtures";

/** Two triangles forming a horizontal rectangle at height y (non-indexed). */
function quad(x0: number, x1: number, z0: number, z1: number, y: number): number[] {
  return [x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z0, x1, y, z1, x0, y, z1];
}

describe("colliderToThree", () => {
  it("flips Marble's OpenCV axes, scales to meters and puts the floor at 0", () => {
    // Raw Marble units, +y down: floor 0.8 below the camera, ceiling 0.6 above, a small table.
    const room = [
      ...quad(-2, 2, 0, 2.5, 0.8),
      ...quad(-2, 2, 0, 2.5, -0.6),
      ...quad(0, 0.5, 1, 1.5, 0.4),
    ];
    const { positions, index, floorY } = colliderToThree(meshGlb(room), 2);

    expect(floorY).toBeCloseTo(-1.6, 1); // -(0.8 * 2): marbleToThree(2, -1.6) lifts it to 0
    // First floor vertex, raw (-2, 0.8, 0): x scaled, not flipped; on the floor.
    expect(positions[0]).toBeCloseTo(-4);
    expect(positions[1]).toBeCloseTo(0);
    expect(positions[8]).toBeCloseTo(-5); // third vertex, raw z 2.5: forward is -z in three.js
    expect(ceilingHeight(positions, index)).toBeCloseTo(2.8, 1); // (0.8 + 0.6) * 2
  });
});

describe("robustExtent", () => {
  it("measures the bulk of the vertices and ignores a stray floater", () => {
    const points: number[] = [];
    for (let i = 0; i <= 200; i++) points.push(i / 20, 0, 0); // x from 0 to 10
    points.push(1000, 0, 0);
    const { min, max } = robustExtent(points);
    expect(min[0]).toBeLessThan(0.2);
    expect(max[0]).toBeGreaterThan(9.8);
    expect(max[0]).toBeLessThanOrEqual(10);
  });
});
