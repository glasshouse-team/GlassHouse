import { Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { floorHeight, marbleToThree } from "./frame";

/** Two triangles forming a horizontal rectangle at height y. */
function quad(x0: number, x1: number, z0: number, z1: number, y: number): number[] {
  return [x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z0, x1, y, z1, x0, y, z1];
}

describe("marbleToThree", () => {
  it("flips OpenCV axes, scales to meters and lifts the floor to 0", () => {
    // A Marble point 1.2 raw units below the camera (y down), 2 units ahead (z forward).
    const p = new Vector3(0.5, 1.2, 2).applyMatrix4(marbleToThree(2, -2.4));
    expect(p.x).toBeCloseTo(1);
    expect(p.y).toBeCloseTo(0); // -1.2 * 2 = -2.4, lifted by 2.4
    expect(p.z).toBeCloseTo(-4); // forward is -z in three.js
  });
});

describe("floorHeight", () => {
  it("finds the floor under a ceiling and a table top", () => {
    const room = [
      ...quad(-2, 2, -2.5, 2.5, -1.6), // floor, 20 m2
      ...quad(-2, 2, -2.5, 2.5, 1.0), // ceiling, 20 m2
      ...quad(0, 1, 0, 1, -0.85), // table, 1 m2
    ];
    expect(floorHeight(room)).toBeCloseTo(-1.6, 1);
  });

  it("ignores walls", () => {
    const wall = [0, 0, 0, 0, 3, 0, 4, 3, 0, 0, 0, 0, 4, 3, 0, 4, 0, 0];
    expect(floorHeight([...wall, ...quad(0, 4, 0, 4, -1.5)])).toBeCloseTo(-1.5, 1);
  });

  it("finds a small, uneven floor under a big ceiling and a bed (GH-3 bedroom world)", () => {
    const bedroom = [
      ...quad(-2, 2, -2, 2, 1.3), // ceiling, 16 m2: the biggest flat surface
      ...quad(-1, 1, -1, 1, -0.85), // bed top, 4 m2
      ...quad(1, 2, -2, 0, -1.37), // floor beside the bed, 2 m2, 6 cm uneven (bins 5 cm apart)
      ...quad(-2, -1, -2, 0, -1.43),
    ];
    expect(floorHeight(bedroom)).toBeCloseTo(-1.4, 1);
  });

  it("uses every layer when nothing is under the origin", () => {
    expect(floorHeight(quad(0, 4, 0, 4, 0.5))).toBeCloseTo(0.5, 2);
  });
});
