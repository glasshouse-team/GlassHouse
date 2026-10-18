import { beforeEach, describe, expect, it, vi } from "vitest";

// Every data module is mocked: nothing here touches Supabase.
const state = vi.hoisted(() => ({
  viewer: { role: "host", profileId: "", name: "Giorgi" },
  listing: null as unknown,
}));
vi.mock("@/lib/viewer", () => ({ getViewer: async () => state.viewer }));
vi.mock("@/lib/data/listings", () => ({ getListing: async () => state.listing }));
vi.mock("@/lib/data/policies", () => ({ saveHostPolicy: vi.fn(async () => {}) }));
vi.mock("@/lib/events", () => ({ logEvent: vi.fn(async () => {}) }));

import { saveHostPolicy } from "@/lib/data/policies";
import { logEvent } from "@/lib/events";
import { DEMO_PROFILES, HERO_1_POLICY, HERO_LISTINGS } from "@/seed/fixtures";
import { PUT } from "./route";

const hero = {
  id: HERO_LISTINGS.hero1.id,
  host_id: HERO_LISTINGS.hero1.hostId,
  title: "Stone house with a fireplace",
};
const rules = {
  negotiable: HERO_1_POLICY.negotiable,
  floor_nightly_cents: HERO_1_POLICY.floor_nightly_cents,
  max_discount_pct: HERO_1_POLICY.max_discount_pct,
  auto_accept_total_cents: HERO_1_POLICY.auto_accept_total_cents,
  allowed_terms: [...HERO_1_POLICY.allowed_terms],
};

async function put(body: unknown) {
  const response = await PUT(
    new Request(`http://localhost/api/host-policies/${hero.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ listingId: hero.id }) },
  );
  const json = (await response.json()) as { error?: string };
  return { status: response.status, error: json.error };
}

beforeEach(() => {
  state.viewer = { role: "host", profileId: DEMO_PROFILES.giorgi.id, name: "Giorgi" };
  state.listing = hero;
  vi.mocked(saveHostPolicy).mockClear();
  vi.mocked(logEvent).mockClear();
});

describe("PUT /api/host-policies/[listingId]", () => {
  it("saves the rules for the home's host and logs the change without numbers", async () => {
    expect((await put(rules)).status).toBe(200);
    expect(saveHostPolicy).toHaveBeenCalledWith(hero.id, rules);
    const event = vi.mocked(logEvent).mock.calls[0][0];
    expect(event).toMatchObject({
      actor_type: "human",
      action: "policy.updated",
      listing_id: hero.id,
      summary: "Giorgi updated the agent rules for Stone house with a fireplace",
    });
    expect(event.payload).toBeUndefined();
  });

  it("refuses guests, other hosts and unknown homes", async () => {
    state.viewer = { role: "guest", profileId: DEMO_PROFILES.nino.id, name: "Nino" };
    expect(await put(rules)).toEqual({ status: 403, error: "not_your_listing" });
    state.viewer = { role: "host", profileId: DEMO_PROFILES.ana.id, name: "Ana" };
    expect(await put(rules)).toEqual({ status: 403, error: "not_your_listing" });
    state.listing = null;
    expect(await put(rules)).toEqual({ status: 404, error: "not_found" });
    expect(saveHostPolicy).not.toHaveBeenCalled();
  });

  it("rejects a zero floor or auto-accept, a discount above 100% and fractional cents", async () => {
    for (const bad of [
      { floor_nightly_cents: 0 },
      { auto_accept_total_cents: 0 },
      { max_discount_pct: 120 },
      { floor_nightly_cents: 9_950.5 },
    ])
      expect(await put({ ...rules, ...bad })).toEqual({ status: 400, error: "invalid_input" });
    expect(saveHostPolicy).not.toHaveBeenCalled();
    expect(logEvent).not.toHaveBeenCalled();
  });
});
