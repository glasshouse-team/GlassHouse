/**
 * GH-24 Review claims (owner: Temuri). Haiku splits a listing's reviews into claims; code
 * matches each claim to the nearest anchor of the published version (review-match.ts) and
 * replaces the listing's `review_claims` rows. Used by `pnpm reviews:split`. Review text is
 * guests' data: it goes in the user message through asData, never in the system prompt.
 */
import { generateText, NoObjectGeneratedError, Output, type LanguageModel } from "ai";
import { asData } from "@/agents/data";
import { loadPrompt } from "@/agents/load-prompt";
import type { Db } from "@/lib/supabase";
import { ReviewClaimsResultSchema, type ReviewClaimsResult } from "@/lib/schemas/verifier";
import type { Anchor } from "@/lib/schemas/world";
import { matchClaim, type CleanClaim, type MatchAnchor } from "./review-match";

export interface ReviewInput {
  id: string;
  body: string;
}

export interface SplitUsage {
  inputTokens: number;
  outputTokens: number;
}

/** "r1", "r2"... in input order; the model cites these, code maps them back to ids. */
export function labelReviews(reviews: ReviewInput[]): Map<string, string> {
  return new Map(reviews.map((r, i) => [`r${i + 1}`, r.id]));
}

/** The home as Haiku sees it: room names and the things marked in the 3D tour. */
export function homeContext(anchors: Pick<Anchor, "name" | "kind" | "room">[]) {
  const rooms = [
    ...new Set(anchors.flatMap((a) => [a.room, a.kind === "room" ? a.name : null]).filter(Boolean)),
  ] as string[];
  const objects = [...new Set(anchors.filter((a) => a.kind !== "room").map((a) => a.name))];
  return { rooms, objects };
}

/** One structured-output call, retried once when the answer does not fit the schema. */
export async function askReviewSplitter(
  model: LanguageModel,
  reviews: ReviewInput[],
  anchors: Pick<Anchor, "name" | "kind" | "room">[],
): Promise<{ raw: ReviewClaimsResult; labels: Map<string, string>; usage: SplitUsage }> {
  const labels = labelReviews(reviews);
  const content = [
    { type: "text" as const, text: asData("home", homeContext(anchors)) },
    {
      type: "text" as const,
      text: asData(
        "reviews",
        reviews.map((r, i) => ({ id: `r${i + 1}`, text: r.body })),
      ),
    },
  ];
  const usage: SplitUsage = { inputTokens: 0, outputTokens: 0 };
  const add = (u: { inputTokens?: number; outputTokens?: number }) => {
    usage.inputTokens += u.inputTokens ?? 0;
    usage.outputTokens += u.outputTokens ?? 0;
  };
  for (let attempt = 1; ; attempt++) {
    try {
      const { output, usage: used } = await generateText({
        model,
        output: Output.object({ schema: ReviewClaimsResultSchema }),
        system: loadPrompt("verifier-reviews"),
        messages: [{ role: "user", content }],
      });
      add(used);
      return { raw: output, labels, usage };
    } catch (error) {
      if (!NoObjectGeneratedError.isInstance(error) || attempt >= 2) throw error;
      add(error.usage ?? {});
    }
  }
}

export interface ClaimRow {
  review_id: string;
  claim: string;
  sentiment: CleanClaim["sentiment"];
  room: string | null;
  anchor_id: string | null;
}

/** Cleaned claims become `review_claims` rows, each pinned to its nearest anchor or none. */
export function claimRows(claims: CleanClaim[], anchors: MatchAnchor[]): ClaimRow[] {
  return claims.map((c) => {
    const { anchor, room } = matchClaim({ room: c.room, object: c.object }, anchors);
    return {
      review_id: c.reviewId,
      claim: c.claim,
      sentiment: c.sentiment,
      room,
      anchor_id: anchor?.id ?? null,
    };
  });
}

/** True when the database has no `review_claims` table yet (migration not applied). */
export function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === "42P01" || error.code === "PGRST205") return true;
  return (
    /review_claims/.test(error.message ?? "") &&
    /does not exist|schema cache/.test(error.message ?? "")
  );
}

export class MissingClaimsTableError extends Error {
  constructor() {
    super("The review_claims table does not exist yet: apply the migrations (pnpm db:push).");
  }
}

/**
 * Replaces the claims of these reviews (delete, then insert): re-running gives the same rows
 * for the same model answer, never duplicates.
 */
export async function replaceClaims(db: Db, reviewIds: string[], rows: ClaimRow[]): Promise<void> {
  if (reviewIds.length === 0) return;
  const del = await db.from("review_claims").delete().in("review_id", reviewIds);
  if (isMissingTable(del.error)) throw new MissingClaimsTableError();
  if (del.error) throw new Error(`Could not clear old claims: ${del.error.message}`);
  if (rows.length === 0) return;
  const ins = await db.from("review_claims").insert(rows);
  if (ins.error) throw new Error(`Could not save claims: ${ins.error.message}`);
}
