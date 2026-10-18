import { Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { meshGlb } from "@/lib/geometry/glb-fixtures";
import {
  castRay,
  colliderFromGlb,
  colliderFromPositions,
  fallbackFloorY,
  linkDistance,
  poseMatrix,
  splatPose,
} from "./collider-mesh";
import { azimuthDirection, placeArrows } from "./spots";

/** Two triangles: a vertical wall from (x0, z0) to (x1, z1), 0..h high. */
function wall(x0: number, z0: number, x1: number, z1: number, h = 2.5): number[] {
  return [x0, 0, z0, x1, 0, z1, x1, h, z1, x0, 0, z0, x1, h, z1, x0, h, z0];
}
/** Two triangles: a horizontal rectangle at height y. */
function quad(x0: number, x1: number, z0: number, z1: number, y: number): number[] {
  return [x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z0, x1, y, z1, x0, y, z1];
}

/** A 4 x 6 m room in three.js meters: x -2..2, z -4..2 (forward is -z). */
function room() {
  const positions = new Float32Array([
    ...quad(-2, 2, -4, 2, 0),
    ...quad(-2, 2, -4, 2, 2.5),
    ...wall(-2, -4, 2, -4), // front, 4 m ahead
    ...wall(2, -4, 2, 2), // right, 2 m
    ...wall(-2, 2, 2, 2), // back, 2 m
    ...wall(-2, -4, -2, 2), // left, 2 m
  ]);
  return colliderFromPositions(positions, null, 0);
}

describe("doorway arrows on the collider", () => {
  it("casts at 1 m and stops 0.5 m before the wall, clamped to 3 m", () => {
    const collider = room();
    const labels = new Map([
      ["kitchen", "Kitchen"],
      ["bath", "Bathroom"],
      ["hall", "Hall"],
    ]);
    const arrows = placeArrows(
      [
        { to: "kitchen", azimuth: 0 }, // front wall at 4 m: 3.5 clamps to 3
        { to: "bath", azimuth: 90 }, // right wall at 2 m: 1.5
        { to: "hall", azimuth: 180 }, // back wall at 2 m
        { to: "nowhere", azimuth: 270 }, // not a spot of the tour: no arrow
      ],
      labels,
      linkDistance(collider),
    );
    expect(arrows.map((a) => a.to)).toEqual(["kitchen", "bath", "hall"]);
    expect(arrows[0].position.z).toBeCloseTo(-3);
    expect(arrows[1].position.x).toBeCloseTo(1.5);
    expect(arrows[1].position.z).toBeCloseTo(0);
    expect(arrows[2].position.z).toBeCloseTo(1.5);
    expect(arrows.every((a) => a.position.y === 0)).toBe(true);
    collider.dispose();
  });

  it("reports wall normals as horizontal and floor normals as vertical", () => {
    const collider = room();
    const forward = castRay(collider, { x: 0, y: 1, z: 0 }, azimuthDirection(0));
    expect(forward[0].distance).toBeCloseTo(4);
    expect(Math.abs(forward[0].normalY)).toBeLessThan(0.01);
    const down = castRay(collider, { x: 0, y: 1, z: 0 }, { x: 0, y: -1, z: 0 });
    expect(down[0].distance).toBeCloseTo(1);
    expect(Math.abs(down[0].normalY)).toBeCloseTo(1);
  });

  it("uses the default distance without a collider", () => {
    expect(linkDistance(null)({ to: "x", azimuth: 0 }, azimuthDirection(0))).toBe(2);
  });
});

describe("splat and collider share one transform", () => {
  it("puts a raw Marble point where the collider puts the same vertex", () => {
    // Raw Marble units (+y down, +z forward): floor 0.8 below the camera, one wall ahead.
    const raw = [...quad(-2, 2, 0, 3, 0.8), ...quad(-2, 2, 0, 3, -0.6)];
    const scale = 1.25;
    const collider = colliderFromGlb(meshGlb(raw), scale);
    expect(collider.floorY).toBeCloseTo(-1, 1); // -(0.8 * 1.25)

    const pose = splatPose(scale, collider.floorY);
    expect(pose.scale.x).toBeCloseTo(scale); // positive: the flip is a rotation
    expect(pose.scale.y).toBeCloseTo(scale);
    const p = new Vector3(raw[6], raw[7], raw[8]).applyMatrix4(poseMatrix(pose));
    const positions = collider.mesh.geometry.getAttribute("position");
    expect(p.x).toBeCloseTo(positions.getX(2));
    expect(p.y).toBeCloseTo(positions.getY(2));
    expect(p.z).toBeCloseTo(positions.getZ(2));
    expect(p.y).toBeCloseTo(0, 1); // floor at 0
    expect(p.z).toBeLessThan(0); // raw forward (+z) is -z in three.js
  });

  it("falls back to the ground plane offset for the floor", () => {
    expect(fallbackFloorY(1.34)).toBeCloseTo(-1.34);
    expect(fallbackFloorY(null)).toBe(-1.5);
  });
});
