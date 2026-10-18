import { describe, expect, it } from "vitest";
import { box, mergeMeshes } from "./mesh-fixtures";
import type { Segment2 } from "./slice";
import {
  colliderWalls,
  dominantAngle,
  rotatePoint,
  straightWalls,
  voteGrid,
  wallLength,
  type Wall,
} from "./walls";

const DEG = Math.PI / 180;

/** Wall direction folded into [0, 90) degrees. */
function wallAngleDeg([x1, z1, x2, z2]: Wall): number {
  const a = (Math.atan2(z2 - z1, x2 - x1) / DEG + 360) % 90;
  return a > 89.99 ? 0 : a;
}

describe("dominantAngle", () => {
  it("finds the main wall angle of a turned rectangle", () => {
    const corners = [
      [-2, -1.5],
      [2, -1.5],
      [2, 1.5],
      [-2, 1.5],
    ].map((p) => rotatePoint(p as [number, number], 20 * DEG));
    const segments: Segment2[] = corners.map((p, i) => [p, corners[(i + 1) % 4]]);
    expect(dominantAngle(segments) / DEG).toBeCloseTo(20, 1);
  });

  it("averages noisy angles around the peak, ignoring a short odd segment", () => {
    const segments: Segment2[] = [
      [
        [0, 0],
        rotatePoint([3, 0], 31 * DEG),
      ],
      [
        [0, 0],
        rotatePoint([3, 0], 29 * DEG),
      ],
      [
        [0, 0],
        rotatePoint([0, 3], 30 * DEG),
      ],
      [
        [0, 0],
        rotatePoint([0.3, 0], 70 * DEG),
      ],
    ];
    expect(dominantAngle(segments) / DEG).toBeCloseTo(30, 0);
  });

  it("is 0 without segments", () => {
    expect(dominantAngle([])).toBe(0);
  });
});

describe("voteGrid", () => {
  it("counts how many slices hit each cell", () => {
    const line: Segment2 = [
      [0, 0],
      [1, 0],
    ];
    const votes = voteGrid([[line], [line], []], 0.05);
    expect(Math.max(...votes.values())).toBe(2);
  });
});

describe("straightWalls", () => {
  it("joins noisy collinear pieces into one wall and drops short ones", () => {
    const slice: Segment2[] = [
      [
        [0, 0],
        [1, 0.01],
      ],
      [
        [1.05, 0.01],
        [2, -0.01],
      ],
      [
        [2.1, 0],
        [3, 0.02],
      ],
      [
        [5, 1],
        [5.1, 1],
      ], // 10 cm stray piece
    ];
    const { walls } = straightWalls([slice, slice, slice], { maxRadius: 10 });
    expect(walls).toHaveLength(1);
    expect(wallLength(walls[0])).toBeCloseTo(3, 1);
  });

  it("drops segments only one slice sees", () => {
    const wall: Segment2 = [
      [0, 2],
      [3, 2],
    ];
    const shelf: Segment2 = [
      [0, 0],
      [1, 0],
    ];
    const { walls } = straightWalls([[wall, shelf], [wall], [wall]]);
    expect(walls).toHaveLength(1);
    expect(walls[0][1]).toBeCloseTo(2);
  });
});

describe("colliderWalls", () => {
  // A 4 m x 3 m room (walls as thin boxes), 2.6 m high, turned 20 degrees, with a 1.0-1.1 m
  // high shelf the 1.3 and 1.6 m slices miss.
  const turn = 20 * DEG;
  const t = 0.05;
  const mesh = mergeMeshes(
    box([-2, 2], [0, 2.6], [-1.5, -1.5 + t], turn),
    box([-2, 2], [0, 2.6], [1.5 - t, 1.5], turn),
    box([-2, -2 + t], [0, 2.6], [-1.5, 1.5], turn),
    box([2 - t, 2], [0, 2.6], [-1.5, 1.5], turn),
    box([0.5, 1.5], [0.95, 1.1], [-0.3, 0.3], turn),
  );
  const { angle, walls } = colliderWalls(mesh.positions, mesh.index);

  it("finds the room's angle", () => {
    expect(angle / DEG).toBeCloseTo(20, 0);
  });

  it("returns straight walls along the room's axes", () => {
    for (const w of walls) expect(wallAngleDeg(w)).toBeCloseTo(20, 0);
  });

  it("covers the four sides with about 14 m of wall and leaves the shelf out", () => {
    const total = walls.reduce((sum, w) => sum + wallLength(w), 0);
    // Each thin wall box gives an inner and an outer face 5 cm apart: merged into one wall.
    expect(total).toBeGreaterThan(13);
    expect(total).toBeLessThan(15);
    const shelfCenter = rotatePoint([1, 0], turn);
    for (const [x1, z1, x2, z2] of walls) {
      const mid = [(x1 + x2) / 2, (z1 + z2) / 2];
      expect(Math.hypot(mid[0] - shelfCenter[0], mid[1] - shelfCenter[1])).toBeGreaterThan(0.6);
    }
  });
});
