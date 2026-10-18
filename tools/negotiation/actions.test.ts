import { beforeEach, describe, expect, it, vi } from "vitest";

// In-memory deal store and data: the human actions run against the real tools and rules.
const h = vi.hoisted(() => ({
  deal: {} as Record<string, unknown>,
  messages: [] as Record<string, unknown>[],
  overlap: false,
}));
vi.mock("@/lib/events", () => ({ logEvent: vi.fn(async () => {}) }));
vi.mock("@/lib/data/reservations", () => ({
  hasOverlappingReservation: async () => h.overlap,
  createReservation: vi.fn(async () => "reservation-1"),
  DatesTakenError: class DatesTakenError extends Error {},
}));
vi.mock("@/lib/data/listings", () => ({
  getListing: async () => LISTING,
  getAvailability: async () => ({ blockedDates: [], overrides: [] }),
  getProfile: async () => ({ name: "Giorgi" }),
}));
vi.mock("@/lib/data/deals", () => ({
  getDeal: async () => ({ ...h.deal }),
  getDealMessages: async () =>
    h.messages.map((m, i) => ({
      id: String(i),
      created_at: String(i),
      deal_id: "d",
      terms: {},
      ...m,
    })),
  saveDealMessage: async (_id: string, m: Record<string, unknown>) => {
    h.messages.push(m);
  },
  updateDealIf: async (_id: string, expect: { status: string; rounds?: number }, patch: object) => {
    if (h.deal.status !== expect.status) return null;
    if (expect.rounds !== undefined && h.deal.rounds !== expect.rounds) return null;
    Object.assign(h.deal, patch);
    return { ...h.deal };
  },
}));
vi.mock("@/agents/context", () => ({
  buildHostContext: async () => ({
    listing: { ...LISTING, house_manual: "" },
    facts: null,
    houseManual: "",
    policy: { ...HERO_1_POLICY, allowed_terms: [...HERO_1_POLICY.allowed_terms] },
  }),
}));

import { createReservation } from "@/lib/data/reservations";
import { logEvent } from "@/lib/events";
import { DEMO_DEAL, DEMO_PROFILES, HERO_1_POLICY, HERO_LISTINGS } from "@/seed/fixtures";
import { acceptLast, approve } from "./actions";

const LISTING = {
  id: HERO_LISTINGS.hero1.id,
  host_id: HERO_LISTINGS.hero1.hostId,
  title: "Stone house with a fireplace",
  base_price_cents: 12_000,
  weekend_price_cents: null,
  cleaning_fee_cents: 4_000,
  max_guests: 4,
};
const nino = { role: "guest" as const, profileId: DEMO_PROFILES.nino.id, name: "Nino" };
const giorgi = { role: "host" as const, profileId: DEMO_PROFILES.giorgi.id, name: "Giorgi" };

function deal(extra: Record<string, unknown>) {
  h.deal = {
    id: "11111111-1111-4111-8111-111111111111",
    listing_id: LISTING.id,
    guest_id: nino.profileId,
    check_in: DEMO_DEAL.checkIn,
    check_out: DEMO_DEAL.checkOut,
    guests: 4,
    status: "open",
    list_total_cents: 52_000,
    current_offer_cents: null,
    final_total_cents: null,
    final_terms: {},
    rounds: 0,
    ...extra,
  };
}

beforeEach(() => {
  h.messages = [];
  h.overlap = false;
  vi.mocked(logEvent).mockClear();
  vi.mocked(createReservation).mockClear();
});

describe("approve", () => {
  it("books the agreed $480 with the -$40 discount: $528 in all, once", async () => {
    deal({ status: "agreed_pending_host", final_total_cents: 48_000, rounds: 4 });
    expect(await approve("d", giorgi)).toBe("reservation-1");
    expect(vi.mocked(createReservation).mock.calls[0][0]).toMatchObject({
      discount_cents: 4_000,
      service_fee_cents: 4_800,
      total_cents: 52_800,
    });
    await expect(approve("d", giorgi)).rejects.toMatchObject({ status: 409 });
  });

  it("refuses the guest", async () => {
    deal({ status: "agreed_pending_host", final_total_cents: 48_000 });
    await expect(approve("d", nino)).rejects.toMatchObject({ status: 403 });
  });

  it("ends declined and says so in the feed when the dates were taken meanwhile", async () => {
    deal({ status: "agreed_pending_host", final_total_cents: 48_000 });
    h.overlap = true;
    await expect(approve("d", giorgi)).rejects.toMatchObject({ status: 409, code: "cannot_book" });
    expect(h.deal.status).toBe("declined");
    expect(vi.mocked(logEvent).mock.calls.map(([e]) => e.action)).toContain("deal.booking_failed");
  });
});

describe("acceptLast", () => {
  it("accepting the host's $490 books at once (auto-accept)", async () => {
    deal({ status: "expired", rounds: 6 });
    h.messages = [
      { actor: "guest_agent", type: "offer", amount_cents: 47_000 },
      { actor: "host_agent", type: "counter", amount_cents: 49_000 },
    ];
    expect(await acceptLast("d", nino)).toBe("approved");
    expect(createReservation).toHaveBeenCalledTimes(1);
  });

  it("logs deal.booking_failed and ends declined when that booking fails", async () => {
    deal({ status: "expired", rounds: 6 });
    h.messages = [{ actor: "host_agent", type: "counter", amount_cents: 49_000 }];
    h.overlap = true;
    await expect(acceptLast("d", nino)).rejects.toMatchObject({ status: 409, code: "cannot_book" });
    expect(h.deal.status).toBe("declined");
    const failed = vi
      .mocked(logEvent)
      .mock.calls.map(([e]) => e)
      .find((e) => e.action === "deal.booking_failed");
    expect(failed?.summary).toMatch(/booked in the meantime/);
  });

  it("waits for the host below auto-accept", async () => {
    deal({ status: "escalated", rounds: 3 });
    h.messages = [{ actor: "host_agent", type: "counter", amount_cents: 48_000 }];
    expect(await acceptLast("d", nino)).toBe("agreed_pending_host");
    expect(createReservation).not.toHaveBeenCalled();
  });
});
