import { describe, expect, it } from "vitest";
import { DEMO_DEAL, DEMO_SCRIPT, HERO_1_POLICY, HERO_1_PRICING } from "@/seed/fixtures";
import { computeQuote } from "./pricing";
import {
  acceptanceOutcome,
  effectiveFloorCents,
  validateOffer,
  type OfferCheckInput,
} from "./validators";

const quote = computeQuote({
  listing: HERO_1_PRICING,
  checkIn: DEMO_DEAL.checkIn,
  checkOut: DEMO_DEAL.checkOut,
});
const policy = { ...HERO_1_POLICY, allowed_terms: [...HERO_1_POLICY.allowed_terms] };
const base = {
  listTotalCents: quote.hostSubtotalCents,
  nights: quote.nights,
  cleaningCents: quote.cleaningCents,
  maxRounds: HERO_1_POLICY.max_rounds,
};

const host = (
  kind: OfferCheckInput["kind"],
  amountCents: number,
  extra: Partial<OfferCheckInput> = {},
) => validateOffer({ ...base, by: "host_agent", kind, amountCents, round: 2, policy, ...extra });
const guest = (
  kind: OfferCheckInput["kind"],
  amountCents: number,
  extra: Partial<OfferCheckInput> = {},
) =>
  validateOffer({
    ...base,
    by: "guest_agent",
    kind,
    amountCents,
    round: 1,
    guestMaxCents: DEMO_DEAL.guestMaxCents,
    ...extra,
  });

describe("effectiveFloorCents", () => {
  it("is $442 for the demo: the 15% max discount beats the $100/night floor ($440)", () => {
    expect(quote.hostSubtotalCents).toBe(52_000);
    expect(effectiveFloorCents(policy, base)).toBe(44_200);
  });
});

describe("the '$50 less' demo script", () => {
  it("passes every round in order", () => {
    for (const step of DEMO_SCRIPT) {
      const check =
        step.actor === "host_agent"
          ? host(step.type, step.amountCents, { round: step.round })
          : guest(step.type, step.amountCents, { round: step.round });
      expect(check, `round ${step.round}`).toEqual({ ok: true });
    }
  });

  it("ends in agreed_pending_host because $480 is below the $490 auto-accept", () => {
    expect(acceptanceOutcome(48_000, policy)).toBe("agreed_pending_host");
    expect(acceptanceOutcome(49_000, policy)).toBe("approved");
    expect(acceptanceOutcome(60_000, { auto_accept_total_cents: null })).toBe(
      "agreed_pending_host",
    );
  });
});

describe("host-side rules", () => {
  it("blocks a lowball accept below the floor", () => {
    expect(host("accept", 40_000)).toMatchObject({ ok: false, code: "below_floor" });
    expect(host("counter", 44_199)).toMatchObject({ ok: false, code: "below_floor" });
    expect(host("counter", 44_200)).toEqual({ ok: true });
  });

  it("keeps the listed total when the host does not negotiate", () => {
    const fixed = { ...policy, negotiable: false };
    expect(host("counter", 49_500, { policy: fixed })).toMatchObject({
      ok: false,
      code: "not_negotiable",
    });
    expect(host("counter", 52_000, { policy: fixed, terms: { late_checkout: true } })).toEqual({
      ok: true,
    });
  });

  it("only allows terms the host listed", () => {
    expect(host("counter", 50_000, { terms: { late_checkout: true } })).toEqual({ ok: true });
    expect(host("counter", 50_000, { terms: { pets: 2 } })).toMatchObject({
      ok: false,
      code: "term_not_allowed",
    });
    expect(host("counter", 50_000, { terms: { pets: false } })).toEqual({ ok: true });
  });

  it("refuses to run without the policy", () => {
    expect(host("counter", 50_000, { policy: undefined })).toMatchObject({
      ok: false,
      code: "missing_policy",
    });
  });
});

describe("guest-side rules", () => {
  it("never accepts above the guest's maximum", () => {
    expect(guest("accept", 51_000)).toMatchObject({ ok: false, code: "above_guest_max" });
    expect(guest("counter", 50_000)).toEqual({ ok: true });
  });

  it("may open with a lowball offer (the host side blocks accepting it)", () => {
    expect(guest("offer", 40_000)).toEqual({ ok: true });
  });

  it("refuses to run without the guest's maximum", () => {
    expect(guest("offer", 47_000, { guestMaxCents: undefined })).toMatchObject({
      ok: false,
      code: "missing_guest_max",
    });
  });
});

describe("shared rules", () => {
  it("rejects zero, negative and fractional amounts", () => {
    expect(guest("offer", 0)).toMatchObject({ code: "invalid_amount" });
    expect(guest("offer", -100)).toMatchObject({ code: "invalid_amount" });
    expect(guest("offer", 470.5)).toMatchObject({ code: "invalid_amount" });
  });

  it("rejects amounts above the listed total", () => {
    expect(host("counter", 52_001)).toMatchObject({ ok: false, code: "above_list" });
  });

  it("stops after max_rounds", () => {
    expect(guest("counter", 48_000, { round: 7 })).toMatchObject({
      ok: false,
      code: "round_limit",
    });
  });
});
