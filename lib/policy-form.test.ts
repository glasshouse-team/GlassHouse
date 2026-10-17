import { describe, expect, it } from "vitest";
import { HERO_1_POLICY } from "@/seed/fixtures";
import { centsToDollars, dollarsToCents, PolicyFormSchema } from "./policy-form";

describe("PolicyFormSchema", () => {
  const form = {
    negotiable: HERO_1_POLICY.negotiable,
    floor_nightly_cents: HERO_1_POLICY.floor_nightly_cents,
    max_discount_pct: HERO_1_POLICY.max_discount_pct,
    auto_accept_total_cents: HERO_1_POLICY.auto_accept_total_cents,
    allowed_terms: [...HERO_1_POLICY.allowed_terms],
  };

  it("accepts the hero-1 policy", () => {
    expect(PolicyFormSchema.safeParse(form).success).toBe(true);
  });

  it("rejects a zero floor, a discount above 100%, fractional cents and unknown extras", () => {
    expect(PolicyFormSchema.safeParse({ ...form, floor_nightly_cents: 0 }).success).toBe(false);
    expect(PolicyFormSchema.safeParse({ ...form, max_discount_pct: 101 }).success).toBe(false);
    expect(PolicyFormSchema.safeParse({ ...form, floor_nightly_cents: 100.5 }).success).toBe(false);
    expect(PolicyFormSchema.safeParse({ ...form, allowed_terms: ["free_breakfast"] }).success).toBe(
      false,
    );
  });

  it("allows 'always ask' (no auto-accept)", () => {
    expect(PolicyFormSchema.safeParse({ ...form, auto_accept_total_cents: null }).success).toBe(
      true,
    );
  });
});

describe("dollar fields", () => {
  it("turns typed dollars into cents and back", () => {
    expect(dollarsToCents("100")).toBe(10_000);
    expect(dollarsToCents(" 99.50 ")).toBe(9_950);
    expect(dollarsToCents("")).toBeNull();
    expect(dollarsToCents("1,000")).toBeNaN();
    expect(centsToDollars(49_000)).toBe("490");
    expect(centsToDollars(null)).toBe("");
  });
});
