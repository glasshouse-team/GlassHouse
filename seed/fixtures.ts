/**
 * Demo numbers shared by tests, the seed script (GH-7) and the negotiation demo (GH-15).
 * Change them here only; lib/pricing.test.ts and lib/validators.test.ts assert the math.
 *
 * Demo dates are Mon Nov 9 to Fri Nov 13, 2026: four weekday nights, so the weekend
 * rate never applies. (An earlier draft used Nov 6-10, which includes Fri/Sat nights.)
 */

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
  guests: 2,
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
