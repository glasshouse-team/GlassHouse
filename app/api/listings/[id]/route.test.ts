import { beforeEach, describe, expect, it, vi } from "vitest";

// The data layer and feed are mocked: nothing here touches Supabase.
const state = vi.hoisted(() => ({
  viewer: { role: "host", profileId: "", name: "Giorgi" },
  listing: null as Record<string, unknown> | null,
  dependants: { liveDeals: 0, upcomingStays: 0 },
}));
vi.mock("@/lib/viewer", () => ({ getViewer: async () => state.viewer }));
vi.mock("@/lib/data/listings", () => ({
  getListingById: async () => state.listing,
  getHomeDependants: vi.fn(async () => state.dependants),
  deleteHostListing: vi.fn(async () => {}),
}));
vi.mock("@/lib/events", () => ({ logEvent: vi.fn(async () => {}) }));

import { deleteHostListing } from "@/lib/data/listings";
import { logEvent } from "@/lib/events";
import { DEMO_PROFILES, HERO_LISTINGS } from "@/seed/fixtures";
import { DELETE } from "./route";

const ADDED = "33333333-3333-4333-8333-333333333333";
const added = { id: ADDED, slug: "sunny-flat-x7k2qa", title: "Sunny flat", host_id: "" };

async function del(id = ADDED) {
  const response = await DELETE(
    new Request(`http://localhost/api/listings/${id}`, { method: "DELETE" }),
    {
      params: Promise.resolve({ id }),
    },
  );
  return { status: response.status, json: (await response.json()) as Record<string, unknown> };
}

beforeEach(() => {
  state.viewer = { role: "host", profileId: DEMO_PROFILES.giorgi.id, name: "Giorgi" };
  state.listing = { ...added, host_id: DEMO_PROFILES.giorgi.id };
  state.dependants = { liveDeals: 0, upcomingStays: 0 };
  vi.mocked(deleteHostListing).mockClear();
  vi.mocked(logEvent).mockClear();
});

describe("DELETE /api/listings/[id]", () => {
  it("deletes the host's own added home and logs it without a listing id", async () => {
    expect(await del()).toEqual({ status: 200, json: { ok: true } });
    expect(deleteHostListing).toHaveBeenCalledWith(ADDED);
    const event = vi.mocked(logEvent).mock.calls[0][0];
    expect(event).toMatchObject({
      action: "listing.deleted",
      summary: "Giorgi deleted the home Sunny flat",
      payload: { listingId: ADDED, slug: "sunny-flat-x7k2qa" },
    });
    expect(event).not.toHaveProperty("listing_id");
  });

  it("refuses guests, other hosts, unknown homes, demo homes and homes guests depend on", async () => {
    state.viewer = { role: "guest", profileId: DEMO_PROFILES.nino.id, name: "Nino" };
    expect((await del()).status).toBe(403);
    state.viewer = { role: "host", profileId: DEMO_PROFILES.ana.id, name: "Ana" };
    expect((await del()).json.error).toBe("not_your_listing");
    state.viewer = { role: "host", profileId: DEMO_PROFILES.giorgi.id, name: "Giorgi" };

    state.listing = null;
    expect((await del()).status).toBe(404);
    state.listing = { ...added, slug: HERO_LISTINGS.hero1.slug, host_id: DEMO_PROFILES.giorgi.id };
    expect(await del()).toMatchObject({ status: 409, json: { error: "demo_home" } });
    state.listing = { ...added, host_id: DEMO_PROFILES.giorgi.id };
    state.dependants = { liveDeals: 0, upcomingStays: 1 };
    expect(await del()).toMatchObject({ status: 409, json: { error: "has_bookings" } });
    state.dependants = { liveDeals: 2, upcomingStays: 0 };
    expect(await del()).toMatchObject({ status: 409, json: { error: "live_deals" } });

    expect(deleteHostListing).not.toHaveBeenCalled();
    expect(logEvent).not.toHaveBeenCalled();
  });
});
