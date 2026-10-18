/**
 * Room outlines and areas from straight walls (owner: Temuri, GH-18 v2). Pure functions, meters,
 * [x, z] on the floor plane, the spot (capture point) at the origin of the spot's frame.
 *
 * roomOutline: turn the walls onto the axes (by the room's main wall angle), close doorway gaps
 * (bridge collinear wall pieces and run wall ends on to a perpendicular wall, up to about 1.2 m),
 * rasterize them on a 5 cm grid, flood-fill the free space from the spot, trace the region's
 * outer boundary, snap its edges back onto the wall lines and turn it back. When the space
 * around the spot is not closed (an opening wider than the gap limit, or no walls on a side) it
 * falls back to the oriented bounding box: the footprint given by the caller, else the box of
 * the wall points around the spot. Areas use the shoelace formula.
 */
import type { Point2, Segment2 } from "./slice";
import { dominantAngle, rotatePoint, type Wall } from "./walls";

/** Signed area (shoelace): positive when the points run counter-clockwise from +x toward +z. */
export function signedArea(polygon: Point2[]): number {
  let sum = 0;
  for (let i = 0; i < polygon.length; i++) {
    const [x1, z1] = polygon[i];
    const [x2, z2] = polygon[(i + 1) % polygon.length];
    sum += x1 * z2 - x2 * z1;
  }
  return sum / 2;
}

/** Area of a simple polygon in m2 (0 for fewer than 3 points). */
export function polygonArea(polygon: Point2[]): number {
  return polygon.length < 3 ? 0 : Math.abs(signedArea(polygon));
}

/** Area centroid; the mean of the points for a degenerate polygon. */
export function polygonCentroid(polygon: Point2[]): Point2 {
  const a = signedArea(polygon);
  if (polygon.length === 0) return [0, 0];
  if (Math.abs(a) < 1e-9) {
    const n = polygon.length;
    return [polygon.reduce((s, p) => s + p[0], 0) / n, polygon.reduce((s, p) => s + p[1], 0) / n];
  }
  let cx = 0;
  let cz = 0;
  for (let i = 0; i < polygon.length; i++) {
    const [x1, z1] = polygon[i];
    const [x2, z2] = polygon[(i + 1) % polygon.length];
    const cross = x1 * z2 - x2 * z1;
    cx += (x1 + x2) * cross;
    cz += (z1 + z2) * cross;
  }
  return [cx / (6 * a), cz / (6 * a)];
}

/** Even-odd point in polygon test. */
export function pointInPolygon([x, z]: Point2, polygon: Point2[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, zi] = polygon[i];
    const [xj, zj] = polygon[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** Main axis of a polygon (the dominant angle of its edges, [0, pi/2)) and its extents. */
export function polygonExtents(polygon: Point2[]): {
  angle: number;
  /** Extent along the angle and across it. */
  alongX: number;
  alongZ: number;
  /** Shorter and longer extent: a room's width and length. */
  width: number;
  length: number;
} {
  const segments: Segment2[] = polygon.map((p, i) => [p, polygon[(i + 1) % polygon.length]]);
  const angle = dominantAngle(segments);
  const local = polygon.map((p) => rotatePoint(p, -angle));
  const xs = local.map((p) => p[0]);
  const zs = local.map((p) => p[1]);
  const alongX = polygon.length ? Math.max(...xs) - Math.min(...xs) : 0;
  const alongZ = polygon.length ? Math.max(...zs) - Math.min(...zs) : 0;
  return {
    angle,
    alongX,
    alongZ,
    width: Math.min(alongX, alongZ),
    length: Math.max(alongX, alongZ),
  };
}

/** A rectangle in a frame turned by `angle`: bounds there, corners back in the outer frame. */
export interface OrientedBox {
  angle: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export function boxCorners(b: OrientedBox): Point2[] {
  return (
    [
      [b.minX, b.minZ],
      [b.maxX, b.minZ],
      [b.maxX, b.maxZ],
      [b.minX, b.maxZ],
    ] as Point2[]
  ).map((p) => rotatePoint(p, b.angle));
}

export interface OutlineOptions {
  /** Grid cell size (meters). */
  cell: number;
  /** Doorway gaps up to this wide are closed (meters). */
  maxGap: number;
  /** Wall pieces whose offsets differ by at most this count as one line (meters). */
  offsetTol: number;
  /** Walls farther than this from the spot are ignored (meters). */
  maxRadius: number;
  /** A closed region smaller than this is not a room (m2): fall back. */
  minArea: number;
  /** A closed region larger than this has leaked through an opening (m2): fall back. */
  maxArea: number;
  /** A "bounded" outline must keep at least this share of the box's area (else: the box). */
  minBoundedShare: number;
  /** Steps in the outline shallower than this are straightened out (meters): scan noise. */
  minJog: number;
  /** Bounding box to fall back on (e.g. the v1 footprint); else the box of the wall points. */
  fallback?: OrientedBox | null;
}

export const DEFAULT_OUTLINE_OPTIONS: OutlineOptions = {
  cell: 0.05,
  maxGap: 1.2,
  offsetTol: 0.1,
  maxRadius: 8,
  minArea: 2,
  maxArea: 80,
  minBoundedShare: 0.7,
  minJog: 0.1,
};

export interface RoomOutline {
  /** Closed outline in the input frame, counter-clockwise, no repeated first point. */
  polygon: Point2[];
  area_m2: number;
  /**
   * "walls": the walls close a loop around the spot; "bounded": walls inside the fallback box,
   * its sides closing what the scan left open; "box": the oriented bounding box.
   */
  method: "walls" | "bounded" | "box";
}

interface Line {
  /** z of a horizontal line, x of a vertical one. */
  offset: number;
  from: number;
  to: number;
}

/** Splits local-frame walls into horizontal and vertical lines (others are kept as-is). */
function axisLines(walls: Wall[]) {
  const h: Line[] = [];
  const v: Line[] = [];
  const other: Wall[] = [];
  for (const w of walls) {
    const [x1, z1, x2, z2] = w;
    const len = Math.hypot(x2 - x1, z2 - z1);
    if (len < 1e-6) continue;
    if (Math.abs(z2 - z1) <= 1e-4 * Math.max(1, len))
      h.push({ offset: (z1 + z2) / 2, from: Math.min(x1, x2), to: Math.max(x1, x2) });
    else if (Math.abs(x2 - x1) <= 1e-4 * Math.max(1, len))
      v.push({ offset: (x1 + x2) / 2, from: Math.min(z1, z2), to: Math.max(z1, z2) });
    else other.push(w);
  }
  return { h, v, other };
}

/**
 * Doorway closers: segments bridging collinear pieces less than maxGap apart, and wall ends run
 * on to the first perpendicular wall within maxGap. Returned as lines in the same orientation.
 */
export function closeGaps(
  h: Line[],
  v: Line[],
  maxGap: number,
  offsetTol: number,
): { h: Line[]; v: Line[] } {
  const bridges = (lines: Line[]): Line[] => {
    const out: Line[] = [];
    const sorted = [...lines].sort((a, b) => a.offset - b.offset);
    for (let i = 0; i < sorted.length; i++) {
      for (let j = 0; j < sorted.length; j++) {
        if (i === j) continue;
        const a = sorted[i];
        const b = sorted[j];
        if (Math.abs(a.offset - b.offset) > offsetTol) continue;
        const gap = b.from - a.to;
        if (gap <= 1e-9 || gap > maxGap) continue;
        // Only bridge to the nearest piece after a.
        const nearer = sorted.some(
          (c, k) =>
            k !== i &&
            k !== j &&
            Math.abs(c.offset - a.offset) <= offsetTol &&
            c.to > a.to + 1e-9 &&
            c.from < b.from - 1e-9,
        );
        if (!nearer) out.push({ offset: (a.offset + b.offset) / 2, from: a.to, to: b.from });
      }
    }
    return out;
  };
  // Run each end of `lines` along its own direction to the nearest crossing line within maxGap.
  const extend = (lines: Line[], cross: Line[]): Line[] => {
    const out: Line[] = [];
    for (const l of lines) {
      for (const sign of [-1, 1]) {
        const end = sign > 0 ? l.to : l.from;
        let best: number | null = null;
        for (const c of cross) {
          const d = (c.offset - end) * sign;
          if (d <= 1e-9 || d > maxGap) continue;
          if (l.offset < c.from - offsetTol || l.offset > c.to + offsetTol) continue;
          if (best === null || d < best) best = d;
        }
        if (best !== null) {
          const target = end + sign * best;
          out.push({ offset: l.offset, from: Math.min(end, target), to: Math.max(end, target) });
        }
      }
    }
    return out;
  };
  return {
    h: [...bridges(h), ...extend(h, v)],
    v: [...bridges(v), ...extend(v, h)],
  };
}

/** Grid over the local frame: cell (i, j) covers [x0 + i c, +c) x [z0 + j c, +c). */
interface Grid {
  x0: number;
  z0: number;
  c: number;
  nx: number;
  nz: number;
  cells: Uint8Array;
}

function markSegment(g: Grid, p: Point2, q: Point2) {
  const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
  const steps = Math.max(1, Math.ceil(len / (g.c / 2)));
  let prev: [number, number] | null = null;
  for (let k = 0; k <= steps; k++) {
    const t = k / steps;
    const i = Math.floor((p[0] + t * (q[0] - p[0]) - g.x0) / g.c);
    const j = Math.floor((p[1] + t * (q[1] - p[1]) - g.z0) / g.c);
    if (i < 0 || j < 0 || i >= g.nx || j >= g.nz) continue;
    g.cells[j * g.nx + i] = 1;
    // Keep the line 4-connected so a 4-connected fill cannot slip through a diagonal step.
    if (prev && prev[0] !== i && prev[1] !== j) g.cells[prev[1] * g.nx + i] = 1;
    prev = [i, j];
  }
}

/** 4-connected flood fill from (si, sj) over free cells. Null when it reaches the grid border. */
function floodFill(g: Grid, si: number, sj: number): Uint8Array | null {
  const region = new Uint8Array(g.nx * g.nz);
  const stack = [sj * g.nx + si];
  region[stack[0]] = 1;
  while (stack.length > 0) {
    const k = stack.pop()!;
    const i = k % g.nx;
    const j = (k - i) / g.nx;
    if (i === 0 || j === 0 || i === g.nx - 1 || j === g.nz - 1) return null;
    for (const n of [k - 1, k + 1, k - g.nx, k + g.nx]) {
      if (!region[n] && !g.cells[n]) {
        region[n] = 1;
        stack.push(n);
      }
    }
  }
  return region;
}

/** Nearest free cell to (si, sj) within `radius` cells (Chebyshev rings), or null. */
function nearestFree(g: Grid, si: number, sj: number, radius: number): [number, number] | null {
  for (let r = 0; r <= radius; r++) {
    for (let dj = -r; dj <= r; dj++) {
      for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const i = si + di;
        const j = sj + dj;
        if (i <= 0 || j <= 0 || i >= g.nx - 1 || j >= g.nz - 1) continue;
        if (!g.cells[j * g.nx + i]) return [i, j];
      }
    }
  }
  return null;
}

/**
 * Outer boundary of a cell region as a rectilinear polygon in grid corner coordinates
 * (counter-clockwise, collinear points removed): the longest loop of boundary edges.
 */
export function traceRegion(region: Uint8Array, nx: number, nz: number): Point2[] {
  const inside = (i: number, j: number) =>
    i >= 0 && j >= 0 && i < nx && j < nz && region[j * nx + i] === 1;
  // Directed boundary edges with the region on the left (counter-clockwise around each cell).
  const out = new Map<number, number[]>();
  const vkey = (i: number, j: number) => j * (nx + 1) + i;
  const add = (a: [number, number], b: [number, number]) => {
    const k = vkey(a[0], a[1]);
    const list = out.get(k);
    const v = vkey(b[0], b[1]);
    if (list) list.push(v);
    else out.set(k, [v]);
  };
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      if (!inside(i, j)) continue;
      if (!inside(i, j - 1)) add([i, j], [i + 1, j]);
      if (!inside(i + 1, j)) add([i + 1, j], [i + 1, j + 1]);
      if (!inside(i, j + 1)) add([i + 1, j + 1], [i, j + 1]);
      if (!inside(i - 1, j)) add([i, j + 1], [i, j]);
    }
  }
  const point = (k: number): Point2 => [k % (nx + 1), Math.floor(k / (nx + 1))];
  let best: Point2[] = [];
  let bestArea = 0;
  for (const start of [...out.keys()]) {
    while (out.get(start)?.length) {
      const loop: Point2[] = [];
      let at = start;
      do {
        loop.push(point(at));
        const next = out.get(at)!.pop()!;
        if (out.get(at)!.length === 0) out.delete(at);
        at = next;
      } while (at !== start && out.has(at));
      const area = Math.abs(signedArea(loop));
      if (area > bestArea) {
        bestArea = area;
        best = loop;
      }
    }
  }
  return simplifyCollinear(best);
}

/** Drops repeated points and points on a straight line between their neighbours. */
export function simplifyCollinear(polygon: Point2[], eps = 1e-9): Point2[] {
  let pts = polygon.filter(
    (p, i) =>
      Math.hypot(
        p[0] - polygon[(i + 1) % polygon.length][0],
        p[1] - polygon[(i + 1) % polygon.length][1],
      ) > eps,
  );
  let changed = true;
  while (changed && pts.length > 3) {
    changed = false;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[(i + pts.length - 1) % pts.length];
      const b = pts[i];
      const c = pts[(i + 1) % pts.length];
      const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
      if (Math.abs(cross) <= eps) {
        pts = pts.filter((_, k) => k !== i);
        changed = true;
        break;
      }
    }
  }
  pts = pts.filter(
    (p, i) =>
      Math.hypot(p[0] - pts[(i + 1) % pts.length][0], p[1] - pts[(i + 1) % pts.length][1]) > eps,
  );
  return pts;
}

/**
 * Straightens shallow steps out of a rectilinear polygon: an edge shorter than `minJog` between
 * two parallel edges is removed by moving the shorter of the two onto the longer one's line.
 */
export function removeJogs(polygon: Point2[], minJog: number): Point2[] {
  let pts = polygon.map((p) => [...p] as Point2);
  for (let guard = 0; guard < 1000 && pts.length > 4; guard++) {
    const n = pts.length;
    let changed = false;
    for (let i = 0; i < n; i++) {
      const a = pts[(i + n - 1) % n];
      const p = pts[i];
      const q = pts[(i + 1) % n];
      const b = pts[(i + 2) % n];
      const jog = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (jog >= minJog) continue;
      const jogVertical = Math.abs(q[0] - p[0]) < 1e-9;
      const jogHorizontal = Math.abs(q[1] - p[1]) < 1e-9;
      if (!jogVertical && !jogHorizontal) continue;
      // The neighbours run across the jog (along x for a vertical jog).
      const k = jogVertical ? 1 : 0;
      if (Math.abs(a[k] - p[k]) > 1e-9 || Math.abs(b[k] - q[k]) > 1e-9) continue;
      const before = Math.hypot(p[0] - a[0], p[1] - a[1]);
      const after = Math.hypot(b[0] - q[0], b[1] - q[1]);
      if (before <= after) {
        a[k] = q[k];
        p[k] = q[k];
      } else {
        q[k] = p[k];
        b[k] = p[k];
      }
      changed = true;
      break;
    }
    if (!changed) break;
    pts = simplifyCollinear(pts, 1e-9);
  }
  return pts;
}

/**
 * Moves each axis-aligned edge of a rectilinear polygon onto the nearest parallel line within
 * `tol` that overlaps it (the raster puts edges up to one cell inside the wall line).
 */
export function snapToLines(polygon: Point2[], h: Line[], v: Line[], tol: number): Point2[] {
  const pts = polygon.map((p) => [...p] as Point2);
  const n = pts.length;
  const targets = pts.map(() => ({ x: null as number | null, z: null as number | null }));
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const vertical = Math.abs(a[0] - b[0]) < 1e-9;
    const horizontal = Math.abs(a[1] - b[1]) < 1e-9;
    if (!vertical && !horizontal) continue;
    const lines = vertical ? v : h;
    const offset = vertical ? a[0] : a[1];
    const lo = vertical ? Math.min(a[1], b[1]) : Math.min(a[0], b[0]);
    const hi = vertical ? Math.max(a[1], b[1]) : Math.max(a[0], b[0]);
    let best: number | null = null;
    for (const l of lines) {
      const d = Math.abs(l.offset - offset);
      if (d > tol || Math.min(hi, l.to) - Math.max(lo, l.from) <= 0) continue;
      if (best === null || d < Math.abs(best - offset)) best = l.offset;
    }
    if (best === null) continue;
    const key = vertical ? "x" : "z";
    targets[i][key] = best;
    targets[(i + 1) % n][key] = best;
  }
  for (let i = 0; i < n; i++) {
    if (targets[i].x !== null) pts[i][0] = targets[i].x!;
    if (targets[i].z !== null) pts[i][1] = targets[i].z!;
  }
  return simplifyCollinear(pts, 1e-6);
}

/** Bounding box (in a frame turned by `angle`) of the wall points within `radius` of the spot. */
export function wallPointsBox(walls: Wall[], angle: number, radius: number): OrientedBox | null {
  const pts = walls
    .flatMap(([x1, z1, x2, z2]): Point2[] => [
      [x1, z1],
      [x2, z2],
    ])
    .filter(([x, z]) => Math.hypot(x, z) <= radius)
    .map((p) => rotatePoint(p, -angle));
  if (pts.length < 2) return null;
  const xs = pts.map((p) => p[0]);
  const zs = pts.map((p) => p[1]);
  const box = {
    angle,
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minZ: Math.min(...zs),
    maxZ: Math.max(...zs),
  };
  const inside = box.minX < 0 && box.maxX > 0 && box.minZ < 0 && box.maxZ > 0;
  return inside && (box.maxX - box.minX) * (box.maxZ - box.minZ) > 1e-6 ? box : null;
}

/** Flood-fills from the spot inside the given local-frame lines; the snapped outline, or null. */
function fillOutline(h: Line[], v: Line[], other: Wall[], opts: OutlineOptions): Point2[] | null {
  const c = opts.cell;
  const xs = [0, ...h.flatMap((l) => [l.from, l.to]), ...v.map((l) => l.offset)];
  const zs = [0, ...h.map((l) => l.offset), ...v.flatMap((l) => [l.from, l.to])];
  for (const [x1, z1, x2, z2] of other) {
    xs.push(x1, x2);
    zs.push(z1, z2);
  }
  const pad = 3 * c;
  const x0 = Math.min(...xs) - pad;
  const z0 = Math.min(...zs) - pad;
  const nx = Math.ceil((Math.max(...xs) + pad - x0) / c);
  const nz = Math.ceil((Math.max(...zs) + pad - z0) / c);
  const grid: Grid = { x0, z0, c, nx, nz, cells: new Uint8Array(nx * nz) };
  for (const l of h) markSegment(grid, [l.from, l.offset], [l.to, l.offset]);
  for (const l of v) markSegment(grid, [l.offset, l.from], [l.offset, l.to]);
  for (const [x1, z1, x2, z2] of other) markSegment(grid, [x1, z1], [x2, z2]);

  // Start at the spot, or the nearest free cell within 30 cm (a spot right against a wall).
  const seed = nearestFree(grid, Math.floor(-x0 / c), Math.floor(-z0 / c), Math.ceil(0.3 / c));
  if (!seed) return null;
  const region = floodFill(grid, seed[0], seed[1]);
  if (!region) return null;
  const traced = traceRegion(region, nx, nz).map(([i, j]): Point2 => [x0 + i * c, z0 + j * c]);
  const snapped = removeJogs(snapToLines(traced, h, v, 1.5 * c), opts.minJog);
  const area = polygonArea(snapped);
  return snapped.length >= 4 && area >= opts.minArea && area <= opts.maxArea ? snapped : null;
}

/** The four sides of a box (in its own turned frame) as lines. */
function boxLines(b: OrientedBox): { h: Line[]; v: Line[] } {
  return {
    h: [
      { offset: b.minZ, from: b.minX, to: b.maxX },
      { offset: b.maxZ, from: b.minX, to: b.maxX },
    ],
    v: [
      { offset: b.minX, from: b.minZ, to: b.maxZ },
      { offset: b.maxX, from: b.minZ, to: b.maxZ },
    ],
  };
}

/**
 * The room around the spot (see the file comment). `angle` is the room's main wall angle
 * (walls.ts). Tries, in order: (1) "walls": the walls alone close a loop around the spot; (2)
 * "bounded": the walls inside the fallback box, its sides closing what the scan left open, when
 * that keeps at least `minBoundedShare` of the box and is not just the box; (3) "box": the
 * fallback box itself, else the box of the wall points. Null only with nothing to fall back on.
 */
export function roomOutline(
  walls: Wall[],
  angle: number,
  options: Partial<OutlineOptions> = {},
): RoomOutline | null {
  const opts = { ...DEFAULT_OUTLINE_OPTIONS, ...options };
  const box = opts.fallback ?? wallPointsBox(walls, angle, opts.maxRadius);
  const result = (polygon: Point2[], method: RoomOutline["method"]): RoomOutline => {
    if (signedArea(polygon) < 0) polygon.reverse();
    return { polygon, area_m2: polygonArea(polygon), method };
  };
  const toOuter = (local: Point2[]) => local.map((p) => rotatePoint(p, angle));
  const near = walls.filter(([x1, z1, x2, z2]) => {
    // Closest point of the segment to the spot.
    const ex = x2 - x1;
    const ez = z2 - z1;
    const len2 = ex * ex + ez * ez;
    const t = len2 > 0 ? Math.max(0, Math.min(1, -(x1 * ex + z1 * ez) / len2)) : 0;
    return Math.hypot(x1 + t * ex, z1 + t * ez) <= opts.maxRadius;
  });
  const local = near.map(([x1, z1, x2, z2]) => [
    ...rotatePoint([x1, z1], -angle),
    ...rotatePoint([x2, z2], -angle),
  ]) as Wall[];
  const { h, v, other } = axisLines(local);
  if (near.length >= 2) {
    const closers = closeGaps(h, v, opts.maxGap, opts.offsetTol);
    const closed = fillOutline([...h, ...closers.h], [...v, ...closers.v], other, opts);
    if (closed) return result(toOuter(closed), "walls");
  }
  if (!box) return null;
  // Bounded: only when the box is in the walls' turned frame (true for the v1 footprint).
  if (near.length >= 1 && Math.abs(box.angle - angle) < 1e-9) {
    const sides = boxLines(box);
    const within = (l: Line, lo: number, hi: number) => l.offset > lo && l.offset < hi;
    const ih = [...h.filter((l) => within(l, box.minZ, box.maxZ)), ...sides.h];
    const iv = [...v.filter((l) => within(l, box.minX, box.maxX)), ...sides.v];
    const closers = closeGaps(ih, iv, opts.maxGap, opts.offsetTol);
    const bounded = fillOutline([...ih, ...closers.h], [...iv, ...closers.v], other, opts);
    const boxArea = (box.maxX - box.minX) * (box.maxZ - box.minZ);
    if (bounded && bounded.length > 4 && polygonArea(bounded) >= opts.minBoundedShare * boxArea)
      return result(toOuter(bounded), "bounded");
  }
  return result(boxCorners(box), "box");
}
