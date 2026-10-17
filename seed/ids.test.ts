import { describe, expect, it } from "vitest";
import { EventInputSchema } from "@/lib/schemas/core";
import { seedId, uuidV5 } from "./ids";

describe("uuidV5", () => {
  it("matches the RFC test vector", () => {
    const dns = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
    expect(uuidV5("www.example.com", dns)).toBe("2ed6657d-e927-568b-95e1-2665a8aea6a2");
  });
});

describe("seedId", () => {
  it("is stable and different per name", () => {
    expect(seedId("listing:batumi-sea-view-flat")).toBe(seedId("listing:batumi-sea-view-flat"));
    expect(seedId("listing:a")).not.toBe(seedId("listing:b"));
  });

  it("gives ids that logEvent accepts", () => {
    const listing_id = seedId("listing:tbilisi-sololaki-loft");
    const event = {
      actor_type: "system",
      actor_name: "Seed",
      action: "x",
      summary: "x",
      listing_id,
    };
    expect(EventInputSchema.safeParse(event).success).toBe(true);
  });
});
