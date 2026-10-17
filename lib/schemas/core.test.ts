import { describe, expect, it } from "vitest";
import { DEMO_PROFILES, HERO_LISTINGS } from "@/seed/fixtures";
import { EventInputSchema } from "./core";

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
