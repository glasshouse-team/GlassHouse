import { describe, expect, it } from "vitest";
import { PolicyFormSchema } from "@/lib/policy-form";
import { defaultPolicy, homeSlug, NewHomeSchema, slugify } from "./new-home";

const home = {
  title: "Sunny flat by the Dry Bridge",
  city: "Tbilisi",
  property_type: "apartment",
  max_guests: 3,
  bedrooms: 1,
  beds: 2,
  baths: 1,
  base_price_cents: 8_500,
  cleaning_fee_cents: 2_000,
};

describe("NewHomeSchema", () => {
  it("accepts a home and fills the optional fields", () => {
    expect(NewHomeSchema.parse({ ...home, neighborhood: "  " })).toEqual({
      ...home,
      description: "",
      neighborhood: null,
      amenities: [],
    });
  });

  it("refuses prices under $10, fractional cents, odd baths and unknown amenities", () => {
    expect(NewHomeSchema.safeParse({ ...home, base_price_cents: 900 }).success).toBe(false);
    expect(NewHomeSchema.safeParse({ ...home, base_price_cents: 8_500.5 }).success).toBe(false);
    expect(NewHomeSchema.safeParse({ ...home, baths: 1.3 }).success).toBe(false);
    expect(NewHomeSchema.safeParse({ ...home, amenities: ["sofa_bed"] }).success).toBe(false);
    expect(NewHomeSchema.safeParse({ ...home, title: "Flat" }).success).toBe(false);
    expect(NewHomeSchema.safeParse({ ...home, max_guests: 0 }).success).toBe(false);
  });
});

describe("slugs", () => {
  it("turns a title into a url slug", () => {
    expect(slugify("Old Tbilisi flat, sunny!")).toBe("old-tbilisi-flat-sunny");
    expect(slugify("Café über alles")).toBe("cafe-uber-alles");
    expect(slugify("ბინა ვერაზე")).toBe("home");
    expect(slugify("a".repeat(60)).length).toBe(48);
    expect(homeSlug("Sunny flat", "x7k2qa")).toBe("sunny-flat-x7k2qa");
  });
});

describe("defaultPolicy", () => {
  it("starts negotiable, never below the nightly price, and always asks the host", () => {
    const policy = defaultPolicy(8_500);
    expect(PolicyFormSchema.parse(policy)).toEqual({
      negotiable: true,
      floor_nightly_cents: 8_500,
      max_discount_pct: 10,
      auto_accept_total_cents: null,
      allowed_terms: [],
    });
  });
});
