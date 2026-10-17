/**
 * Pure builders that turn the seed data into database rows (no I/O, so they are unit-tested).
 * seed/seed.ts writes them.
 */
import { HostPolicySchema, ListingSchema, ReviewSchema } from "@/lib/schemas/core";
import { XrayResultSchema, type XrayResult } from "@/lib/schemas/verifier";
import { DEMO_PROFILES, HERO_LISTINGS } from "./fixtures";
import type { SeedListing } from "./data/listings";
import { SEED_REVIEWS } from "./data/reviews";
import { seedId } from "./ids";

type Fact = XrayResult["facts"][number];

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

/**
 * `listing_photos` rows from Storage file names like "03-living-room.jpg". Throws when two
 * files share a number: `(listing_id, sort)` is unique, so the upsert would fail midway.
 */
export function photoRows(
  listingIdValue: string,
  names: string[],
  urlOf: (name: string) => string,
) {
  const photos = names.filter(isPhotoName).sort();
  const byNumber = new Map<string, string>();
  for (const name of photos) {
    const number = name.slice(0, 2);
    const twin = byNumber.get(number);
    if (twin)
      throw new Error(`Photos ${twin} and ${name} share the number ${number}; give each its own.`);
    byNumber.set(number, name);
  }
  return photos.map((name) => {
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

/** A photo row as read back from `listing_photos`. */
export type SeedPhoto = { id: string; room_label: string | null };

/**
 * hero-1's `washer` fact, which "Ask this home" cites as `fact:washer` (HERO_QA_FIXTURES).
 * Evidence is the `listing_photos.id` of a laundry or washing-machine photo, as GH-9 stores it.
 */
export function washerFact(photos: SeedPhoto[]): Fact {
  const evidence = photos.filter((p) => /wash|laundry/i.test(p.room_label ?? "")).map((p) => p.id);
  return { key: "washer", value: true, evidence, confidence: 0.9 };
}

/** The facts with the washer fact appended, unless they already have one. */
export function withWasherFact(facts: Fact[], photos: SeedPhoto[]): Fact[] {
  return facts.some((f) => f.key === "washer") ? facts : [...facts, washerFact(photos)];
}

/** A starting X-ray row for hero-1, written by the seed (model "seed") until GH-9 runs. */
export function heroFactsRow(photos: SeedPhoto[]) {
  const result = { facts: [washerFact(photos)], contradictions: [], missing_photos: [] };
  XrayResultSchema.parse(result);
  return { listing_id: HERO_LISTINGS.hero1.id, ...result, model: "seed" };
}
