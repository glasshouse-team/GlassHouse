/**
 * Voting over repeated gap checks of one spot world (GH-19, owner: Temuri, D-047). One vision
 * run finds the invented kitchen wall most of the time and adds a few false gaps; the false ones
 * move around between runs while the real one stays. So the check runs 3 times and keeps a gap
 * only when at least 2 runs place a gap within 1 m of it. Plus the evaluation numbers the script
 * prints (found the known gap? how many false gaps?). Pure, no I/O.
 */
import type { GapIssue, Vec3 } from "@/lib/schemas/world";
import { MERGE_DISTANCE_M, type PlacedGap } from "./gap-findings";

export const VOTE_RUNS = 3;
export const MIN_VOTES = 2;

export interface VotedGap extends PlacedGap {
  /** Runs (0-based) that found this gap. */
  runs: number[];
}

function dist(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

const mm = (v: number) => Math.round(v * 1000) / 1000 + 0;

function mostCommon<T>(values: readonly T[]): T {
  const counts = new Map<T, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

/**
 * Clusters the gaps of all runs (greedy: the most severe first; a gap joins the first cluster
 * whose centre is within `within` m) and keeps clusters found by at least `minVotes` different
 * runs. A kept gap sits at its members' centre, with the most common issue, the median severity
 * (rounded up) and the description of its most severe member. Most votes first.
 */
export function voteGaps(
  runs: readonly (readonly PlacedGap[])[],
  options: { minVotes?: number; within?: number } = {},
): VotedGap[] {
  const minVotes = options.minVotes ?? MIN_VOTES;
  const within = options.within ?? MERGE_DISTANCE_M;
  const all = runs
    .flatMap((gaps, run) => gaps.map((g) => ({ g, run })))
    .sort((a, b) => b.g.severity - a.g.severity);
  const clusters: { centre: Vec3; members: { g: PlacedGap; run: number }[] }[] = [];
  for (const m of all) {
    const near = clusters.find((c) => dist(c.centre, m.g.position) <= within);
    if (!near) {
      clusters.push({ centre: { ...m.g.position }, members: [m] });
      continue;
    }
    near.members.push(m);
    const n = near.members.length;
    near.centre = {
      x: near.members.reduce((s, x) => s + x.g.position.x, 0) / n,
      y: near.members.reduce((s, x) => s + x.g.position.y, 0) / n,
      z: near.members.reduce((s, x) => s + x.g.position.z, 0) / n,
    };
  }
  return clusters
    .map((c) => {
      const runIds = [...new Set(c.members.map((m) => m.run))].sort((a, b) => a - b);
      const top = c.members[0].g; // most severe (sorted above)
      const severities = c.members.map((m) => m.g.severity).sort((a, b) => a - b);
      const severity = severities[Math.floor(severities.length / 2)];
      const issue: GapIssue = mostCommon(c.members.map((m) => m.g.issue));
      const viewIds = [...new Set(c.members.flatMap((m) => m.g.viewIds))].sort();
      return {
        ...top,
        issue,
        severity,
        position: { x: mm(c.centre.x), y: mm(c.centre.y), z: mm(c.centre.z) },
        viewIds,
        runs: runIds,
      };
    })
    .filter((g) => g.runs.length >= minVotes)
    .sort((a, b) => b.runs.length - a.runs.length || b.severity - a.severity);
}

/** True when one of `gaps` lies within `within` m of `target`. */
export function foundNear(
  gaps: readonly { position: Vec3 }[],
  target: Vec3,
  within = MERGE_DISTANCE_M,
): boolean {
  return gaps.some((g) => dist(g.position, target) <= within);
}

/**
 * False gaps of a check: gaps of severity `minSeverity`+ that are not within `within` m of a
 * known real gap.
 */
export function falseGaps<G extends { position: Vec3; severity: number }>(
  gaps: readonly G[],
  knownPositions: readonly Vec3[] = [],
  minSeverity = 2,
  within = MERGE_DISTANCE_M,
): G[] {
  return gaps.filter(
    (g) => g.severity >= minSeverity && !knownPositions.some((k) => dist(g.position, k) <= within),
  );
}

/** Measured result of an evaluation on the hero 2 kitchen (D-047 target). */
export interface EvaluationNumbers {
  /** Evaluation runs (each a 3-run vote) that found the known gap within 1 m. */
  knownFound: number;
  evaluations: number;
  /** Largest number of false gaps (severity 2+) over all v2 spot worlds in one evaluation. */
  maxFalseGapsV2: number;
}

/** D-047 target: the known wall in every evaluation and at most 1 false gap on v2. */
export function targetMet(n: EvaluationNumbers): boolean {
  return n.evaluations >= 3 && n.knownFound === n.evaluations && n.maxFalseGapsV2 <= 1;
}

/**
 * The last measured evaluation on hero 2 (`pnpm gaps --check hero-2 --rings ~/Desktop/house
 * --evaluate 3`, D-047). null until measured. `--write` stores nothing unless it meets the target.
 * 2026-10-18, partial (the Anthropic credits ran out during evaluation 1 of 3): kitchen v1's wall
 * found in both full passes made (3 of 3 runs and 2 of 3 runs, at 0.06 m from the known gap);
 * bathroom, bedroom and entrance (v1 = v2 files): 0 false gaps after the second look (it dropped
 * 2 voted false gaps); living room and kitchen v2 not measured. So still null.
 */
export const MEASURED_HERO2: EvaluationNumbers | null = null;

/**
 * Whether `--write` may store a check: only when the measured evaluation met the target, and
 * never a pass that missed a known gap it was run on (that pass is not reliable either).
 */
export function writeGate(
  measured: EvaluationNumbers | null,
  pass: readonly { missedKnown: boolean }[],
): { ok: true } | { ok: false; reason: string } {
  if (!measured) return { ok: false, reason: "the check has no measured evaluation yet" };
  if (!targetMet(measured))
    return {
      ok: false,
      reason:
        `the measured evaluation missed the target (known gap in ${measured.knownFound} of ` +
        `${measured.evaluations}, up to ${measured.maxFalseGapsV2} false gaps on v2)`,
    };
  if (pass.some((p) => p.missedKnown))
    return { ok: false, reason: "this pass missed the known invented wall" };
  return { ok: true };
}
