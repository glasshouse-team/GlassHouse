import { describe, expect, it } from "vitest";
import { Amenity } from "@/lib/schemas/core";
import { SEED_LISTINGS } from "./data/listings";
import { SEED_REVIEWS } from "./data/reviews";
import {
  DEMO_DEAL,
  HERO_1_POLICY,
  HERO_1_PRICING,
  HERO_LISTINGS,
  HERO_QA_FIXTURES,
  LIE_LISTING_SLUGS,
} from "./fixtures";
import {
  addDays,
  availabilityRows,
  heroFactsRow,
  listingId,
  listingRow,
  photoRows,
  policyRow,
  reviewRows,
} from "./rows";

const bySlug = (slug: string) => {
  const listing = SEED_LISTINGS.find((l) => l.slug === slug);
  if (!listing) throw new Error(`missing ${slug}`);
  return listing;
};
const hero1 = bySlug(HERO_LISTINGS.hero1.slug);
const CITIES = ["Tbilisi", "Kazbegi", "Batumi", "Sighnaghi"];

describe("seed listings", () => {
  it("has 12 listings with unique slugs and ids in the four cities", () => {
    expect(SEED_LISTINGS).toHaveLength(12);
    expect(new Set(SEED_LISTINGS.map((l) => l.slug)).size).toBe(12);
    expect(new Set(SEED_LISTINGS.map((l) => listingId(l.slug))).size).toBe(12);
    for (const l of SEED_LISTINGS) expect(CITIES).toContain(l.city);
  });

  it("builds rows that pass the contract schemas", () => {
    for (const l of SEED_LISTINGS) {
      expect(() => listingRow(l), l.slug).not.toThrow();
      expect(() => policyRow(l), l.slug).not.toThrow();
      expect(() => reviewRows(l), l.slug).not.toThrow();
      for (const a of l.amenities)
        expect(Amenity.safeParse(a).success, `${l.slug}: ${a}`).toBe(true);
    }
  });

  it("never sets published_world_id, so re-seeding keeps the 3D", () => {
    for (const l of SEED_LISTINGS) expect(listingRow(l)).not.toHaveProperty("published_world_id");
  });

  it("keeps every floor at or below the nightly price, and one listing non-negotiable", () => {
    for (const l of SEED_LISTINGS)
      expect(l.policy.floor_nightly_cents, l.slug).toBeLessThanOrEqual(l.base_price_cents);
    const fixed = SEED_LISTINGS.filter((l) => !l.policy.negotiable);
    expect(fixed.length).toBeGreaterThanOrEqual(1);
    for (const l of fixed) expect(l.policy.allowed_terms.length, l.slug).toBeGreaterThan(0);
  });
});

describe("hero-1 (the demo home)", () => {
  it("uses the fixture prices and policy", () => {
    expect(hero1.base_price_cents).toBe(HERO_1_PRICING.base_price_cents);
    expect(hero1.weekend_price_cents).toBe(HERO_1_PRICING.weekend_price_cents);
    expect(hero1.cleaning_fee_cents).toBe(HERO_1_PRICING.cleaning_fee_cents);
    expect(policyRow(hero1)).toMatchObject({
      listing_id: HERO_LISTINGS.hero1.id,
      ...HERO_1_POLICY,
    });
  });

  it("fits the demo brief", () => {
    expect(["Kazbegi", "Tbilisi"]).toContain(hero1.city);
    expect(hero1.max_guests).toBeGreaterThanOrEqual(DEMO_DEAL.guests);
    for (const a of ["fireplace", "dedicated_workspace", "mountain_view"] as const)
      expect(hero1.amenities).toContain(a);
  });

  it("has no blocked dates in November", () => {
    const blocked = availabilityRows(hero1, "2026-10-18").filter((r) => r.is_blocked);
    expect(blocked.filter((r) => r.date.startsWith("2026-11"))).toEqual([]);
  });

  it("has a source for every answerable Q&A fixture", () => {
    const manualKeys = hero1.house_manual
      .split("\n")
      .map((line) => line.split(":")[0].trim().toLowerCase());
    const factKeys = heroFactsRow([]).facts.map((f) => f.key);
    for (const q of HERO_QA_FIXTURES) {
      if (!("source" in q)) continue;
      const [type, key] = q.source.split(":");
      if (type === "rule") expect(hero1.house_rules, q.source).toHaveProperty(key);
      if (type === "manual") expect(manualKeys, q.source).toContain(key);
      if (type === "fact") expect(factKeys, q.source).toContain(key);
    }
  });

  it("carries at least five review claims that can be pinned in 3D (GH-24)", () => {
    expect(SEED_REVIEWS[hero1.slug].length).toBeGreaterThanOrEqual(5);
  });
});

describe("nothing mentions a hair dryer (hero-1's unanswerable question)", () => {
  it("in listings, manuals, amenities or reviews", () => {
    const text = JSON.stringify({ SEED_LISTINGS, SEED_REVIEWS });
    expect(text).not.toMatch(/hair[\s_-]?dryer|hairdryer/i);
  });
});

describe("the X-ray lies (GH-9)", () => {
  it("sea view: a Batumi listing claims a sea view", () => {
    const l = bySlug(LIE_LISTING_SLUGS.seaView);
    expect(l.city).toBe("Batumi");
    expect(`${l.title} ${l.description}`.toLowerCase()).toContain("stunning sea view");
    expect(l.amenities).toContain("sea_view");
  });

  it("sleeps 6: claims 6 guests with 4 beds and no sofa bed", () => {
    const l = bySlug(LIE_LISTING_SLUGS.sleepsSix);
    expect(l.max_guests).toBe(6);
    expect(l.beds).toBe(4);
    expect(`${l.title} ${l.description}`.toLowerCase()).toContain("sleeps 6");
    expect(JSON.stringify(l)).not.toMatch(/sofa/i);
  });
});

describe("reviews", () => {
  it("has 4-6 per listing", () => {
    for (const l of SEED_LISTINGS) {
      const n = SEED_REVIEWS[l.slug]?.length ?? 0;
      expect(n, l.slug).toBeGreaterThanOrEqual(4);
      expect(n, l.slug).toBeLessThanOrEqual(6);
    }
  });

  it("gives the listing an average rating with one decimal", () => {
    const row = listingRow(hero1);
    expect(row.review_count).toBe(SEED_REVIEWS[hero1.slug].length);
    expect(row.rating).toBe(4.8);
  });
});

describe("availability rows", () => {
  it("covers 60 nights from the start date, all free unless blocked", () => {
    const rows = availabilityRows(hero1, "2026-10-18");
    expect(rows).toHaveLength(60);
    expect(rows[0].date).toBe("2026-10-18");
    expect(rows.at(-1)!.date).toBe(addDays("2026-10-18", 59));
    expect(rows.every((r) => !r.is_blocked)).toBe(true);
  });

  it("blocks the chalet's date and keeps blocked dates outside the window", () => {
    const chalet = bySlug("kazbegi-alpine-chalet");
    expect(
      availabilityRows(chalet, "2026-10-18").find((r) => r.date === "2026-11-11")?.is_blocked,
    ).toBe(true);
    const late = availabilityRows(chalet, "2027-01-01");
    expect(late.find((r) => r.date === "2026-11-11")?.is_blocked).toBe(true);
  });
});

describe("photo rows", () => {
  it("parses NN-room names and ignores other files", () => {
    const rows = photoRows(
      "id",
      ["02-bedroom.jpg", ".DS_Store", "01-living-room.webp"],
      (n) => `u/${n}`,
    );
    expect(rows.map((r) => [r.sort, r.room_label, r.url])).toEqual([
      [1, "living room", "u/01-living-room.webp"],
      [2, "bedroom", "u/02-bedroom.jpg"],
    ]);
  });

  it("points hero-1's washer fact at a laundry photo when there is one", () => {
    const facts = heroFactsRow([
      { room_label: "kitchen", sort: 3 },
      { room_label: "laundry", sort: 7 },
    ]).facts;
    expect(facts[0]).toMatchObject({ key: "washer", value: true, evidence: ["photo_07"] });
  });
});
