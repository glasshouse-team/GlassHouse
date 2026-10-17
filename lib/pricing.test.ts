import { describe, expect, it } from "vitest";
import { DEMO_DEAL, HERO_1_PRICING } from "@/seed/fixtures";
import { computeQuote, isWeekendNight, stayNights } from "./pricing";

describe("stayNights", () => {
  it("lists one date per night, excluding check-out", () => {
    expect(stayNights("2026-11-09", "2026-11-13")).toEqual([
      "2026-11-09",
      "2026-11-10",
      "2026-11-11",
      "2026-11-12",
    ]);
  });

  it("rejects zero-night and reversed stays", () => {
    expect(() => stayNights("2026-11-09", "2026-11-09")).toThrow(RangeError);
    expect(() => stayNights("2026-11-13", "2026-11-09")).toThrow(RangeError);
  });

  it("rejects malformed dates", () => {
    expect(() => stayNights("11/09/2026", "2026-11-13")).toThrow(RangeError);
  });
});

describe("isWeekendNight", () => {
  it("treats Friday and Saturday nights as weekend", () => {
    expect(isWeekendNight("2026-11-06")).toBe(true); // Friday
    expect(isWeekendNight("2026-11-07")).toBe(true); // Saturday
    expect(isWeekendNight("2026-11-08")).toBe(false); // Sunday
    expect(isWeekendNight("2026-11-09")).toBe(false); // Monday
  });
});

describe("computeQuote", () => {
  it("prices the demo stay at the $520 list total", () => {
    const q = computeQuote({
      listing: HERO_1_PRICING,
      checkIn: DEMO_DEAL.checkIn,
      checkOut: DEMO_DEAL.checkOut,
    });
    expect(q).toEqual({
      nights: 4,
      nightlyTotalCents: 48_000,
      cleaningCents: 4_000,
      hostSubtotalCents: 52_000,
      discountCents: 0,
      serviceFeeCents: 5_200,
      totalCents: 57_200,
    });
  });

  it("applies the agreed $40 discount from the demo deal ($480 agreed)", () => {
    const q = computeQuote({
      listing: HERO_1_PRICING,
      checkIn: DEMO_DEAL.checkIn,
      checkOut: DEMO_DEAL.checkOut,
      discountCents: 4_000,
    });
    expect(q.hostSubtotalCents - q.discountCents).toBe(48_000);
    expect(q.serviceFeeCents).toBe(4_800);
    expect(q.totalCents).toBe(52_800);
  });

  it("uses the weekend rate on Friday and Saturday nights", () => {
    const listing = { ...HERO_1_PRICING, weekend_price_cents: 15_000 };
    const q = computeQuote({ listing, checkIn: "2026-11-06", checkOut: "2026-11-10" });
    expect(q.nightlyTotalCents).toBe(15_000 + 15_000 + 12_000 + 12_000);
  });

  it("lets a per-date override win over base and weekend prices", () => {
    const q = computeQuote({
      listing: HERO_1_PRICING,
      checkIn: "2026-11-09",
      checkOut: "2026-11-11",
      overrides: [{ date: "2026-11-10", price_override_cents: 9_000 }],
    });
    expect(q.nightlyTotalCents).toBe(12_000 + 9_000);
  });

  it("never lets a discount push the total below zero", () => {
    const q = computeQuote({
      listing: HERO_1_PRICING,
      checkIn: "2026-11-09",
      checkOut: "2026-11-10",
      discountCents: 999_999,
    });
    expect(q.discountCents).toBe(q.hostSubtotalCents);
    expect(q.totalCents).toBe(0);
  });

  it("rejects negative or fractional discounts", () => {
    const base = { listing: HERO_1_PRICING, checkIn: "2026-11-09", checkOut: "2026-11-10" };
    expect(() => computeQuote({ ...base, discountCents: -1 })).toThrow(RangeError);
    expect(() => computeQuote({ ...base, discountCents: 10.5 })).toThrow(RangeError);
  });
});
