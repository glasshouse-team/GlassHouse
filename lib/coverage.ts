/**
 * Coverage score (GH-21): how much of a home's 3D was filmed by the host rather than
 * filled in by AI. GH-19 writes `worlds.coverage_score` (0..1) per spot world (D-009);
 * a listing shows the mean over the spots of its published version. Pure, no I/O.
 */

/** The worlds columns the score needs. */
export interface CoverageWorld {
  id: string;
  listing_id: string;
  version: number;
  spot: string;
  status: string;
  coverage_score: number | null;
}

export interface ListingCoverage {
  /** Mean coverage over the scored spots, 0..1. */
  score: number;
  /** Spots that have a score. */
  scoredSpots: number;
  /** Spots in the published tour. */
  totalSpots: number;
}

/**
 * The published tour's coverage. `publishedWorldId` is `listings.published_world_id`, the
 * entry spot of the published version (0002). Every version has one row per spot (D-031: a
 * fill-in copies the other spots' rows), so the score is
 * the mean over the rows with the entry's (listing_id, version). Spots without a score are
 * left out; null when none is scored.
 */
export function publishedCoverage(
  publishedWorldId: string | null,
  worlds: readonly CoverageWorld[],
): ListingCoverage | null {
  if (!publishedWorldId) return null;
  const entry = worlds.find((w) => w.id === publishedWorldId);
  if (!entry) return null;

  const bySpot = new Map<string, CoverageWorld>();
  for (const w of worlds) {
    if (w.listing_id === entry.listing_id && w.version === entry.version) bySpot.set(w.spot, w);
  }

  const scores = [...bySpot.values()]
    .map((w) => w.coverage_score)
    .filter((s): s is number => s !== null && Number.isFinite(s));
  if (scores.length === 0) return null;
  const mean = scores.reduce((sum, s) => sum + s, 0) / scores.length;
  return {
    score: Math.min(1, Math.max(0, mean)),
    scoredSpots: scores.length,
    totalSpots: bySpot.size,
  };
}

/** Whole percent, rounded down so a home never looks better filmed than it is. */
export function coveragePercent(score: number): number {
  const clamped = Math.min(1, Math.max(0, score));
  // The epsilon keeps 0.29 (0.28999...) at 29 instead of 28.
  return Math.floor(clamped * 100 + 1e-9);
}

/** "92% filmed". */
export function formatCoverage(score: number): string {
  return `${coveragePercent(score)}% filmed`;
}

/** The tooltip text under the badge. */
export function coverageExplanation(coverage: ListingCoverage): string {
  const pct = coveragePercent(coverage.score);
  const base = `${pct}% of what the 3D tour shows was filmed by the host. The rest was filled in by AI and is marked amber in the tour.`;
  if (coverage.totalSpots <= 1) return base;
  const rooms =
    coverage.scoredSpots === coverage.totalSpots
      ? `all ${coverage.totalSpots} rooms of the tour`
      : `the ${coverage.scoredSpots} of ${coverage.totalSpots} rooms checked so far`;
  return `${base} Average over ${rooms}.`;
}
