import { describe, expect, it, vi } from "vitest";
import { DEMO_DEAL, HERO_1_POLICY } from "@/seed/fixtures";
import { negotiationTools, type DealMessageDraft, type TurnSide, type TurnState } from "./tools";

const policy = {
  negotiable: HERO_1_POLICY.negotiable,
  floor_nightly_cents: HERO_1_POLICY.floor_nightly_cents,
  max_discount_pct: HERO_1_POLICY.max_discount_pct,
  auto_accept_total_cents: HERO_1_POLICY.auto_accept_total_cents,
  allowed_terms: [...HERO_1_POLICY.allowed_terms],
};

function side(extra: Partial<TurnSide> = {}) {
  const saved: DealMessageDraft[] = [];
  const s: TurnSide = {
    by: "host_agent",
    listTotalCents: 52_000,
    nights: 4,
    cleaningCents: 4_000,
    round: 2,
    maxRounds: 6,
    moveKind: "counter",
    theirLastCents: 47_000,
    stay: "Nov 9 to Nov 13",
    policy,
    save: vi.fn(async (m: DealMessageDraft) => {
      saved.push(m);
    }),
    ...extra,
  };
  const state: TurnState = { outcome: null };
  return {
    s,
    state,
    saved,
    tools: negotiationTools(s, state) as unknown as Record<string, AnyTool>,
  };
}
/** A tool's execute, called directly (the AI SDK passes call options second). */
type AnyTool = { execute: (input: unknown, options: unknown) => Promise<Record<string, unknown>> };
const run = (t: AnyTool, input: unknown) => t.execute(input, { toolCallId: "t", messages: [] });

describe("host tools", () => {
  it("counters within the rules and ends the turn", async () => {
    const { tools, state, saved } = side();
    const result = await run(tools.make_offer, {
      amountCents: 49_500,
      terms: [],
      reason: "Can do $25 off",
    });
    expect(result).toEqual({ ok: true, summary: "Host agent countered at $495 (-$25)" });
    expect(saved).toEqual([
      {
        actor: "host_agent",
        type: "counter",
        amount_cents: 49_500,
        terms: {},
        body: "Can do $25 off",
      },
    ]);
    expect(state.outcome).toEqual({ type: "counter", amountCents: 49_500, terms: {} });
  });

  it("refuses accepting a lowball below the $442 floor: a grey note with no amount, and the turn goes on", async () => {
    const { tools, state, saved } = side({ theirLastCents: 40_000 });
    const result = await run(tools.accept_offer, { reason: "ok" });
    expect(result).toMatchObject({ ok: false, code: "below_floor" });
    expect(JSON.stringify(result)).not.toMatch(/442|44,200|100\.00|10000/);
    expect(saved).toEqual([
      expect.objectContaining({ type: "rejected", amount_cents: null, terms: {} }),
    ]);
    expect(saved[0].body).not.toMatch(/\d/);
    expect(state.outcome).toBeNull();
    expect(
      (await run(tools.make_offer, { amountCents: 44_500, terms: [], reason: "Meet me here" })).ok,
    ).toBe(true);
  });

  it("keeps the price when not negotiable, but may offer an allowed extra", async () => {
    const { tools } = side({ policy: { ...policy, negotiable: false } });
    expect(
      await run(tools.make_offer, { amountCents: 50_000, terms: [], reason: "x" }),
    ).toMatchObject({
      ok: false,
      code: "not_negotiable",
    });
    expect(
      await run(tools.make_offer, {
        amountCents: 52_000,
        terms: ["late_checkout"],
        reason: "Late checkout instead",
      }),
    ).toMatchObject({ ok: true });
  });

  it("keeps the refusal reason out of the public summary", async () => {
    const { tools } = side({ theirLastCents: 40_000 });
    const result = await run(tools.accept_offer, { reason: "ok" });
    expect(result).toMatchObject({ ok: false, code: "below_floor" });
    expect(String(result.summary)).not.toMatch(/below_floor|floor/);
  });

  it("lets only one of two parallel moves through", async () => {
    const { tools, saved } = side();
    const results = await Promise.all([
      run(tools.make_offer, { amountCents: 49_500, terms: [], reason: "a" }),
      run(tools.make_offer, { amountCents: 50_000, terms: [], reason: "b" }),
    ]);
    expect(results.filter((r) => r.ok === true)).toHaveLength(1);
    expect(saved.filter((m) => m.type === "counter")).toHaveLength(1);
  });

  it("drops a reason that names the host's private amounts", async () => {
    const { tools, saved } = side({ privateAmountsCents: [10_000, 44_200, 49_000] });
    await run(tools.make_offer, {
      amountCents: 49_500,
      terms: [],
      reason: "I can't go under $442, so $495.",
    });
    expect(saved[0]).toMatchObject({ type: "counter", amount_cents: 49_500, body: "" });
  });

  it("does not move when the deal moved on meanwhile", async () => {
    const { tools, saved, state } = side({ stillCurrent: async () => false });
    expect(
      await run(tools.make_offer, { amountCents: 49_500, terms: [], reason: "x" }),
    ).toMatchObject({
      ok: false,
      code: "deal_moved",
    });
    expect(saved).toEqual([]);
    expect(state.outcome).toBeNull();
  });

  it("refuses moves past the round limit", async () => {
    const { tools } = side({ round: 7 });
    expect(
      await run(tools.make_offer, { amountCents: 49_500, terms: [], reason: "x" }),
    ).toMatchObject({
      ok: false,
      code: "round_limit",
    });
  });

  it("allows one move per turn, and can decline or hand over to the host", async () => {
    const a = side();
    await run(a.tools.decline, { reason: "Not this time" });
    expect(a.state.outcome).toEqual({
      type: "decline",
      body: "The host agent declined this deal.",
    });
    expect(
      await run(a.tools.make_offer, { amountCents: 49_500, terms: [], reason: "x" }),
    ).toMatchObject({
      ok: false,
      code: "turn_over",
    });
    const b = side();
    await run(b.tools.escalate_to_host, { reason: "Asks about a pet" });
    expect(b.state.outcome).toMatchObject({ type: "escalate" });
    expect(b.tools.ask_guest).toBeUndefined();
  });
});

describe("guest tools", () => {
  const guest = (extra: Partial<TurnSide> = {}) =>
    side({
      by: "guest_agent",
      policy: undefined,
      guestMaxCents: DEMO_DEAL.guestMaxCents,
      moveKind: "counter",
      round: 3,
      theirLastCents: 49_500,
      ...extra,
    });

  it("can't accept above the guest's $500 maximum, and asks the guest instead", async () => {
    const { tools, state } = guest({ theirLastCents: 51_000 });
    expect(await run(tools.accept_offer, { reason: "fine" })).toMatchObject({
      ok: false,
      code: "above_guest_max",
    });
    expect(state.outcome).toBeNull();
    await run(tools.ask_guest, { question: "The host wants $510, over your $500. Book it?" });
    expect(state.outcome).toMatchObject({ type: "question" });
    // The deal room (read by the host too) gets code-written text, not the agent's question.
    expect(JSON.stringify(state.outcome)).not.toMatch(/500|510/);
    expect(tools.decline).toBeUndefined();
  });

  it("accepts the host's extras with the price", async () => {
    const { tools, state } = guest({
      theirLastCents: 49_000,
      theirLastTerms: { late_checkout: true },
    });
    expect(await run(tools.accept_offer, { reason: "ok" })).toMatchObject({ ok: true });
    expect(state.outcome).toMatchObject({ type: "accept", terms: { late_checkout: true } });
  });

  it("counters $480 in the demo", async () => {
    const { tools } = guest();
    expect(
      await run(tools.make_offer, { amountCents: 48_000, terms: [], reason: "Meet in the middle" }),
    ).toEqual({
      ok: true,
      summary: "Guest agent countered at $480 (-$40)",
    });
  });

  it("has nothing to accept before the host made an offer", async () => {
    const { tools } = guest({ theirLastCents: null, moveKind: "offer", round: 1 });
    expect(await run(tools.accept_offer, { reason: "x" })).toMatchObject({
      ok: false,
      code: "nothing_to_accept",
    });
  });
});
