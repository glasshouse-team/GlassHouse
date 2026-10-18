/**
 * CONTRACT FILE (GH-5, owner: Beka). Shared types for listings, money, deals and events.
 * After the contracts freeze, change exported names or fields only with both developers' OK.
 * See docs/CONTRACTS.md.
 */
import { z } from "zod";

// ---------- Primitives ----------

/** Money is always integer cents: $120.00 = 12000. */
export const Cents = z.number().int().nonnegative();
/** Calendar date without time: "2026-11-09". */
export const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

// ---------- Events (activity feed) ----------

export const ActorType = z.enum(["human", "agent", "system"]);
export const AgentName = z.enum(["guest", "host", "verifier"]);
export type AgentName = z.infer<typeof AgentName>;

export const EventInputSchema = z.object({
  actor_type: ActorType,
  /** Who did it, as people read it: "Guest agent", "Giorgi (host)", "Verifier". */
  actor_name: z.string().min(1),
  agent: AgentName.nullish(),
  /** Machine-readable action, dot-separated: "deal.offer", "world.ready", "xray.done". */
  action: z.string().min(1),
  /** One line for the feed, past tense, at most 140 characters. */
  summary: z.string().min(1),
  /** null is accepted because rows from the database use null for "none". */
  listing_id: z.uuid().nullish(),
  deal_id: z.uuid().nullish(),
  payload: z.unknown().optional(),
});
export type EventInput = z.infer<typeof EventInputSchema>;

// ---------- Listings ----------

export const HouseRulesSchema = z
  .object({
    pets: z.union([z.boolean(), z.string()]).optional(),
    smoking: z.boolean().optional(),
    parties: z.boolean().optional(),
    quiet_hours: z.string().optional(),
    check_in_after: z.string().optional(),
    check_out_before: z.string().optional(),
  })
  .catchall(z.unknown());

/**
 * The amenity words the seed, search filters and agents share (docs/teardown.md section 5).
 * No `hair_dryer` (hero-1's unanswerable question) and no `sofa_bed` (lie 2), on purpose.
 */
export const Amenity = z.enum([
  "wifi",
  "dedicated_workspace",
  "kitchen",
  "washer",
  "dryer",
  "dishwasher",
  "coffee_maker",
  "heating",
  "air_conditioning",
  "fireplace",
  "free_parking",
  "street_parking",
  "elevator",
  "tv",
  "balcony",
  "terrace",
  "garden",
  "bbq_grill",
  "hot_tub",
  "sauna",
  "mountain_view",
  "sea_view",
  "city_view",
  "self_check_in",
  "crib",
  "high_chair",
]);
export type Amenity = z.infer<typeof Amenity>;

export const ListingStatus = z.enum(["draft", "published", "archived"]);

export const ListingSchema = z.object({
  id: z.uuid(),
  host_id: z.uuid(),
  slug: z.string(),
  title: z.string(),
  description: z.string(),
  city: z.string(),
  neighborhood: z.string().nullable(),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  property_type: z.string(),
  max_guests: z.number().int().positive(),
  bedrooms: z.number().int().nonnegative(),
  beds: z.number().int().nonnegative(),
  baths: z.number().nonnegative(),
  base_price_cents: Cents,
  /** Price for Friday and Saturday nights. null = same as base. */
  weekend_price_cents: Cents.nullable(),
  cleaning_fee_cents: Cents,
  currency: z.string(),
  amenities: z.array(z.string()),
  house_rules: HouseRulesSchema,
  house_manual: z.string(),
  status: ListingStatus,
  published_world_id: z.uuid().nullable(),
  rating: z.number().nullable(),
  review_count: z.number().int().nonnegative(),
});
export type Listing = z.infer<typeof ListingSchema>;

// ---------- Host rules for the host agent (never visible to the guest side) ----------

export const LongStayRuleSchema = z.object({
  min_nights: z.number().int().positive(),
  discount_pct: z.number().min(0).max(100),
});

export const HostPolicySchema = z.object({
  listing_id: z.uuid(),
  negotiable: z.boolean(),
  floor_nightly_cents: Cents,
  max_discount_pct: z.number().int().min(0).max(100),
  /** Agreed totals at or above this are approved without the host. null = always ask. */
  auto_accept_total_cents: Cents.nullable(),
  long_stay_rules: z.array(LongStayRuleSchema),
  gap_night_pct: z.number().int().min(0).max(100),
  max_rounds: z.number().int().min(1).max(20),
  /** Non-price concessions the host agent may offer, e.g. "late_checkout". */
  allowed_terms: z.array(z.string()),
});
export type HostPolicy = z.infer<typeof HostPolicySchema>;

// ---------- Trip brief (guest agent input) ----------

export const TripBriefSchema = z.object({
  destinations: z.array(z.string()).min(1),
  check_in: IsoDate.nullable(),
  check_out: IsoDate.nullable(),
  nights: z.number().int().positive().nullable(),
  guests: z.number().int().positive(),
  budget: z
    .object({
      amount_cents: Cents,
      per: z.enum(["night", "night_per_person", "total"]),
    })
    .nullable(),
  must_haves: z.array(z.string()),
  nice_to_haves: z.array(z.string()),
  deal_breakers: z.array(z.string()),
  work_needs: z.string().nullable(),
  pets: z.number().int().nonnegative(),
  accessibility: z.array(z.string()),
});
export type TripBrief = z.infer<typeof TripBriefSchema>;

// ---------- Quotes (computed in lib/pricing.ts, never by an LLM) ----------

export const QuoteSchema = z.object({
  nights: z.number().int().positive(),
  nightlyTotalCents: Cents,
  cleaningCents: Cents,
  /** Nights + cleaning. This is the amount guest and host agents negotiate over. */
  hostSubtotalCents: Cents,
  discountCents: Cents,
  serviceFeeCents: Cents,
  totalCents: Cents,
});
export type Quote = z.infer<typeof QuoteSchema>;

// ---------- Deals (negotiation) ----------

export const DealStatus = z.enum([
  "open",
  "agreed_pending_host",
  "escalated",
  "approved",
  "declined",
  "expired",
]);
export type DealStatus = z.infer<typeof DealStatus>;

export const DealActor = z.enum(["guest_agent", "host_agent", "guest", "host", "system"]);
export type DealActor = z.infer<typeof DealActor>;

/** "rejected" stores a validator rejection so the deal room can show it as a grey note. */
export const DealMessageType = z.enum([
  "question",
  "offer",
  "counter",
  "accept",
  "decline",
  "escalate",
  "info",
  "rejected",
]);
export type DealMessageType = z.infer<typeof DealMessageType>;

export const OfferTermsSchema = z.record(
  z.string(),
  z.union([z.boolean(), z.number(), z.string()]),
);
export type OfferTerms = z.infer<typeof OfferTermsSchema>;

export const DealSchema = z.object({
  id: z.uuid(),
  listing_id: z.uuid(),
  guest_id: z.uuid(),
  check_in: IsoDate,
  check_out: IsoDate,
  guests: z.number().int().positive(),
  status: DealStatus,
  list_total_cents: Cents,
  current_offer_cents: Cents.nullable(),
  final_total_cents: Cents.nullable(),
  final_terms: OfferTermsSchema,
  rounds: z.number().int().nonnegative(),
});
export type Deal = z.infer<typeof DealSchema>;

/** One message in the deal room. `body` holds the human-readable reason. */
export const DealMessageSchema = z.object({
  deal_id: z.uuid(),
  actor: DealActor,
  type: DealMessageType,
  amount_cents: Cents.nullable(),
  terms: OfferTermsSchema,
  body: z.string(),
});
export type DealMessage = z.infer<typeof DealMessageSchema>;

// ---------- Reviews ----------

const Stars = z.number().int().min(1).max(5);

/** The six sub-ratings every review carries, 1-5 each. */
export const ReviewSubRatingsSchema = z.object({
  cleanliness: Stars,
  accuracy: Stars,
  check_in: Stars,
  communication: Stars,
  location: Stars,
  value: Stars,
});
export type ReviewSubRatings = z.infer<typeof ReviewSubRatingsSchema>;

export const ReviewSchema = z.object({
  listing_id: z.uuid(),
  guest_id: z.uuid().nullable(),
  author_name: z.string().nullable(),
  rating: Stars,
  sub_ratings: ReviewSubRatingsSchema,
  body: z.string().min(1),
});
export type Review = z.infer<typeof ReviewSchema>;
