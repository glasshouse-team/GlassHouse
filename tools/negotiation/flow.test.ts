import { MockLanguageModelV4 } from "ai/test";
import { beforeEach, describe, expect, it, vi } from "vitest";

// In-memory deal store, contexts and a model that never moves: code then plays every
// suggested move through the real tools and validateOffer, so each branch is deterministic.
const h = vi.hoisted(() => ({
  deal: {} as Record<string, unknown>,
  messages: [] as Record<string, unknown>[],
  policy: {} as Record<string, unknown>,
  secrets: { target: null as number | null, max: 0 },
  model: { current: undefined as unknown },
  overlap: false,
}));

vi.mock("@/lib/claude", () => ({
  agentModel: () => h.model.current,
  bulkModel: () => h.model.current,
}));
vi.mock("@/lib/events", () => ({ logEvent: vi.fn(async () => {}) }));
vi.mock("@/lib/data/reservations", () => ({
  hasOverlappingReservation: async () => h.overlap,
  createReservation: vi.fn(async () => "reservation-1"),
}));
vi.mock("@/lib/data/listings", () => ({
  getListing: async () => LISTING,
  getAvailability: async () => ({ blockedDates: [], overrides: [] }),
  getProfile: async (id: string) => ({ name: id === LISTING.host_id ? "Giorgi" : "Nino" }),
}));
vi.mock("@/lib/data/deals", () => ({
  getDeal: async () => ({ ...h.deal }),
  getDealMessages: async () =>
    h.messages.map((m, i) => ({ id: String(i), created_at: String(i), deal_id: "d", ...m })),
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
vi.mock("@/agents/context", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/agents/context")>();
  return {
    ...actual,
    buildHostContext: async () => ({
      listing: { ...LISTING, house_manual: "" },
      facts: null,
      houseManual: "",
      policy: h.policy,
    }),
    buildGuestContext: async () => ({
      deal: h.deal,
      listing: { ...LISTING, house_manual: "" },
      facts: null,
      brief: null,
      guestTargetCents: h.secrets.target,
      guestMaxCents: h.secrets.max,
    }),
  };
});

import { createReservation } from "@/lib/data/reservations";
import { logEvent } from "@/lib/events";
import { DEMO_DEAL, DEMO_PROFILES, HERO_1_POLICY, HERO_LISTINGS } from "@/seed/fixtures";
import { runNegotiation } from "./flow";

const LISTING = {
  id: HERO_LISTINGS.hero1.id,
  host_id: HERO_LISTINGS.hero1.hostId,
  title: "Stone house with a fireplace",
  base_price_cents: 12_000,
  weekend_price_cents: null,
  cleaning_fee_cents: 4_000,
  max_guests: 4,
};

/** A model that answers with text and never calls a tool. Records every prompt it was sent. */
function idleModel() {
  const usage = {
    inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: 1, text: 1, reasoning: undefined },
  };
  const model = new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: "text" as const, text: "Let me think about it." }],
      finishReason: { unified: "stop" as const, raw: undefined },
      usage,
      warnings: [],
    }),
  });
  h.model.current = model;
  return model;
}

function setUp(target: number | null, max: number, policy: Record<string, unknown> = {}) {
  h.deal = {
    id: "11111111-1111-4111-8111-111111111111",
    listing_id: LISTING.id,
    guest_id: DEMO_PROFILES.nino.id,
    check_in: DEMO_DEAL.checkIn,
    check_out: DEMO_DEAL.checkOut,
    guests: 4,
    status: "open",
    list_total_cents: 52_000,
    current_offer_cents: null,
    final_total_cents: null,
    final_terms: {},
    rounds: 0,
  };
  h.messages = [];
  h.policy = {
    ...HERO_1_POLICY,
    listing_id: LISTING.id,
    allowed_terms: [...HERO_1_POLICY.allowed_terms],
    ...policy,
  };
  h.secrets = { target, max };
  h.overlap = false;
  return idleModel();
}

const moves = () =>
  h.messages
    .filter((m) => m.type !== "rejected")
    .map((m) => `${m.actor}:${m.type}:${m.amount_cents ?? ""}`);

beforeEach(() => {
  vi.mocked(createReservation).mockClear();
  vi.mocked(logEvent).mockClear();
});

describe("runNegotiation", () => {
  it("plays the demo: $470, $495, $480, accept, then waits for the host", async () => {
    setUp(DEMO_DEAL.guestTargetCents, DEMO_DEAL.guestMaxCents);
    expect(await runNegotiation("d", { pauseMs: 0 })).toBe("agreed_pending_host");
    expect(moves()).toEqual([
      "guest_agent:offer:47000",
      "host_agent:counter:49500",
      "guest_agent:counter:48000",
      "host_agent:accept:48000",
    ]);
    expect(h.deal).toMatchObject({ final_total_cents: 48_000, rounds: 4 });
    expect(createReservation).not.toHaveBeenCalled();
  });

  it("books at once when the agreed price reaches auto-accept ($490)", async () => {
    setUp(49_000, 50_000);
    expect(await runNegotiation("d", { pauseMs: 0 })).toBe("approved");
    expect(moves()).toEqual(["guest_agent:offer:49000", "host_agent:accept:49000"]);
    expect(vi.mocked(createReservation).mock.calls[0][0]).toMatchObject({
      discount_cents: 3_000,
      total_cents: 53_900,
    });
  });

  it("logs every move code played to the feed, like an agent tool call", async () => {
    setUp(DEMO_DEAL.guestTargetCents, DEMO_DEAL.guestMaxCents);
    await runNegotiation("d", { pauseMs: 0 });
    const toolEvents = vi
      .mocked(logEvent)
      .mock.calls.map(([e]) => e)
      .filter((e) => e.action.startsWith("tool."));
    expect(toolEvents.map((e) => e.summary)).toEqual([
      "Guest agent offered $470 (-$50) for Nov 9 to Nov 13",
      "Host agent countered at $495 (-$25)",
      "Guest agent countered at $480 (-$40)",
      "Host agent accepted $480 (-$40) for Nov 9 to Nov 13",
    ]);
    expect(toolEvents[0]).toMatchObject({
      actor_type: "agent",
      agent: "guest",
      action: "tool.make_offer",
      payload: { ok: true, fallback: true, input: { amountCents: 47_000, terms: [] } },
    });
    expect(JSON.stringify(toolEvents)).not.toMatch(/50000|500\.00|reason/);
  });

  it("ends declined, not approved, when the auto-booking fails", async () => {
    setUp(49_000, 50_000);
    h.overlap = true;
    expect(await runNegotiation("d", { pauseMs: 0 })).toBe("declined");
    expect(createReservation).not.toHaveBeenCalled();
    expect(vi.mocked(logEvent).mock.calls.map(([e]) => e.action)).toContain("deal.booking_failed");
  });

  it("never lets the host go below the $442 floor after a lowball", async () => {
    setUp(40_000, 50_000);
    await runNegotiation("d", { pauseMs: 0 });
    const hostAmounts = h.messages
      .filter((m) => m.actor === "host_agent" && m.amount_cents !== null)
      .map((m) => m.amount_cents as number);
    expect(Math.min(...hostAmounts)).toBeGreaterThanOrEqual(44_200);
    expect(h.deal.final_total_cents).toBeGreaterThanOrEqual(44_200);
  });

  it("asks the guest when the host's best stays above the guest's maximum", async () => {
    setUp(null, 45_000);
    expect(await runNegotiation("d", { pauseMs: 0 })).toBe("escalated");
    expect(h.messages.at(-1)).toMatchObject({ actor: "guest_agent", type: "question" });
  });

  it("keeps the price with an extra when not negotiable, until the round limit", async () => {
    setUp(47_000, 50_000, { negotiable: false });
    expect(await runNegotiation("d", { pauseMs: 0 })).toBe("expired");
    const host = h.messages.filter((m) => m.actor === "host_agent" && m.type !== "rejected");
    expect(host.every((m) => m.amount_cents === 52_000)).toBe(true);
    expect(host[0].terms).toEqual({ late_checkout: true });
    expect(h.deal.rounds).toBe(HERO_1_POLICY.max_rounds);
  });
});

describe("secrets in prompts", () => {
  it("the guest agent never sees the host's floor or auto-accept, the host agent never the guest's limits", async () => {
    // Odd numbers that can't appear by accident.
    const model = setUp(46_990, 50_110, {
      floor_nightly_cents: 10_130,
      auto_accept_total_cents: 48_770,
    });
    await runNegotiation("d", { pauseMs: 0 });
    expect(model.doGenerateCalls.length).toBeGreaterThan(2);
    for (const call of model.doGenerateCalls) {
      const text = JSON.stringify(call.prompt);
      const isGuest = text.includes("guest agent for Nino");
      const forbidden = isGuest
        ? ["10130", "101.30", "48770", "487.70", "44520", "445.20"]
        : ["50110", "501.10", "46990", "469.90"];
      for (const secret of forbidden) expect(text).not.toContain(secret);
    }
  });
});
