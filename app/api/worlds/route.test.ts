import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Every data module is mocked: nothing here touches Supabase or World Labs.
const state = vi.hoisted(() => ({
  viewer: { role: "host", profileId: "", name: "Giorgi" },
  listing: null as unknown,
  captures: [] as unknown[],
}));
vi.mock("@/lib/viewer", () => ({ getViewer: async () => state.viewer }));
vi.mock("@/lib/data/listings", () => ({ getListing: async () => state.listing }));
vi.mock("@/lib/events", () => ({ logEvent: vi.fn(async () => {}) }));
vi.mock("@/app/api/captures/store", () => ({ getCaptures: async () => state.captures }));
const fetchSpy = vi.fn(async () => new Response("{}"));

import { logEvent } from "@/lib/events";
import { DEMO_PROFILES, HERO_LISTINGS } from "@/seed/fixtures";
import { POST } from "./route";

const hero = { id: HERO_LISTINGS.hero1.id, host_id: HERO_LISTINGS.hero1.hostId, title: "Hero" };
const A = "33333333-3333-4333-8333-333333333333";
const B = "44444444-4444-4444-8444-444444444444";
const uploaded = (id: string, room: string) => ({
  id,
  listing_id: hero.id,
  status: "uploaded",
  kind: "ring",
  room_markers: [{ room, t: 0 }],
});

async function post(body: unknown) {
  const response = await POST(
    new Request("http://localhost/api/worlds", { method: "POST", body: JSON.stringify(body) }),
  );
  return { status: response.status, json: (await response.json()) as Record<string, unknown> };
}

beforeEach(() => {
  state.viewer = { role: "host", profileId: DEMO_PROFILES.giorgi.id, name: "Giorgi" };
  state.listing = hero;
  state.captures = [uploaded(A, "Entrance"), uploaded(B, "Kitchen")];
  vi.mocked(logEvent).mockClear();
  fetchSpy.mockClear();
  vi.stubGlobal("fetch", fetchSpy);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("POST /api/worlds (generation request, D-038)", () => {
  it("records the request in the feed and makes no network call", async () => {
    vi.stubEnv("DEMO_MODE", "false");
    const { status, json } = await post({ listingId: hero.id, captureIds: [A, B, A] });
    expect(status).toBe(202);
    expect(json).toEqual({ status: "requested", captureIds: [A, B] });
    expect(vi.mocked(logEvent).mock.calls[0]![0]).toMatchObject({
      action: "world.generation_requested",
      listing_id: hero.id,
      summary: "Giorgi asked for a new 3D home from 2 captures (Entrance, Kitchen)",
      payload: { capture_ids: [A, B] },
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("records nothing in demo mode", async () => {
    vi.stubEnv("DEMO_MODE", "true");
    const { status, json } = await post({ listingId: hero.id, captureIds: [A] });
    expect(status).toBe(200);
    expect(json.status).toBe("demo");
    expect(logEvent).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("refuses guests, other hosts and unknown homes", async () => {
    state.viewer = { role: "guest", profileId: DEMO_PROFILES.nino.id, name: "Nino" };
    expect((await post({ listingId: hero.id, captureIds: [A] })).status).toBe(403);
    state.viewer = { role: "host", profileId: DEMO_PROFILES.ana.id, name: "Ana" };
    expect((await post({ listingId: hero.id, captureIds: [A] })).status).toBe(403);
    state.listing = null;
    expect((await post({ listingId: hero.id, captureIds: [A] })).status).toBe(404);
    expect(logEvent).not.toHaveBeenCalled();
  });

  it("refuses captures that are not uploaded or not this home's, and an empty list", async () => {
    state.captures = [{ ...uploaded(A, "Entrance"), status: "failed" }];
    expect((await post({ listingId: hero.id, captureIds: [A] })).status).toBe(409);
    state.captures = [{ ...uploaded(A, "Entrance"), listing_id: B }];
    expect((await post({ listingId: hero.id, captureIds: [A] })).status).toBe(404);
    expect((await post({ listingId: hero.id, captureIds: [] })).status).toBe(400);
    expect(logEvent).not.toHaveBeenCalled();
  });
});
