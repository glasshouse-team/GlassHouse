/**
 * Horizontal mesh slicing, the first step of the floor plan (owner: Temuri, GH-18).
 * Coordinates are meters with y up (apply Marble's metric scale and ground offset first).
 * A slice at height y returns 2D segments on the floor plane as [x, z] points.
 */

export type Point2 = [number, number];
export type Segment2 = [Point2, Point2];

const EPS = 1e-9;

/**
 * Intersects one triangle with the plane y = h. Returns the crossing segment or null.
 * Vertices exactly on the plane count as "above" so shared edges are not double counted.
 */
export function sliceTriangle(
  a: [number, number, number],
  b: [number, number, number],
  c: [number, number, number],
  h: number,
): Segment2 | null {
  const verts = [a, b, c];
  const side = verts.map((v) => v[1] - h >= -EPS);
  const above = side.filter(Boolean).length;
  if (above === 0 || above === 3) return null;

  const points: Point2[] = [];
  for (let i = 0; i < 3; i++) {
    const p = verts[i];
    const q = verts[(i + 1) % 3];
    if (side[i] === side[(i + 1) % 3]) continue;
    const t = (h - p[1]) / (q[1] - p[1]);
    points.push([p[0] + t * (q[0] - p[0]), p[2] + t * (q[2] - p[2])]);
  }
  if (points.length !== 2) return null;
  const [p, q] = points;
  if (Math.hypot(p[0] - q[0], p[1] - q[1]) < EPS) return null;
  return [p, q];
}

/**
 * Slices an indexed or non-indexed triangle mesh (Float32Array of xyz positions) at height h.
 * For large meshes, use three-mesh-bvh shapecast to visit only triangles near the plane.
 */
export function sliceMesh(
  positions: ArrayLike<number>,
  index: ArrayLike<number> | null,
  h: number,
): Segment2[] {
  const vertex = (i: number): [number, number, number] => [
    positions[i * 3],
    positions[i * 3 + 1],
    positions[i * 3 + 2],
  ];
  const triangleCount = index ? index.length / 3 : positions.length / 9;
  const segments: Segment2[] = [];
  for (let t = 0; t < triangleCount; t++) {
    const i0 = index ? index[t * 3] : t * 3;
    const i1 = index ? index[t * 3 + 1] : t * 3 + 1;
    const i2 = index ? index[t * 3 + 2] : t * 3 + 2;
    const segment = sliceTriangle(vertex(i0), vertex(i1), vertex(i2), h);
    if (segment) segments.push(segment);
  }
  return segments;
}

export function segmentLength([p, q]: Segment2): number {
  return Math.hypot(p[0] - q[0], p[1] - q[1]);
}
