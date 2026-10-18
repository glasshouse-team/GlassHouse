/**
 * Straight walls from horizontal slices of a collider mesh (owner: Temuri, GH-18).
 * Meters, [x, z] on the floor plane (lib/geometry/slice.ts). Steps: main wall angle from a
 * length-weighted angle histogram (mod 90 degrees), rotate so walls are axis-aligned, keep only
 * segments on cells of a 5 cm grid hit by at least 2 of the 3 slices (drops furniture tops and
 * noise), snap to the axes, merge collinear pieces, drop short ones, rotate back.
 */
import { segmentLength, sliceMesh, type Point2, type Segment2 } from "./slice";

/** A wall segment [x1, z1, x2, z2] in meters (FloorPlanSchema.walls). */
export type Wall = [number, number, number, number];

/** Above furniture, below the ceiling (GH-18). */
export const SLICE_HEIGHTS = [1.0, 1.3, 1.6] as const;

export interface WallOptions {
  /** Grid cell size in meters. */
  cell: number;
  /** A grid cell counts as wall when this many slices hit it (or a neighbour cell). */
  minVotes: number;
  /** Segments within this many degrees of an axis snap to it; others are dropped. */
  snapDeg: number;
  /** Merged walls shorter than this are dropped (meters). */
  minLength: number;
  /** Collinear pieces closer than this along the wall are joined (meters). */
  mergeGap: number;
  /** Parallel pieces whose offsets differ by at most this are the same wall (meters). */
  offsetTol: number;
  /** Segments farther than this from the spot (the origin) are ignored (meters). */
  maxRadius: number;
}

export const DEFAULT_WALL_OPTIONS: WallOptions = {
  cell: 0.05,
  minVotes: 2,
  snapDeg: 5,
  minLength: 0.2,
  mergeGap: 0.15,
  offsetTol: 0.1,
  maxRadius: 8,
};

const QUARTER = Math.PI / 2;

/** Angle of a segment folded into [0, 90) degrees, in radians. */
function foldedAngle([p, q]: Segment2): number {
  const a = Math.atan2(q[1] - p[1], q[0] - p[0]);
  return ((a % QUARTER) + QUARTER) % QUARTER;
}

/**
 * Main wall direction in radians, in [0, pi/2): the peak of a length-weighted 1-degree histogram
 * of segment angles mod 90 degrees (smoothed over +-2 degrees), refined by the weighted circular
 * mean of the segments near the peak. 0 when there are no segments.
 */
export function dominantAngle(segments: Segment2[], windowDeg = 3): number {
  const bins = new Float64Array(90);
  for (const s of segments) {
    const deg = (foldedAngle(s) * 180) / Math.PI;
    bins[Math.floor(deg) % 90] += segmentLength(s);
  }
  let peak = 0;
  let best = -1;
  for (let i = 0; i < 90; i++) {
    let sum = 0;
    for (let k = -2; k <= 2; k++) sum += bins[(i + k + 90) % 90];
    if (sum > best) {
      best = sum;
      peak = i + 0.5;
    }
  }
  if (best <= 0) return 0;
  // Circular mean with period 90 degrees: average exp(4i * angle).
  let cx = 0;
  let cy = 0;
  const peakRad = (peak * Math.PI) / 180;
  const window = (windowDeg * Math.PI) / 180;
  for (const s of segments) {
    const a = foldedAngle(s);
    let d = a - peakRad;
    d -= Math.round(d / QUARTER) * QUARTER;
    if (Math.abs(d) > window) continue;
    const w = segmentLength(s);
    cx += w * Math.cos(4 * a);
    cy += w * Math.sin(4 * a);
  }
  const mean = Math.atan2(cy, cx) / 4;
  return ((mean % QUARTER) + QUARTER) % QUARTER;
}

/** Rotates a point by `angle` radians (counter-clockwise in x/z, i.e. from +x toward +z). */
export function rotatePoint([x, z]: Point2, angle: number): Point2 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [x * c - z * s, x * s + z * c];
}

export function rotateSegment([p, q]: Segment2, angle: number): Segment2 {
  return [rotatePoint(p, angle), rotatePoint(q, angle)];
}

const cellKey = (i: number, j: number) => i * 1_000_003 + j;

/** Grid cells a segment passes through (sampled every half cell). */
function segmentCells([p, q]: Segment2, cell: number, out: Set<number>) {
  const steps = Math.max(1, Math.ceil(segmentLength([p, q]) / (cell / 2)));
  for (let k = 0; k <= steps; k++) {
    const t = k / steps;
    const i = Math.floor((p[0] + t * (q[0] - p[0])) / cell);
    const j = Math.floor((p[1] + t * (q[1] - p[1])) / cell);
    out.add(cellKey(i, j));
  }
}

/**
 * Wall grid: number of slices that hit each cell or one of its 8 neighbours (the one-cell
 * dilation absorbs a few cm of drift between slice heights). Keyed by cellKey(i, j).
 */
export function voteGrid(slices: Segment2[][], cell: number): Map<number, number> {
  const votes = new Map<number, number>();
  for (const segments of slices) {
    const hit = new Set<number>();
    for (const s of segments) segmentCells(s, cell, hit);
    const dilated = new Set<number>();
    for (const key of hit) {
      const i = Math.round(key / 1_000_003);
      const j = key - i * 1_000_003;
      for (let di = -1; di <= 1; di++)
        for (let dj = -1; dj <= 1; dj++) dilated.add(cellKey(i + di, j + dj));
    }
    for (const key of dilated) votes.set(key, (votes.get(key) ?? 0) + 1);
  }
  return votes;
}

interface Piece {
  /** z for a horizontal wall, x for a vertical one. */
  offset: number;
  from: number;
  to: number;
}

/** Joins parallel pieces into walls: cluster by offset, then merge intervals along the wall. */
function mergePieces(pieces: Piece[], opts: WallOptions): Piece[] {
  const sorted = [...pieces].sort((a, b) => a.offset - b.offset);
  const clusters: Piece[][] = [];
  for (const piece of sorted) {
    const current = clusters.at(-1);
    if (current && piece.offset - current[0].offset <= opts.offsetTol) current.push(piece);
    else clusters.push([piece]);
  }
  const walls: Piece[] = [];
  for (const cluster of clusters) {
    let weight = 0;
    let sum = 0;
    for (const p of cluster) {
      const w = p.to - p.from;
      weight += w;
      sum += w * p.offset;
    }
    const offset = weight > 0 ? sum / weight : cluster[0].offset;
    const spans = cluster.map((p) => [p.from, p.to]).sort((a, b) => a[0] - b[0]);
    let [from, to] = spans[0];
    const flush = () => {
      if (to - from >= opts.minLength) walls.push({ offset, from, to });
    };
    for (const [a, b] of spans.slice(1)) {
      if (a - to <= opts.mergeGap) to = Math.max(to, b);
      else {
        flush();
        [from, to] = [a, b];
      }
    }
    flush();
  }
  return walls;
}

export interface StraightWalls {
  /** Main wall angle in radians: the walls run along this angle and the one 90 degrees off. */
  angle: number;
  /** Straight walls in the input frame (not rotated). */
  walls: Wall[];
}

/** Straight, axis-snapped walls from several slices of the same room (see the file comment). */
export function straightWalls(
  slices: Segment2[][],
  options: Partial<WallOptions> = {},
): StraightWalls {
  const opts = { ...DEFAULT_WALL_OPTIONS, ...options };
  const near = (s: Segment2) => {
    const mx = (s[0][0] + s[1][0]) / 2;
    const mz = (s[0][1] + s[1][1]) / 2;
    return Math.hypot(mx, mz) <= opts.maxRadius;
  };
  const kept = slices.map((segments) => segments.filter(near));
  const angle = dominantAngle(kept.flat());
  const rotated = kept.map((segments) => segments.map((s) => rotateSegment(s, -angle)));
  const votes = voteGrid(rotated, opts.cell);

  const snap = (opts.snapDeg * Math.PI) / 180;
  const horizontal: Piece[] = [];
  const vertical: Piece[] = [];
  for (const s of rotated.flat()) {
    const [p, q] = s;
    const mid: Point2 = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
    const key = cellKey(Math.floor(mid[0] / opts.cell), Math.floor(mid[1] / opts.cell));
    if ((votes.get(key) ?? 0) < opts.minVotes) continue;
    let a = Math.atan2(q[1] - p[1], q[0] - p[0]);
    a = ((a % Math.PI) + Math.PI) % Math.PI; // [0, pi)
    if (a <= snap || a >= Math.PI - snap) {
      horizontal.push({ offset: mid[1], from: Math.min(p[0], q[0]), to: Math.max(p[0], q[0]) });
    } else if (Math.abs(a - QUARTER) <= snap) {
      vertical.push({ offset: mid[0], from: Math.min(p[1], q[1]), to: Math.max(p[1], q[1]) });
    }
  }

  const walls: Wall[] = [];
  const back = (x: number, z: number) => rotatePoint([x, z], angle);
  for (const w of mergePieces(horizontal, opts)) {
    walls.push([...back(w.from, w.offset), ...back(w.to, w.offset)] as Wall);
  }
  for (const w of mergePieces(vertical, opts)) {
    walls.push([...back(w.offset, w.from), ...back(w.offset, w.to)] as Wall);
  }
  return { angle, walls };
}

/** Slices a collider (meters, floor at y = 0) at SLICE_HEIGHTS and returns its straight walls. */
export function colliderWalls(
  positions: ArrayLike<number>,
  index: ArrayLike<number> | null,
  options: Partial<WallOptions> = {},
  heights: readonly number[] = SLICE_HEIGHTS,
): StraightWalls {
  return straightWalls(
    heights.map((h) => sliceMesh(positions, index, h)),
    options,
  );
}

export function wallLength([x1, z1, x2, z2]: Wall): number {
  return Math.hypot(x2 - x1, z2 - z1);
}
