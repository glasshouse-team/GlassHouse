/**
 * Listing reads for server components and API routes (service role, server only).
 * jsonb columns are validated on the way out, so pages get typed amenities and rules.
 */
import { cache } from "react";
import { z } from "zod";
import { type CoverageWorld, type ListingCoverage, publishedCoverage } from "@/lib/coverage";
import type { Tables } from "@/lib/database.types";
import { stayNights } from "@/lib/pricing";
import { defaultPolicy, homeSlug, type NewHome } from "@/lib/new-home";
import { HouseRulesSchema } from "@/lib/schemas/core";
import { XrayResultSchema, type XrayResult } from "@/lib/schemas/verifier";
import { supabaseAdmin } from "@/lib/supabase";
import { saveHostPolicy } from "./policies";

export type ListingRow = Tables<"listings">;
export type PhotoRow = Tables<"listing_photos">;
export type ReviewRow = Tables<"reviews">;
export type HouseRules = z.infer<typeof HouseRulesSchema>;

export type ListingView = Omit<ListingRow, "amenities" | "house_rules"> & {
  amenities: string[];
  house_rules: HouseRules;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const AmenityList = z.array(z.string()).catch([]);
const Rules = HouseRulesSchema.catch({});

function check(error: { message: string } | null, what: string): void {
  if (error) throw new Error(`Could not load ${what}: ${error.message}`);
}

function toView(row: ListingRow): ListingView {
  return {
    ...row,
    amenities: AmenityList.parse(row.amenities),
    house_rules: Rules.parse(row.house_rules),
  };
}

/** A published listing by uuid or slug (`/listing/hero-1`), or null. Cached per request. */
export const getListing = cache(async (idOrSlug: string): Promise<ListingView | null> => {
  const { data, error } = await supabaseAdmin()
    .from("listings")
    .select("*")
    .eq(UUID.test(idOrSlug) ? "id" : "slug", idOrSlug)
    .eq("status", "published")
    .maybeSingle();
  check(error, `listing ${idOrSlug}`);
  return data ? toView(data) : null;
});

/** Any listing by uuid, whatever its status (draft or archived too): for host-only routes. */
export async function getListingById(id: string): Promise<ListingView | null> {
  const { data, error } = await supabaseAdmin()
    .from("listings")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  check(error, `listing ${id}`);
  return data ? toView(data) : null;
}

export async function getListingPhotos(listingId: string): Promise<PhotoRow[]> {
  const { data, error } = await supabaseAdmin()
    .from("listing_photos")
    .select("*")
    .eq("listing_id", listingId)
    .order("sort");
  check(error, "photos");
  return data ?? [];
}

export async function getListingReviews(listingId: string): Promise<ReviewRow[]> {
  const { data, error } = await supabaseAdmin()
    .from("reviews")
    .select("*")
    .eq("listing_id", listingId)
    .order("created_at", { ascending: false });
  check(error, "reviews");
  return data ?? [];
}

export async function getProfile(id: string): Promise<Tables<"profiles"> | null> {
  const { data, error } = await supabaseAdmin()
    .from("profiles")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  check(error, "profile");
  return data;
}

/** What a result card shows. */
export interface ListingCardData {
  id: string;
  slug: string;
  title: string;
  city: string;
  neighborhood: string | null;
  property_type: string;
  max_guests: number;
  base_price_cents: number;
  rating: number | null;
  review_count: number;
  photoUrl: string | null;
  /** Share of the published 3D tour filmed by the host (GH-21), or null. */
  coverage: ListingCoverage | null;
}

export interface ListingFilters {
  city?: string;
  guests?: number;
}

/** Published listings for the search grid, best rated first. */
export async function searchListings(filters: ListingFilters = {}): Promise<ListingCardData[]> {
  let query = supabaseAdmin()
    .from("listings")
    .select(
      "id, slug, title, city, neighborhood, property_type, max_guests, base_price_cents, rating, review_count, published_world_id, listing_photos(url, sort)",
    )
    .eq("status", "published");
  if (filters.city) query = query.eq("city", filters.city);
  if (filters.guests) query = query.gte("max_guests", filters.guests);
  const { data, error } = await query
    .order("rating", { ascending: false, nullsFirst: false })
    .order("title");
  check(error, "listings");
  const rows = data ?? [];
  const worlds = await getCoverageWorlds(rows.filter((r) => r.published_world_id).map((r) => r.id));
  return rows.map(({ listing_photos, published_world_id, ...listing }) => ({
    ...listing,
    photoUrl: [...listing_photos].sort((a, b) => a.sort - b.sort)[0]?.url ?? null,
    coverage: publishedCoverage(published_world_id, worlds),
  }));
}

/** The worlds columns the coverage score needs, for these listings. */
async function getCoverageWorlds(listingIds: string[]): Promise<CoverageWorld[]> {
  if (listingIds.length === 0) return [];
  const { data, error } = await supabaseAdmin()
    .from("worlds")
    .select("id, listing_id, version, spot, status, coverage_score")
    .in("listing_id", listingIds);
  check(error, "world coverage");
  return data ?? [];
}

/**
 * The published tour's coverage score (GH-21): the mean of `coverage_score` over the spot
 * worlds of the published version, or null without a published world or any score.
 */
export async function getListingCoverage(
  listing: Pick<ListingRow, "id" | "published_world_id">,
): Promise<ListingCoverage | null> {
  if (!listing.published_world_id) return null;
  return publishedCoverage(listing.published_world_id, await getCoverageWorlds([listing.id]));
}

/**
 * A host lists a new home (D-043): published at once so the capture page and search find it,
 * with the default agent rules. A slug clash gets a new suffix; if the rules can't be saved
 * the home is removed again, so a listing never exists without its rules.
 */
export async function createHostListing(
  hostId: string,
  home: NewHome,
): Promise<{ id: string; slug: string }> {
  const db = supabaseAdmin();
  for (let attempt = 0; attempt < 3; attempt++) {
    const slug = homeSlug(home.title, crypto.randomUUID().slice(0, 6));
    const { data, error } = await db
      .from("listings")
      .insert({ ...home, host_id: hostId, slug, status: "published" })
      .select("id, slug")
      .single();
    if (error?.code === "23505") continue;
    check(error, "the new home");
    try {
      await saveHostPolicy(data!.id, defaultPolicy(home.base_price_cents));
    } catch (policyError) {
      await db.from("listings").delete().eq("id", data!.id);
      throw policyError;
    }
    return data!;
  }
  throw new Error("Could not pick a free address for the new home. Try again.");
}

/** The host's listings for the dashboard: seeded homes first (hero-1 first), new ones last. */
export async function getHostListings(hostId: string) {
  const { data, error } = await supabaseAdmin()
    .from("listings")
    .select(
      "id, slug, title, description, city, property_type, max_guests, bedrooms, beds, baths, base_price_cents, cleaning_fee_cents, amenities, house_rules",
    )
    .eq("host_id", hostId)
    // The seed inserts its homes in one statement (same created_at), so the slug orders them.
    .order("created_at")
    .order("slug");
  check(error, "host listings");
  return (data ?? []).map((row) => ({
    ...row,
    amenities: AmenityList.parse(row.amenities),
    house_rules: Rules.parse(row.house_rules),
  }));
}

/** The Verifier's X-ray for one home (GH-9), or null when it has not run or does not parse. */
export async function getListingXray(listingId: string): Promise<XrayResult | null> {
  const { data, error } = await supabaseAdmin()
    .from("listing_facts")
    .select("facts, contradictions, missing_photos")
    .eq("listing_id", listingId)
    .maybeSingle();
  check(error, "listing facts");
  const parsed = XrayResultSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

/**
 * What the booking box needs from `from` on: nights that can't be booked (blocked by the host
 * or already reserved) and per-night prices. Only dates leave here, never who booked them.
 */
export async function getAvailability(listingId: string, from: string) {
  const db = supabaseAdmin();
  const [availability, reservations] = await Promise.all([
    db
      .from("availability")
      .select("date, is_blocked, price_override_cents")
      .eq("listing_id", listingId)
      .gte("date", from)
      .or("is_blocked.eq.true,price_override_cents.not.is.null")
      .order("date"),
    db
      .from("reservations")
      .select("check_in, check_out")
      .eq("listing_id", listingId)
      .eq("status", "confirmed")
      .gt("check_out", from),
  ]);
  check(availability.error, "availability");
  check(reservations.error, "reservations");
  const rows = availability.data ?? [];
  const booked = (reservations.data ?? []).flatMap((r) => stayNights(r.check_in, r.check_out));
  const blocked = rows.filter((r) => r.is_blocked).map((r) => r.date);
  return {
    blockedDates: [...new Set([...blocked, ...booked])].sort(),
    overrides: rows
      .filter((r) => r.price_override_cents !== null)
      .map((r) => ({ date: r.date, price_override_cents: r.price_override_cents })),
  };
}
