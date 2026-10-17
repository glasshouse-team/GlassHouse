/**
 * Pure builders that turn the seed data into database rows (no I/O, so they are unit-tested).
 * seed/seed.ts writes them.
 */
import { HostPolicySchema, ListingSchema, ReviewSchema } from "@/lib/schemas/core";
import { XrayResultSchema } from "@/lib/schemas/verifier";
import { DEMO_PROFILES, HERO_LISTINGS } from "./fixtures";
import type { SeedListing } from "./data/listings";
import { SEED_REVIEWS } from "./data/reviews";
import { seedId } from "./ids";

/** Hero homes keep their fixed ids from fixtures.ts; the others derive theirs from the slug. */
export function listingId(slug: string): string {
  const hero = Object.values(HERO_LISTINGS).find((h) => h.slug === slug);
  return hero ? hero.id : seedId(`listing:${slug}`);
}

/** Average review rating with one decimal, or null with no reviews. */
export function averageRating(ratings: number[]): number | null {
  if (ratings.length === 0) return null;
  return Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10;
}

const ListingInsertSchema = ListingSchema.omit({ published_world_id: true });

/** The `listings` row. Never includes `published_world_id`, so re-seeding keeps the 3D. */
export function listingRow(listing: SeedListing) {
  const reviews = SEED_REVIEWS[listing.slug] ?? [];
  const row = {
    id: listingId(listing.slug),
    host_id: DEMO_PROFILES[listing.host].id,
    slug: listing.slug,
    title: listing.title,
    description: listing.description,
    city: listing.city,
    neighborhood: listing.neighborhood,
    lat: null,
    lng: null,
    property_type: listing.property_type,
    max_guests: listing.max_guests,
    bedrooms: listing.bedrooms,
    beds: listing.beds,
    baths: listing.baths,
    base_price_cents: listing.base_price_cents,
    weekend_price_cents: listing.weekend_price_cents,
    cleaning_fee_cents: listing.cleaning_fee_cents,
    currency: "USD",
    amenities: listing.amenities,
    house_rules: listing.house_rules,
    house_manual: listing.house_manual,
    status: "published" as const,
    rating: averageRating(reviews.map((r) => r.rating)),
    review_count: reviews.length,
  };
  ListingInsertSchema.parse(row);
  return row;
}

/** The private `host_policies` row. */
export function policyRow(listing: SeedListing) {
  const row = { listing_id: listingId(listing.slug), ...listing.policy };
  HostPolicySchema.parse(row);
  return row;
}

/** The listing's reviews, with ids derived from slug and position. */
export function reviewRows(listing: SeedListing) {
  return (SEED_REVIEWS[listing.slug] ?? []).map((review, i) => {
    const [cleanliness, accuracy, check_in, communication, location, value] = review.sub;
    const row = {
      id: seedId(`review:${listing.slug}:${i}`),
      listing_id: listingId(listing.slug),
      guest_id: null,
      author_name: review.author,
      rating: review.rating,
      sub_ratings: { cleanliness, accuracy, check_in, communication, location, value },
      body: review.body,
      created_at: `${review.month}-15T12:00:00Z`,
    };
    ReviewSchema.parse(row);
    return row;
  });
}

/** "YYYY-MM-DD" for `start` plus `days` (UTC). */
export function addDays(start: string, days: number): string {
  const date = new Date(`${start}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * One `availability` row per night for `days` nights from `start`, all free except the
 * listing's blocked dates (which are always written, even outside the window).
 */
export function availabilityRows(listing: SeedListing, start: string, days = 60) {
  const id = listingId(listing.slug);
  const dates = new Set(Array.from({ length: days }, (_, i) => addDays(start, i)));
  for (const date of listing.blocked_dates) dates.add(date);
  return [...dates].sort().map((date) => ({
    listing_id: id,
    date,
    is_blocked: listing.blocked_dates.includes(date),
    price_override_cents: null,
  }));
}

const PHOTO_NAME = /^(\d{2})-([a-z0-9-]+)\.(jpe?g|png|webp)$/i;

/** True for photo files named `NN-room.jpg` (other files in the folder are ignored). */
export function isPhotoName(name: string): boolean {
  return PHOTO_NAME.test(name);
}

/** `listing_photos` rows from Storage file names like "03-living-room.jpg". */
export function photoRows(
  listingIdValue: string,
  names: string[],
  urlOf: (name: string) => string,
) {
  return names
    .filter(isPhotoName)
    .sort()
    .map((name) => {
      const [, sort, room] = PHOTO_NAME.exec(name)!;
      return {
        listing_id: listingIdValue,
        url: urlOf(name),
        room_label: room.replace(/-/g, " "),
        sort: Number(sort),
        source: "upload" as const,
      };
    });
}

/**
 * A starting X-ray row for hero-1 with the `washer` fact that "Ask this home" cites
 * (HERO_QA_FIXTURES). Written only when no X-ray row exists, so a real GH-9 run wins.
 */
export function heroFactsRow(photos: { room_label: string | null; sort: number }[]) {
  const evidence = photos
    .filter((p) => /washer|laundry/i.test(p.room_label ?? ""))
    .map((p) => `photo_${String(p.sort).padStart(2, "0")}`);
  const result = {
    facts: [{ key: "washer", value: true, evidence, confidence: 0.9 }],
    contradictions: [],
    missing_photos: [],
  };
  XrayResultSchema.parse(result);
  return { listing_id: HERO_LISTINGS.hero1.id, ...result, model: "seed" };
}
