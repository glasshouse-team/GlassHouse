/**
 * Search candidates for the guest agent (GH-14): a SQL pre-filter (city, guests, free nights,
 * price up to 1.2x budget) and the `search_listings` tool the agent uses to widen it.
 * Server only (service role).
 */
import { tool } from "ai";
import { z } from "zod";
import { SEARCH_CITIES } from "@/components/search/filters";
import { stayNights } from "@/lib/pricing";
import { HouseRulesSchema } from "@/lib/schemas/core";
import { XrayResultSchema } from "@/lib/schemas/verifier";
import { supabaseAdmin } from "@/lib/supabase";
import { candidateCard, type Candidate } from "./facts";

export interface CandidateFilters {
  /** Seeded city names; empty = everywhere. */
  cities: string[];
  guests: number;
  checkIn: string | null;
  checkOut: string | null;
  /** Highest nightly price in cents; null = no limit. */
  maxNightlyCents: number | null;
  limit?: number;
}

const COLUMNS =
  "id, slug, title, city, neighborhood, property_type, max_guests, bedrooms, beds, baths, base_price_cents, weekend_price_cents, cleaning_fee_cents, amenities, house_rules, description, rating, review_count, listing_photos!inner(url, sort)";
const Amenities = z.array(z.string()).catch([]);
const Rules = HouseRulesSchema.catch({});

function check(error: { message: string } | null, what: string) {
  if (error) throw new Error(`Could not load ${what}: ${error.message}`);
}

/**
 * Published homes that fit, best rated first, without homes booked or blocked on the dates.
 * Only homes with at least one photo (the inner join): a just-added home (D-043) isn't ranked.
 */
export async function findCandidates(filters: CandidateFilters): Promise<Candidate[]> {
  const db = supabaseAdmin();
  let query = db
    .from("listings")
    .select(COLUMNS)
    .eq("status", "published")
    .gte("max_guests", filters.guests);
  if (filters.cities.length > 0) query = query.in("city", filters.cities);
  if (filters.maxNightlyCents !== null)
    query = query.lte("base_price_cents", filters.maxNightlyCents);
  const { data, error } = await query
    .order("rating", { ascending: false, nullsFirst: false })
    .order("title")
    .limit(60);
  check(error, "listings");
  let rows = data ?? [];
  if (rows.length === 0) return [];

  if (filters.checkIn && filters.checkOut) {
    const ids = rows.map((r) => r.id);
    const nights = stayNights(filters.checkIn, filters.checkOut);
    const [blocked, booked] = await Promise.all([
      db
        .from("availability")
        .select("listing_id")
        .in("listing_id", ids)
        .eq("is_blocked", true)
        .in("date", nights),
      db
        .from("reservations")
        .select("listing_id")
        .in("listing_id", ids)
        .eq("status", "confirmed")
        .lt("check_in", filters.checkOut)
        .gt("check_out", filters.checkIn),
    ]);
    check(blocked.error, "availability");
    check(booked.error, "reservations");
    const taken = new Set(
      [...(blocked.data ?? []), ...(booked.data ?? [])].map((r) => r.listing_id),
    );
    rows = rows.filter((r) => !taken.has(r.id));
  }
  rows = rows.slice(0, filters.limit ?? 30);

  const facts = await db
    .from("listing_facts")
    .select("listing_id, facts, contradictions, missing_photos")
    .in(
      "listing_id",
      rows.map((r) => r.id),
    );
  check(facts.error, "listing facts");
  const factsById = new Map((facts.data ?? []).map((f) => [f.listing_id, f]));

  return rows.map(({ listing_photos, ...row }) => ({
    listing: {
      ...row,
      amenities: Amenities.parse(row.amenities),
      house_rules: Rules.parse(row.house_rules),
    },
    facts: XrayResultSchema.safeParse(factsById.get(row.id)).data ?? null,
    photoUrl: [...listing_photos].sort((a, b) => a.sort - b.sort)[0]?.url ?? null,
  }));
}

/** `search_listings`: widen the search (other cities, more budget); new homes join `known`. */
export function searchListingsTool(
  known: Map<string, Candidate>,
  base: Pick<CandidateFilters, "checkIn" | "checkOut" | "guests">,
) {
  return tool({
    description:
      "Search more homes, only to widen the search: other cities or a higher price. The group size stays the brief's. Returns homes not seen yet.",
    inputSchema: z.object({
      cities: z.array(z.enum(SEARCH_CITIES)),
      maxPricePerNightUsd: z.number().nullable(),
    }),
    execute: async ({ cities, maxPricePerNightUsd }) => {
      const found = await findCandidates({
        ...base,
        cities,
        maxNightlyCents:
          maxPricePerNightUsd === null ? null : Math.round(maxPricePerNightUsd * 100),
        limit: 10,
      });
      const fresh = found.filter((c) => !known.has(c.listing.id));
      for (const c of fresh) known.set(c.listing.id, c);
      const where = cities.length > 0 ? cities.join(" + ") : "all of Georgia";
      return {
        summary: `Guest agent widened the search to ${where}: ${fresh.length} more homes`,
        homes: fresh.map(candidateCard),
      };
    },
  });
}
