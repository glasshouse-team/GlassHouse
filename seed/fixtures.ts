/**
 * Demo numbers shared by tests, the seed script (GH-7) and the negotiation demo (GH-15).
 * Change them here only; lib/pricing.test.ts and lib/validators.test.ts assert the math.
 *
 * Demo dates are Mon Nov 9 to Fri Nov 13, 2026: four weekday nights, so the weekend
 * rate never applies. (An earlier draft used Nov 6-10, which includes Fri/Sat nights.)
 */

/**
 * Fixed ids so the seed (GH-7), the role switcher (GH-8), deals (GH-15), the demo reset
 * (GH-26), tests and demo URLs all point at the same rows. The seed upserts with these ids.
 */
export const DEMO_PROFILES = {
  nino: { id: "00000000-0000-4000-8000-0000000000a1", role: "guest", name: "Nino" },
  giorgi: { id: "00000000-0000-4000-8000-0000000000a2", role: "host", name: "Giorgi" },
  ana: { id: "00000000-0000-4000-8000-0000000000a3", role: "host", name: "Ana" },
} as const;

/** The two real homes from GH-6. Giorgi hosts both; hero-1 runs the negotiation demo. */
export const HERO_LISTINGS = {
  hero1: {
    id: "00000000-0000-4000-8000-0000000000b1",
    slug: "hero-1",
    hostId: DEMO_PROFILES.giorgi.id,
  },
  hero2: {
    id: "00000000-0000-4000-8000-0000000000b2",
    slug: "hero-2",
    hostId: DEMO_PROFILES.giorgi.id,
  },
} as const;

/**
 * The seed logs one event with this action when it finishes. `pnpm demo:reset` (GH-26)
 * deletes every event with a higher id, so the feed starts clean for each run.
 */
export const SEED_COMPLETED_ACTION = "seed.completed";

/** The two deliberate "lies" the X-ray must catch (GH-7 seeds them, GH-9 tests them). */
export const LIE_LISTING_SLUGS = {
  /** Says "stunning sea view"; no photo shows the sea. */
  seaView: "batumi-sea-view-flat",
  /** Says "sleeps 6"; the photos show 4 beds. */
  sleepsSix: "sighnaghi-family-house",
} as const;

/**
 * "Ask this home" checks for hero-1 (GH-16). Answerable ones name the source the answer
 * must cite; the seed (GH-7) makes sure those facts, rules and manual lines exist, and that
 * nothing mentions a hair dryer.
 */
export const HERO_QA_FIXTURES = [
  { question: "Can I bring my dog?", answerable: true, source: "rule:pets" },
  { question: "Is there parking?", answerable: true, source: "manual:parking" },
  { question: "Is the wifi good for video calls?", answerable: true, source: "manual:wifi" },
  { question: "What time can we check in?", answerable: true, source: "rule:check_in_after" },
  { question: "Is there a washing machine?", answerable: true, source: "fact:washer" },
  { question: "Is there a hair dryer?", answerable: false },
] as const;

export const HERO_1_PRICING = {
  base_price_cents: 12_000, // $120 a night
  weekend_price_cents: null, // null = weekend nights cost the same as weekdays
  cleaning_fee_cents: 4_000, // $40
} as const;

/** Host rules for hero home 1. Private to the host agent. */
export const HERO_1_POLICY = {
  negotiable: true,
  floor_nightly_cents: 10_000, // never below $100 a night
  max_discount_pct: 15, // never more than 15% off
  auto_accept_total_cents: 49_000, // $490 or more is booked without asking the host
  long_stay_rules: [],
  gap_night_pct: 0,
  max_rounds: 6,
  allowed_terms: ["late_checkout", "early_checkin"],
} as const;

/** The "Can I pay $50 less?" demo. */
export const DEMO_DEAL = {
  checkIn: "2026-11-09",
  checkOut: "2026-11-13",
  guests: 4, // the trip brief's "4 friends"; the price does not depend on guests
  guestTargetCents: 47_000, // $50 less than the $520 list total
  guestMaxCents: 50_000, // the guest would pay up to $500
} as const;

/**
 * Expected rounds. List total $520 (4 x $120 + $40 cleaning).
 * Effective floor $442 = max($440 by nightly floor, $442 by 15% max discount).
 */
export const DEMO_SCRIPT = [
  { round: 1, actor: "guest_agent", type: "offer", amountCents: 47_000 },
  { round: 2, actor: "host_agent", type: "counter", amountCents: 49_500 },
  { round: 3, actor: "guest_agent", type: "counter", amountCents: 48_000 },
  { round: 4, actor: "host_agent", type: "accept", amountCents: 48_000 }, // < $490, so the host must approve
] as const;
