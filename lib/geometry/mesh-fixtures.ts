/** Synthetic meshes for the floor plan tests (GH-18). Not used at runtime. */

export interface TestMesh {
  positions: number[];
  index: number[];
}

/**
 * Axis-aligned box [x0, x1] x [y0, y1] x [z0, z1] (12 triangles), turned by `angle` radians
 * around the y axis through the origin (x toward z, like rotatePoint).
 */
export function box(
  [x0, x1]: [number, number],
  [y0, y1]: [number, number],
  [z0, z1]: [number, number],
  angle = 0,
): TestMesh {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const corners = [
    [x0, y0, z0],
    [x1, y0, z0],
    [x1, y1, z0],
    [x0, y1, z0],
    [x0, y0, z1],
    [x1, y0, z1],
    [x1, y1, z1],
    [x0, y1, z1],
  ].map(([x, y, z]) => [x * c - z * s, y, x * s + z * c]);
  const faces = [
    [0, 1, 2, 3],
    [5, 4, 7, 6],
    [4, 0, 3, 7],
    [1, 5, 6, 2],
    [3, 2, 6, 7],
    [4, 5, 1, 0],
  ];
  const index: number[] = [];
  for (const [a, b, d, e] of faces) index.push(a, b, d, a, d, e);
  return { positions: corners.flat(), index };
}

export function mergeMeshes(...meshes: TestMesh[]): {
  positions: Float32Array;
  index: Uint32Array;
} {
  const positions: number[] = [];
  const index: number[] = [];
  for (const m of meshes) {
    const offset = positions.length / 3;
    positions.push(...m.positions);
    index.push(...m.index.map((i) => i + offset));
  }
  return { positions: new Float32Array(positions), index: new Uint32Array(index) };
}
