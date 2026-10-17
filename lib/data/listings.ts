/**
 * Listing reads for server components and API routes (service role, server only).
 * jsonb columns are validated on the way out, so pages get typed amenities and rules.
 */
import { cache } from "react";
import { z } from "zod";
import type { Tables } from "@/lib/database.types";
import { HouseRulesSchema } from "@/lib/schemas/core";
import { supabaseAdmin } from "@/lib/supabase";

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
      "id, slug, title, city, neighborhood, property_type, max_guests, base_price_cents, rating, review_count, listing_photos(url, sort)",
    )
    .eq("status", "published");
  if (filters.city) query = query.eq("city", filters.city);
  if (filters.guests) query = query.gte("max_guests", filters.guests);
  const { data, error } = await query
    .order("rating", { ascending: false, nullsFirst: false })
    .order("title");
  check(error, "listings");
  return (data ?? []).map(({ listing_photos, ...listing }) => ({
    ...listing,
    photoUrl: [...listing_photos].sort((a, b) => a.sort - b.sort)[0]?.url ?? null,
  }));
}

/** The host's listings for the dashboard. */
export async function getHostListings(hostId: string) {
  const { data, error } = await supabaseAdmin()
    .from("listings")
    .select("id, slug, title, city, base_price_cents, cleaning_fee_cents")
    .eq("host_id", hostId)
    .order("title");
  check(error, "host listings");
  return data ?? [];
}

/** Blocked nights and per-night prices from today on (what the booking box needs). */
export async function getAvailability(listingId: string, from: string) {
  const { data, error } = await supabaseAdmin()
    .from("availability")
    .select("date, is_blocked, price_override_cents")
    .eq("listing_id", listingId)
    .gte("date", from)
    .or("is_blocked.eq.true,price_override_cents.not.is.null")
    .order("date");
  check(error, "availability");
  const rows = data ?? [];
  return {
    blockedDates: rows.filter((r) => r.is_blocked).map((r) => r.date),
    overrides: rows
      .filter((r) => r.price_override_cents !== null)
      .map((r) => ({ date: r.date, price_override_cents: r.price_override_cents })),
  };
}
