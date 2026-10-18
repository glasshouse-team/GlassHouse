/**
 * Spatial reviews (GH-24, owner: Temuri). Haiku splits each review into claims; code pins each
 * claim to the nearest anchor of the listing's published version (tools/verifier/review-match.ts)
 * and replaces the listing's `review_claims` rows. Claims with no matching anchor are kept,
 * unpinned. The tour shows the pinned ones (components/tour/ReviewPins.tsx).
 *
 *   pnpm reviews:split                     every listing with a published 3D tour
 *   pnpm reviews:split --listing hero-2    one listing (by slug), with or without a tour
 *   pnpm reviews:split --dry-run           print the claims, write nothing
 *
 * Idempotent: a run deletes the reviews' old claims first. Logs one feed event per run.
 * No World Labs calls: anchors come from our database.
 */
import { parseArgs } from "node:util";
import { logEvent } from "@/lib/events";
import { bulkModel } from "@/lib/claude";
import { settings } from "@/lib/env";
import { AnchorSchema, type Anchor } from "@/lib/schemas/world";
import { supabaseAdmin } from "@/lib/supabase";
import { cleanClaims } from "@/tools/verifier/review-match";
import {
  askReviewSplitter,
  claimRows,
  MissingClaimsTableError,
  replaceClaims,
  type ClaimRow,
} from "@/tools/verifier/reviews";

const { values } = parseArgs({
  options: {
    listing: { type: "string" },
    "dry-run": { type: "boolean", default: false },
  },
});
const dryRun = values["dry-run"];

interface ListingRow {
  id: string;
  slug: string;
  title: string;
  published_world_id: string | null;
}

interface ListingResult {
  listing: ListingRow;
  reviews: number;
  claims: ClaimRow[];
}

/** Anchors of every spot world in the listing's published version. */
async function publishedAnchors(listing: ListingRow): Promise<Anchor[]> {
  if (!listing.published_world_id) return [];
  const db = supabaseAdmin();
  const { data: entry, error } = await db
    .from("worlds")
    .select("version")
    .eq("id", listing.published_world_id)
    .maybeSingle();
  if (error) throw new Error(`load published world: ${error.message}`);
  if (!entry) return [];
  const { data: worlds, error: wErr } = await db
    .from("worlds")
    .select("id")
    .eq("listing_id", listing.id)
    .eq("version", entry.version);
  if (wErr) throw new Error(`load worlds: ${wErr.message}`);
  const ids = (worlds ?? []).map((w) => w.id);
  if (ids.length === 0) return [];
  const { data: rows, error: aErr } = await db
    .from("anchors")
    .select("*")
    .in("world_id", ids)
    .order("created_at");
  if (aErr) throw new Error(`load anchors: ${aErr.message}`);
  return (rows ?? []).flatMap((r) => {
    const parsed = AnchorSchema.safeParse(r);
    return parsed.success ? [parsed.data] : [];
  });
}

async function splitListing(listing: ListingRow): Promise<ListingResult> {
  const db = supabaseAdmin();
  const { data: reviews, error } = await db
    .from("reviews")
    .select("id, author_name, body")
    .eq("listing_id", listing.id)
    .order("created_at");
  if (error) throw new Error(`load reviews: ${error.message}`);
  const list = (reviews ?? []).filter((r) => r.body.trim().length > 0);
  if (list.length === 0) return { listing, reviews: 0, claims: [] };

  const anchors = await publishedAnchors(listing);
  const { raw, labels, usage } = await askReviewSplitter(bulkModel(), list, anchors);
  const claims = claimRows(cleanClaims(raw, labels), anchors);

  const authors = new Map(list.map((r) => [r.id, r.author_name ?? "Guest"]));
  const names = new Map(anchors.map((a) => [a.id, `${a.name} (${a.room ?? "?"})`]));
  console.log(
    `\n${listing.slug}: ${list.length} reviews, ${anchors.length} anchors, ${claims.length} claims (${usage.inputTokens} in / ${usage.outputTokens} out tokens)`,
  );
  for (const c of claims) {
    const pin = c.anchor_id ? `-> ${names.get(c.anchor_id)}` : "   (unpinned)";
    console.log(
      `  ${c.sentiment.padEnd(8)} ${(authors.get(c.review_id) ?? "").padEnd(8)} ${c.claim.padEnd(50)} ${pin}`,
    );
  }
  if (!dryRun)
    await replaceClaims(
      db,
      list.map((r) => r.id),
      claims,
    );
  return { listing, reviews: list.length, claims };
}

async function main() {
  const db = supabaseAdmin();
  let query = db.from("listings").select("id, slug, title, published_world_id").order("slug");
  query = values.listing
    ? query.eq("slug", values.listing)
    : query.not("published_world_id", "is", null);
  const { data, error } = await query;
  if (error) throw new Error(`load listings: ${error.message}`);
  const listings = (data ?? []) as ListingRow[];
  if (listings.length === 0)
    throw new Error(
      values.listing
        ? `No listing with slug "${values.listing}"`
        : "No listing has a published 3D tour yet; pass --listing <slug>",
    );

  const results: ListingResult[] = [];
  for (const listing of listings) results.push(await splitListing(listing));

  const claims = results.flatMap((r) => r.claims);
  const pinned = claims.filter((c) => c.anchor_id).length;
  const reviews = results.reduce((n, r) => n + r.reviews, 0);
  console.log(`\n${reviews} reviews -> ${claims.length} claims, ${pinned} pinned in 3D`);
  if (dryRun) return console.log("dry run: nothing written");

  const one = results.length === 1 ? results[0].listing : null;
  const where = one ? ` of ${one.title}` : ` across ${results.length} homes`;
  await logEvent({
    actor_type: "agent",
    actor_name: "Verifier",
    agent: "verifier",
    action: "reviews.split",
    summary:
      `Split ${reviews} reviews${where} into ${claims.length} claims; ${pinned} pinned in the 3D tour`.slice(
        0,
        140,
      ),
    listing_id: one?.id ?? null,
    payload: {
      model: settings.bulkModel,
      listings: results.map((r) => ({
        slug: r.listing.slug,
        reviews: r.reviews,
        claims: r.claims.length,
        pinned: r.claims.filter((c) => c.anchor_id).length,
      })),
    },
  });
}

main().catch((error: unknown) => {
  if (error instanceof MissingClaimsTableError) {
    console.error(error.message);
    process.exit(2);
  }
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
