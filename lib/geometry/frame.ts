/**
 * CONTRACT (owner: Temuri). The only Marble -> three.js coordinate transform.
 * The viewer (GH-11), floor plan (GH-18) and gap check (GH-19) all use it, so anchors,
 * gaps and plan coordinates line up.
 *
 * Marble worlds use OpenCV axes (+y down, +z forward; docs.worldlabs.ai export specs).
 * three.js uses +y up, -z forward. Result: meters, floor at y = 0.
 * World Labs does not document the sign or units of `ground_plane_offset`, so the floor is
 * measured from the collider mesh (floorHeight) and the offset is only a cross-check.
 */
import { Matrix4, Vector3 } from "three";

/** Flips Y and Z, scales to meters, then lifts by -floorY so the floor ends up at y = 0. */
export function marbleToThree(metricScaleFactor: number, floorY = 0): Matrix4 {
  const s = metricScaleFactor > 0 ? metricScaleFactor : 1;
  const flipAndScale = new Matrix4().makeScale(s, -s, -s);
  return new Matrix4().makeTranslation(0, -floorY, 0).multiply(flipAndScale);
}

/**
 * Floor height of a mesh already flipped and scaled (marbleToThree(s, 0)): the lowest large
 * horizontal surface. Horizontal triangles are binned by height (5 cm) and weighted by area;
 * the floor is the lowest bin with at least 30% of the biggest bin's area, so table tops and
 * the ceiling do not win.
 */
export function floorHeight(
  positions: ArrayLike<number>,
  index?: ArrayLike<number> | null,
  binSize = 0.05,
): number {
  const a = new Vector3();
  const b = new Vector3();
  const c = new Vector3();
  const ab = new Vector3();
  const ac = new Vector3();
  const bins = new Map<number, number>();
  const triangles = index ? index.length / 3 : positions.length / 9;
  const vertex = (i: number, out: Vector3) =>
    out.set(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);

  for (let t = 0; t < triangles; t++) {
    const i0 = index ? index[t * 3] : t * 3;
    const i1 = index ? index[t * 3 + 1] : t * 3 + 1;
    const i2 = index ? index[t * 3 + 2] : t * 3 + 2;
    vertex(i0, a);
    vertex(i1, b);
    vertex(i2, c);
    const normal = ab.subVectors(b, a).cross(ac.subVectors(c, a));
    const doubleArea = normal.length();
    if (doubleArea === 0 || Math.abs(normal.y) / doubleArea < 0.9) continue; // not horizontal
    const bin = Math.round((a.y + b.y + c.y) / 3 / binSize);
    bins.set(bin, (bins.get(bin) ?? 0) + doubleArea / 2);
  }
  if (bins.size === 0) return 0;

  const biggest = Math.max(...bins.values());
  const lowest = Math.min(
    ...[...bins].filter(([, area]) => area >= 0.3 * biggest).map(([bin]) => bin),
  );
  return lowest * binSize;
}
