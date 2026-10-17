import { describe, expect, it } from "vitest";
import { DEMO_PROFILES, HERO_LISTINGS } from "@/seed/fixtures";
import { Amenity, EventInputSchema, ReviewSchema } from "./core";

const base = {
  actor_type: "system",
  actor_name: "Seed",
  action: "seed.completed",
  summary: "Seeded",
};

describe("EventInputSchema", () => {
  it("accepts null ids, as database rows have them", () => {
    expect(
      EventInputSchema.safeParse({ ...base, listing_id: null, deal_id: null, agent: null }).success,
    ).toBe(true);
  });

  it("rejects ids that are not uuids", () => {
    expect(EventInputSchema.safeParse({ ...base, listing_id: "hero-1" }).success).toBe(false);
  });

  it("accepts the fixed demo ids from seed/fixtures.ts", () => {
    const ids = [...Object.values(DEMO_PROFILES), ...Object.values(HERO_LISTINGS)].map((x) => x.id);
    for (const id of ids)
      expect(EventInputSchema.safeParse({ ...base, listing_id: id }).success, id).toBe(true);
  });
});

describe("ReviewSchema", () => {
  const review = {
    listing_id: HERO_LISTINGS.hero1.id,
    guest_id: DEMO_PROFILES.nino.id,
    author_name: "Nino",
    rating: 4,
    sub_ratings: {
      cleanliness: 5,
      accuracy: 4,
      check_in: 5,
      communication: 5,
      location: 5,
      value: 4,
    },
    body: "The shower pressure in the bathroom is weak.",
  };

  it("accepts a review with all six sub-ratings", () => {
    expect(ReviewSchema.safeParse(review).success).toBe(true);
  });

  it("rejects a missing or out-of-range sub-rating", () => {
    const five: Record<string, number> = { ...review.sub_ratings };
    delete five.value;
    expect(ReviewSchema.safeParse({ ...review, sub_ratings: five }).success).toBe(false);
    expect(
      ReviewSchema.safeParse({ ...review, sub_ratings: { ...review.sub_ratings, value: 6 } })
        .success,
    ).toBe(false);
  });
});

describe("Amenity", () => {
  it("leaves out the words the demo relies on being absent", () => {
    expect(Amenity.safeParse("hair_dryer").success).toBe(false);
    expect(Amenity.safeParse("sofa_bed").success).toBe(false);
    expect(Amenity.safeParse("dedicated_workspace").success).toBe(true);
  });
});
