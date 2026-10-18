/**
 * A Marble collider mesh in three.js meters with the floor at y = 0 (owner: Temuri, GH-3 / GH-18).
 * Uses the one transform in frame.ts: flip the OpenCV axes and scale (marbleToThree), measure the
 * floor (floorHeight), then lift it to 0. Node-side: `pnpm worlds inspect`, the floor plan script.
 */
import { Vector3 } from "three";
import { floorHeight, marbleToThree } from "./frame";
import { glbTriangles, parseGlb } from "./glb";

export interface ThreeCollider {
  /** three.js meters (+y up), floor at y = 0. */
  positions: Float32Array;
  index: Uint32Array;
  /** Floor height after flipping and scaling, before the lift: the floorY for marbleToThree. */
  floorY: number;
}

export function colliderToThree(glbBytes: Uint8Array, metricScaleFactor: number): ThreeCollider {
  const { positions, index } = glbTriangles(parseGlb(glbBytes));
  const flipAndScale = marbleToThree(metricScaleFactor, 0);
  const v = new Vector3();
  for (let i = 0; i < positions.length; i += 3) {
    v.fromArray(positions, i).applyMatrix4(flipAndScale).toArray(positions, i);
  }
  const floorY = floorHeight(positions, index);
  for (let i = 1; i < positions.length; i += 3) positions[i] -= floorY;
  return { positions, index, floorY };
}

/** Height of the highest large horizontal surface (the ceiling): floorHeight with y mirrored. */
export function ceilingHeight(
  positions: ArrayLike<number>,
  index?: ArrayLike<number> | null,
): number {
  const mirrored = Float32Array.from(positions, (value, i) => (i % 3 === 1 ? -value : value));
  return -floorHeight(mirrored, index);
}

/**
 * Vertex spread on each axis between two percentiles (default 1st to 99th): the size of the
 * house without stray floaters.
 */
export function robustExtent(
  positions: ArrayLike<number>,
  lo = 0.01,
  hi = 0.99,
): { min: [number, number, number]; max: [number, number, number] } {
  const n = Math.floor(positions.length / 3);
  const min: [number, number, number] = [0, 0, 0];
  const max: [number, number, number] = [0, 0, 0];
  if (n === 0) return { min, max };
  for (let axis = 0; axis < 3; axis++) {
    const values = new Float64Array(n);
    for (let i = 0; i < n; i++) values[i] = positions[i * 3 + axis];
    values.sort();
    min[axis] = values[Math.floor(lo * (n - 1))];
    max[axis] = values[Math.ceil(hi * (n - 1))];
  }
  return { min, max };
}
