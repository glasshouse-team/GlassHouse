/**
 * Whether a `listing_facts` row is a real Verifier check the X-ray panel may show (GH-9).
 * The seed writes a placeholder row (model "seed") until the X-ray runs, and a row can go stale
 * when the listing's photos are replaced. Neither may say "Checked by Verifier": a fact must
 * point at photos the guest can open. Pure, no I/O.
 */

/** The parts of a `listing_facts` row the check needs (facts and contradictions already parsed). */
export interface XrayRowEvidence {
  model: string | null;
  facts: ReadonlyArray<{ evidence: readonly string[] }>;
  contradictions: ReadonlyArray<{ evidence: readonly string[] }>;
}

/** The seed's placeholder marker (seed/rows.ts `heroFactsRow`). */
export const SEED_MODEL = "seed";

/**
 * True when the row came from the Verifier and every fact cites at least one photo, and every
 * fact and contradiction cites only photos the listing still has (`photoIds` = listing_photos.id).
 */
export function isRealCheck(row: XrayRowEvidence, photoIds: ReadonlySet<string>): boolean {
  if (row.model === SEED_MODEL) return false;
  const known = (ids: readonly string[]) => ids.every((id) => photoIds.has(id));
  return (
    row.facts.every((f) => f.evidence.length > 0 && known(f.evidence)) &&
    row.contradictions.every((c) => known(c.evidence))
  );
}
