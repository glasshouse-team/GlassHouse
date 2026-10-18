/**
 * From the Verifier's per-view findings to gaps in 3D (GH-19, owner: Temuri). Pure: the caller
 * casts the rays. Steps: one ray per finding through its box centre, the hit (or 2 m out on a
 * miss) is the gap, gaps within 1 m merge, coverage = views with no issue / all views.
 */
import type { GapIssue, Vec3 } from "@/lib/schemas/world";
import type { GapCheckResult } from "@/lib/schemas/verifier";
import { viewRay, type ViewSpec } from "./gap-views";

/** Rays that miss (a blank area) place the gap this far out (GH-19 build notes). */
export const MISS_DISTANCE_M = 2;
export const MERGE_DISTANCE_M = 1;
export const GAP_RADIUS_M = 1;
/** Longest stored gap description (model text). */
export const MAX_DESCRIPTION = 300;

export interface GapCandidate {
  viewId: string;
  issue: GapIssue;
  description: string;
  severity: number;
  /** Unit ray from the camera through the box centre. */
  dir: Vec3;
  /** The finding's box in its view (0..1), for the confirm step's red box. */
  bbox?: { x: number; y: number; w: number; h: number };
}

export interface PlacedGap extends GapCandidate {
  position: Vec3;
  /** Views merged into this gap. */
  viewIds: string[];
}

/** Findings with an issue and a box, as rays from the view they were seen in. */
export function gapCandidates(result: GapCheckResult, views: readonly ViewSpec[]): GapCandidate[] {
  const out: GapCandidate[] = [];
  for (const f of result.views) {
    if (f.issue === "none" || !f.bbox) continue;
    const view = views.find((v) => v.id === f.view_id);
    if (!view) continue;
    const u = clamp01(f.bbox.x + f.bbox.w / 2);
    const v = clamp01(f.bbox.y + f.bbox.h / 2);
    out.push({
      viewId: f.view_id,
      issue: f.issue,
      description: f.description.trim().slice(0, MAX_DESCRIPTION),
      severity: f.severity ?? 1,
      dir: viewRay(view.yaw, u, v),
      bbox: f.bbox,
    });
  }
  return out;
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const mm = (v: number) => Math.round(v * 1000) / 1000 + 0;

/** The gap position `distance` meters along the ray (2 m when the ray missed). */
export function placeAlongRay(origin: Vec3, dir: Vec3, distance: number | null): Vec3 {
  const d = distance ?? MISS_DISTANCE_M;
  return { x: mm(origin.x + dir.x * d), y: mm(origin.y + dir.y * d), z: mm(origin.z + dir.z * d) };
}

function dist(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

/**
 * Greedy merge: the most severe gap first; every later gap within `within` meters of a kept gap
 * joins it (its view is added; the kept description stays).
 */
export function mergeGaps(
  gaps: readonly (GapCandidate & { position: Vec3 })[],
  within = MERGE_DISTANCE_M,
): PlacedGap[] {
  const sorted = [...gaps].sort((a, b) => b.severity - a.severity);
  const kept: PlacedGap[] = [];
  for (const g of sorted) {
    const near = kept.find((k) => dist(k.position, g.position) <= within);
    if (near) {
      if (!near.viewIds.includes(g.viewId)) near.viewIds.push(g.viewId);
      continue;
    }
    kept.push({ ...g, viewIds: [g.viewId] });
  }
  return kept;
}

/** View ids the result has no finding for (the model must answer every view once). */
export function missingViews(result: GapCheckResult, views: readonly ViewSpec[]): string[] {
  const seen = new Set(result.views.map((f) => f.view_id));
  return views.map((v) => v.id).filter((id) => !seen.has(id));
}

/**
 * Share of the views whose findings are all "none", 0..1 (null without views). A view the model
 * left out does not count as clean; findings for unknown view ids are ignored.
 */
export function viewCoverage(result: GapCheckResult, views: readonly ViewSpec[]): number | null {
  if (views.length === 0) return null;
  const clean = views.filter((v) => {
    const findings = result.views.filter((f) => f.view_id === v.id);
    return findings.length > 0 && findings.every((f) => f.issue === "none");
  });
  return clean.length / views.length;
}

/** True when a stored gap lies within `within` meters of a known gap (so it is not added again). */
export function nearAny(
  position: Vec3,
  others: readonly (Vec3 | null)[],
  within = MERGE_DISTANCE_M,
) {
  return others.some((o) => o !== null && dist(position, o) <= within);
}
