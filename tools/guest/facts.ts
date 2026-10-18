/**
 * Facts the guest agent may cite, and the check that every reason really cites one (GH-14).
 * A reason's `factKey` is `fact:<key>` (an X-ray fact), `field:<column>` (a listing field) or
 * `amenity:<key>`. Reasons that don't resolve against the real listing are dropped in code.
 */
import { tool } from "ai";
import { z } from "zod";
import type { XrayResult } from "@/lib/schemas/verifier";

export interface CandidateListing {
  id: string;
  slug: string;
  title: string;
  city: string;
  neighborhood: string | null;
  property_type: string;
  max_guests: number;
  bedrooms: number;
  beds: number;
  baths: number;
  base_price_cents: number;
  weekend_price_cents: number | null;
  cleaning_fee_cents: number;
  amenities: string[];
  house_rules: Record<string, unknown>;
  description: string;
  rating: number | null;
  review_count: number;
}

export interface Candidate {
  listing: CandidateListing;
  facts: XrayResult | null;
  photoUrl: string | null;
}

/** Listing columns a reason may cite as `field:<column>`. */
const CITABLE_FIELDS = new Set([
  "title",
  "city",
  "neighborhood",
  "property_type",
  "max_guests",
  "bedrooms",
  "beds",
  "baths",
  "base_price_cents",
  "weekend_price_cents",
  "cleaning_fee_cents",
  "house_rules",
  "description",
  "rating",
  "review_count",
]);

/** X-ray confidence a fact needs before it can back a reason. */
const MIN_REASON_CONFIDENCE = 0.5;

function supports(value: string | number | boolean): boolean {
  if (typeof value === "string") return !/^(|false|no|none|0)$/i.test(value.trim());
  return value !== false && value !== 0;
}

/**
 * True when the cited source exists on this listing. As a reason, an X-ray fact must also be
 * true (not false, 0, "no" or "none") and fairly sure; a concern may cite any fact.
 */
export function resolveFactKey(
  factKey: string,
  candidate: Candidate,
  use: "reason" | "concern" = "reason",
): boolean {
  const [kind, ...rest] = factKey.trim().split(":");
  const key = rest.join(":");
  if (!key) return false;
  if (kind === "fact") {
    const fact = candidate.facts?.facts.find((f) => f.key === key);
    if (!fact) return false;
    return use === "concern" || (supports(fact.value) && fact.confidence >= MIN_REASON_CONFIDENCE);
  }
  if (kind === "amenity") return candidate.listing.amenities.includes(key);
  if (kind === "field") {
    const value = (candidate.listing as unknown as Record<string, unknown>)[key];
    return CITABLE_FIELDS.has(key) && value !== null && value !== undefined && value !== "";
  }
  return false;
}

/**
 * Where a reason comes from, for the chip: "Seen in 2 photos", "Listed amenity", "Listing details".
 * X-ray evidence holds `listing_photos.id` uuids (GH-9), so count them rather than read a number.
 */
export function sourceLabel(factKey: string, candidate: Candidate): string {
  const [kind, ...rest] = factKey.split(":");
  if (kind === "fact") {
    const count =
      candidate.facts?.facts.find((f) => f.key === rest.join(":"))?.evidence.length ?? 0;
    return count === 1
      ? "Seen in 1 photo"
      : count > 1
        ? `Seen in ${count} photos`
        : "Seen in photos";
  }
  return kind === "amenity" ? "Listed amenity" : "Listing details";
}

/** What the model reads about one home: listing fields, amenities and the X-ray, kept short. */
export function candidateCard({ listing, facts }: Candidate) {
  return {
    id: listing.id,
    title: listing.title,
    city: listing.city,
    neighborhood: listing.neighborhood,
    property_type: listing.property_type,
    max_guests: listing.max_guests,
    bedrooms: listing.bedrooms,
    beds: listing.beds,
    baths: listing.baths,
    price_per_night_usd: listing.base_price_cents / 100,
    weekend_price_per_night_usd:
      listing.weekend_price_cents === null ? null : listing.weekend_price_cents / 100,
    cleaning_fee_usd: listing.cleaning_fee_cents / 100,
    amenities: listing.amenities,
    house_rules: listing.house_rules,
    rating: listing.rating,
    review_count: listing.review_count,
    description: listing.description.slice(0, 280),
    xray: facts
      ? {
          facts: facts.facts.map((f) => ({ key: f.key, value: f.value, confidence: f.confidence })),
          contradictions: facts.contradictions.map((c) => ({ claim: c.claim, finding: c.finding })),
          missing_photos: facts.missing_photos,
        }
      : "not checked yet",
  };
}

/** The agent's final answer. Simple on purpose: code checks and trims it. */
export const ShortlistSchema = z.object({
  ranked: z.array(
    z.object({
      listingId: z.string(),
      score: z.number(),
      reasons: z
        .array(z.object({ text: z.string().describe("under 10 words"), factKey: z.string() }))
        .describe("the 3 strongest"),
      concerns: z
        .array(
          z.object({ text: z.string().describe("under 10 words"), factKey: z.string().nullable() }),
        )
        .describe("at most 2"),
      negotiationHint: z.string().nullable().describe("under 10 words, or null"),
    }),
  ),
  others: z.array(z.object({ listingId: z.string(), why: z.string().describe("under 12 words") })),
  notes: z.array(z.string()).describe("at most 1, only if the search was widened or relaxed"),
});
export type ShortlistDraft = z.infer<typeof ShortlistSchema>;

export interface CitedText {
  text: string;
  factKey: string | null;
  source: string | null;
}
export interface ShortlistItem {
  listingId: string;
  score: number;
  reasons: CitedText[];
  concerns: CitedText[];
  negotiationHint: string | null;
}
export interface Shortlist {
  ranked: ShortlistItem[];
  others: { listingId: string; why: string }[];
  notes: string[];
}

export const SHORTLIST_SIZE = 5;
/** Reason chips and concerns shown per home. */
export const MAX_REASONS = 3;
export const MAX_CONCERNS = 2;

/**
 * Keeps only homes we actually searched and reasons that cite a real source; drops a home
 * left without reasons; best score first, at most five. Concerns may go uncited.
 */
export function cleanShortlist(draft: ShortlistDraft, known: Map<string, Candidate>): Shortlist {
  const seen = new Set<string>();
  const items: ShortlistItem[] = [];
  for (const item of draft.ranked) {
    const candidate = known.get(item.listingId);
    if (!candidate || seen.has(item.listingId)) continue;
    seen.add(item.listingId);
    const reasons = item.reasons
      .filter((r) => r.text.trim() && resolveFactKey(r.factKey, candidate))
      .map((r) => ({
        text: r.text.trim(),
        factKey: r.factKey.trim(),
        source: sourceLabel(r.factKey.trim(), candidate),
      }));
    if (reasons.length === 0) continue;
    reasons.splice(MAX_REASONS);
    const concerns = item.concerns
      .filter((c) => c.text.trim())
      .map((c) => {
        const cited =
          c.factKey && resolveFactKey(c.factKey, candidate, "concern") ? c.factKey.trim() : null;
        return {
          text: c.text.trim(),
          factKey: cited,
          source: cited ? sourceLabel(cited, candidate) : null,
        };
      });
    items.push({
      listingId: item.listingId,
      score: Math.max(0, Math.min(100, Math.round(item.score))),
      reasons,
      concerns: concerns.slice(0, MAX_CONCERNS),
      negotiationHint: item.negotiationHint?.trim() || null,
    });
  }
  items.sort((a, b) => b.score - a.score);
  const ranked = items.slice(0, SHORTLIST_SIZE);
  const shown = new Set(ranked.map((i) => i.listingId));
  const others = draft.others
    .filter((o) => known.has(o.listingId) && !shown.has(o.listingId) && o.why.trim())
    .map((o) => ({ listingId: o.listingId, why: o.why.trim() }));
  for (const extra of items.slice(SHORTLIST_SIZE))
    if (!others.some((o) => o.listingId === extra.listingId))
      others.push({
        listingId: extra.listingId,
        why: "A good fit, but scored lower than the top five",
      });
  return {
    ranked,
    others: others.slice(0, 10),
    notes: draft.notes
      .map((n) => n.trim())
      .filter(Boolean)
      .slice(0, 3),
  };
}

/** A shortlist shorter than this gets the closest other homes added (vague briefs, D-048). */
export const MIN_SHORTLIST = 3;

/**
 * Tops a short shortlist up to MIN_SHORTLIST with the best-rated candidates the model didn't
 * rank, so a vague brief never ends with one card. Their reasons are written here from listing
 * fields (so they cite real sources) and they score below every ranked home; a Verifier
 * contradiction becomes a concern. Homes the model set aside come last.
 */
export function fillShortlist(
  shortlist: Shortlist,
  candidates: Candidate[],
): { shortlist: Shortlist; added: number } {
  const missing = MIN_SHORTLIST - shortlist.ranked.length;
  if (missing <= 0) return { shortlist, added: 0 };
  const ranked = new Set(shortlist.ranked.map((r) => r.listingId));
  const setAside = new Set(shortlist.others.map((o) => o.listingId));
  const pool = candidates
    .filter((c) => !ranked.has(c.listing.id))
    .sort(
      (a, b) =>
        Number(setAside.has(a.listing.id)) - Number(setAside.has(b.listing.id)) ||
        (b.listing.rating ?? 0) - (a.listing.rating ?? 0),
    )
    .slice(0, missing);
  let score = Math.min(60, ...shortlist.ranked.map((r) => r.score)) - 5;
  const extra: ShortlistItem[] = pool.map(({ listing, facts }) => {
    const reasons: CitedText[] = [];
    if (listing.rating !== null)
      reasons.push({
        text: `Rated ${listing.rating} by ${listing.review_count} guests`,
        factKey: "field:rating",
        source: "Listing details",
      });
    reasons.push({
      text: `${listing.property_type[0].toUpperCase()}${listing.property_type.slice(1)} in ${listing.city}, sleeps ${listing.max_guests}`,
      factKey: "field:max_guests",
      source: "Listing details",
    });
    const contradictions = facts?.contradictions.length ?? 0;
    const item: ShortlistItem = {
      listingId: listing.id,
      score: Math.max(0, score),
      reasons,
      concerns:
        contradictions > 0
          ? [
              {
                text: `Verifier found ${contradictions} ${contradictions === 1 ? "claim" : "claims"} the photos don't back`,
                factKey: null,
                source: null,
              },
            ]
          : [],
      negotiationHint: null,
    };
    score -= 5;
    return item;
  });
  const added = new Set(extra.map((e) => e.listingId));
  return {
    added: extra.length,
    shortlist: {
      ...shortlist,
      ranked: [...shortlist.ranked, ...extra],
      others: shortlist.others.filter((o) => !added.has(o.listingId)),
    },
  };
}

/** `get_listing_facts`: the X-ray facts of one home already in the search. */
export function listingFactsTool(known: Map<string, Candidate>) {
  return tool({
    description:
      "The Verifier's X-ray facts, contradictions and missing photos for one home in the current search.",
    inputSchema: z.object({ listingId: z.string() }),
    execute: async ({ listingId }) => {
      const candidate = known.get(listingId);
      if (!candidate)
        return { summary: "Guest agent asked about a home outside the search", found: false };
      return {
        summary: `Guest agent checked the X-ray of ${candidate.listing.title}`,
        found: true,
        xray: candidateCard(candidate).xray,
      };
    },
  });
}
