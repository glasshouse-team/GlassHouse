/**
 * CONTRACT (owner: Temuri). The only Marble -> three.js coordinate transform.
 * The viewer (GH-11), floor plan (GH-18) and gap check (GH-19) all use it, so anchors,
 * gaps and plan coordinates line up.
 *
 * Marble worlds use OpenCV axes (+y down, +z forward; docs.worldlabs.ai export specs).
 * three.js uses +y up, -z forward. Result: meters, floor at y = 0.
 * World Labs grounds the splat with `metric.y -= ground_plane_offset` (meters, after scaling), so
 * after the flip the floor is at y = -ground_plane_offset. GH-3 measured that within 3 cm on video
 * worlds, but on a 4-photo world the offset marked a bed top, so the floor is measured from the
 * collider mesh (floorHeight) and the offset is only a cross-check (D-009).
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
 * horizontal surface below the capture camera at the origin. Horizontal triangles are binned by
 * height (5 cm) and weighted by area; a layer is a bin whose area summed with its two neighbours
 * is a local maximum, so a floor that is a few cm uneven counts once. The floor is the lowest
 * layer at least 30 cm under the origin with 30% of the biggest such layer's area: the ceiling
 * (often the biggest flat surface) is never compared, and bed and table tops do not win (GH-3).
 * Without any layer under the origin, all layers count.
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

  const area = (bin: number) => bins.get(bin) ?? 0;
  const layerArea = (bin: number) => area(bin - 1) + area(bin) + area(bin + 1);
  const nearby = new Set([...bins.keys()].flatMap((bin) => [bin - 1, bin, bin + 1]));
  const layers = [...nearby].filter(
    (bin) => layerArea(bin) >= layerArea(bin - 1) && layerArea(bin) > layerArea(bin + 1),
  );
  const belowCamera = layers.filter((bin) => bin * binSize <= -0.3);
  const candidates = belowCamera.length > 0 ? belowCamera : layers;
  const biggest = Math.max(...candidates.map(layerArea));
  const floor = Math.min(...candidates.filter((bin) => layerArea(bin) >= 0.3 * biggest));
  // Area-weighted height of the floor layer's three bins.
  const weighted =
    (floor - 1) * area(floor - 1) + floor * area(floor) + (floor + 1) * area(floor + 1);
  return (weighted / layerArea(floor)) * binSize;
}
