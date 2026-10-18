import { beforeEach, describe, expect, it, vi } from "vitest";

// A fake Supabase that records which tables are read and returns one fixture row per table.
const db = vi.hoisted(() => ({ rows: {} as Record<string, unknown>, tables: [] as string[] }));
vi.mock("@/lib/supabase", () => ({
  supabaseAdmin: () => ({
    from(table: string) {
      db.tables.push(table);
      const query = {
        select: () => query,
        eq: () => query,
        not: () => query,
        order: () => query,
        limit: () => query,
        maybeSingle: async () => ({ data: db.rows[table] ?? null, error: null }),
      };
      return query;
    },
  }),
}));

import { DEMO_PROFILES, HERO_LISTINGS } from "@/seed/fixtures";
import {
  buildGuestContext,
  buildHostContext,
  guestPrompt,
  hostPrompt,
  toGuestContext,
  toHostContext,
} from "./context";

// Odd numbers that can't appear by accident, so a leak is easy to spot.
const FLOOR = 10_123;
const AUTO_ACCEPT = 48_777;
const GUEST_MAX = 50_111;
const GUEST_TARGET = 46_999;
const DEAL_ID = "22222222-2222-4222-8222-222222222222";

const listing = {
  id: HERO_LISTINGS.hero1.id,
  host_id: HERO_LISTINGS.hero1.hostId,
  slug: "hero-1",
  title: "Stone house with a fireplace",
  description: "Two bedrooms under Mount Kazbek.",
  city: "Kazbegi",
  neighborhood: "Stepantsminda",
  lat: null,
  lng: null,
  property_type: "house",
  max_guests: 4,
  bedrooms: 2,
  beds: 3,
  baths: 1,
  base_price_cents: 12_000,
  weekend_price_cents: null,
  cleaning_fee_cents: 4_000,
  currency: "USD",
  amenities: ["wifi", "fireplace"],
  house_rules: { pets: false, check_in_after: "15:00" },
  house_manual: "Door code 4417. Wifi: StoneHouse / kazbek2026.",
  status: "published",
  published_world_id: null,
  rating: 4.8,
  review_count: 5,
};
const facts = {
  facts: [{ key: "has_desk", value: true, evidence: ["photo_03"], confidence: 0.9 }],
  contradictions: [],
  missing_photos: [],
};
const policy = {
  listing_id: listing.id,
  negotiable: true,
  floor_nightly_cents: FLOOR,
  max_discount_pct: 13,
  auto_accept_total_cents: AUTO_ACCEPT,
  long_stay_rules: [],
  gap_night_pct: 0,
  max_rounds: 6,
  allowed_terms: ["late_checkout"],
};
const deal = {
  id: DEAL_ID,
  listing_id: listing.id,
  guest_id: DEMO_PROFILES.nino.id,
  check_in: "2026-11-09",
  check_out: "2026-11-13",
  guests: 4,
  status: "open",
  list_total_cents: 52_000,
  current_offer_cents: null,
  final_total_cents: null,
  final_terms: {},
  rounds: 0,
};
const secrets = { guest_target_cents: GUEST_TARGET, guest_max_cents: GUEST_MAX };
const brief = {
  destinations: ["Kazbegi"],
  check_in: "2026-11-09",
  check_out: "2026-11-13",
  nights: 4,
  guests: 4,
  budget: { amount_cents: 6_000, per: "night_per_person" },
  must_haves: ["fireplace"],
  nice_to_haves: [],
  deal_breakers: [],
  work_needs: "one remote worker",
  pets: 0,
  accessibility: [],
};

/** Every way a number can show up in text: 10123, 10,123, $101.23. */
function mentions(text: string, cents: number): boolean {
  const dollars = (cents / 100).toFixed(2);
  return [String(cents), cents.toLocaleString("en-US"), dollars].some((s) => text.includes(s));
}
const HOST_SECRETS = [FLOOR, AUTO_ACCEPT];
const GUEST_SECRETS = [GUEST_MAX, GUEST_TARGET];

beforeEach(() => {
  db.tables = [];
  db.rows = {
    listings: listing,
    listing_facts: facts,
    host_policies: policy,
    deals: deal,
    deal_secrets: secrets,
    trip_briefs: { parsed: brief },
  };
});

describe("buildGuestContext", () => {
  it("never reads host policies, and nothing from them reaches the context or prompt", async () => {
    const context = await buildGuestContext(DEAL_ID);
    expect(db.tables).not.toContain("host_policies");
    const text = JSON.stringify(context) + guestPrompt(context, "Nino");
    for (const secret of HOST_SECRETS) expect(mentions(text, secret)).toBe(false);
  });

  it("carries the guest's own limits, the deal, facts and brief, but not the house manual", async () => {
    const context = await buildGuestContext(DEAL_ID);
    expect(context).toMatchObject({
      guestTargetCents: GUEST_TARGET,
      guestMaxCents: GUEST_MAX,
      deal: { id: DEAL_ID, list_total_cents: 52_000 },
      brief: { guests: 4 },
    });
    expect(context.facts?.facts[0].key).toBe("has_desk");
    expect(context.listing.house_manual).toBe("");
    expect(guestPrompt(context, "Nino")).toContain("$501.11");
  });

  it("refuses a deal without guest limits", async () => {
    db.rows.deal_secrets = null;
    await expect(buildGuestContext(DEAL_ID)).rejects.toThrow(/no guest limits/);
  });
});

describe("buildHostContext", () => {
  it("in qa mode reads neither host policies nor deal secrets", async () => {
    const context = await buildHostContext(listing.id, "qa");
    expect(db.tables).not.toContain("host_policies");
    expect(db.tables).not.toContain("deal_secrets");
    expect(context.policy).toBeUndefined();
    expect(context.houseManual).toContain("Door code");
    for (const secret of HOST_SECRETS)
      expect(mentions(JSON.stringify(context), secret)).toBe(false);
  });

  it("in negotiate mode adds the policy but never the guest's limits", async () => {
    const context = await buildHostContext(listing.id, "negotiate");
    expect(db.tables).not.toContain("deal_secrets");
    expect(context.policy?.floor_nightly_cents).toBe(FLOOR);
    const text = JSON.stringify(context) + hostPrompt(context, "Giorgi");
    for (const secret of GUEST_SECRETS) expect(mentions(text, secret)).toBe(false);
  });

  it("keeps policy numbers out of the host prompt (the agent learns limits from refusals)", async () => {
    const prompt = hostPrompt(await buildHostContext(listing.id, "negotiate"), "Giorgi");
    for (const secret of HOST_SECRETS) expect(mentions(prompt, secret)).toBe(false);
    expect(prompt).not.toMatch(/\b13 ?%/);
    expect(prompt).toContain("late_checkout");
  });

  it("refuses to negotiate without agent rules, and a missing listing", async () => {
    db.rows.host_policies = null;
    await expect(buildHostContext(listing.id, "negotiate")).rejects.toThrow(/no agent rules/);
    db.rows.listings = null;
    await expect(buildHostContext(listing.id, "qa")).rejects.toThrow(/not found/);
  });
});

describe("pure builders", () => {
  it("drop malformed facts and briefs instead of failing", () => {
    const guest = toGuestContext({
      deal,
      listing,
      facts: { facts: "bad" },
      secrets,
      brief: { x: 1 },
    });
    expect(guest.facts).toBeNull();
    expect(guest.brief).toBeNull();
    expect(toHostContext({ listing, facts: null }, "qa").facts).toBeNull();
  });
});
