import { beforeEach, describe, expect, it, vi } from "vitest";

// The data layer and feed are mocked: nothing here touches Supabase.
const state = vi.hoisted(() => ({
  viewer: { role: "host", profileId: "", name: "Giorgi" },
}));
vi.mock("@/lib/viewer", () => ({ getViewer: async () => state.viewer }));
vi.mock("@/lib/data/listings", () => ({
  createHostListing: vi.fn(async () => ({ id: "new-id", slug: "sunny-flat-x7k2qa" })),
}));
vi.mock("@/lib/events", () => ({ logEvent: vi.fn(async () => {}) }));

import { createHostListing } from "@/lib/data/listings";
import { logEvent } from "@/lib/events";
import { DEMO_PROFILES } from "@/seed/fixtures";
import { POST } from "./route";

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
  amenities: ["wifi", "kitchen"],
};

async function post(body: unknown) {
  const response = await POST(
    new Request("http://localhost/api/listings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  return { status: response.status, json: (await response.json()) as Record<string, unknown> };
}

beforeEach(() => {
  state.viewer = { role: "host", profileId: DEMO_PROFILES.giorgi.id, name: "Giorgi" };
  vi.mocked(createHostListing).mockClear();
  vi.mocked(logEvent).mockClear();
});

describe("POST /api/listings", () => {
  it("lists the home for the signed-in host and says so in the feed", async () => {
    expect(await post(home)).toEqual({
      status: 201,
      json: { id: "new-id", slug: "sunny-flat-x7k2qa" },
    });
    expect(vi.mocked(createHostListing).mock.calls[0]).toEqual([
      DEMO_PROFILES.giorgi.id,
      { ...home, description: "", neighborhood: null },
    ]);
    expect(vi.mocked(logEvent).mock.calls[0][0]).toMatchObject({
      actor_type: "human",
      action: "listing.created",
      listing_id: "new-id",
      summary: "Giorgi listed a new home: Sunny flat by the Dry Bridge in Tbilisi, $85 a night",
    });
  });

  it("refuses guests and bad bodies, and writes nothing", async () => {
    state.viewer = { role: "guest", profileId: DEMO_PROFILES.nino.id, name: "Nino" };
    expect((await post(home)).status).toBe(403);
    state.viewer = { role: "host", profileId: DEMO_PROFILES.giorgi.id, name: "Giorgi" };
    expect((await post({ ...home, base_price_cents: 500 })).status).toBe(400);
    expect((await post({ ...home, host_id: "someone-else" })).status).toBe(201);
    expect(vi.mocked(createHostListing).mock.calls[0][0]).toBe(DEMO_PROFILES.giorgi.id);
    expect(vi.mocked(createHostListing).mock.calls[0][1]).not.toHaveProperty("host_id");
  });
});
