/**
 * POST /api/worlds/[id]/floorplan (GH-18): only the listing's host may rebuild the plans, since
 * the rebuild rewrites SVGs and room anchors. buildFloorPlans is mocked; it must never run
 * when the caller is refused or the world does not exist.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, type FakeSupabase } from "@/tests/fake-supabase";

const LISTING = "22222222-2222-4222-8222-222222222222";
const HOST = "33333333-3333-4333-8333-333333333333";
const OTHER_HOST = "55555555-5555-4555-8555-555555555555";
const WORLD = "00000000-0000-4000-8000-000000000001";
const UNKNOWN = "99999999-9999-4999-8999-999999999999";

const state = vi.hoisted(() => ({
  fake: null as unknown as FakeSupabase,
  viewer: { role: "host" as "host" | "guest", profileId: "", name: "Giorgi" },
}));

vi.mock("@/lib/supabase", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/supabase")>()),
  supabaseAdmin: () => state.fake.client,
}));
vi.mock("@/lib/viewer", () => ({ getViewer: async () => state.viewer }));
vi.mock("@/lib/data/listings", () => ({
  getListing: async (id: string) =>
    id === LISTING ? { id: LISTING, host_id: HOST, title: "Tbilisi flat" } : null,
}));
vi.mock("@/lib/geometry/store-floorplans", () => ({
  buildFloorPlans: vi.fn(async (listingId: string, version: number) => ({
    listingId,
    version,
    rooms: [{ name: "Kitchen" }],
    plans: [{ spot: "kitchen", svg_url: "https://example.test/plan.svg" }],
  })),
}));

import { buildFloorPlans } from "@/lib/geometry/store-floorplans";
import { POST } from "./route";

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const call = (id: string) => POST(new Request("http://localhost", { method: "POST" }), ctx(id));

beforeEach(() => {
  vi.mocked(buildFloorPlans).mockClear();
  state.fake = createFakeSupabase();
  state.fake.tables.worlds = [{ id: WORLD, listing_id: LISTING, version: 3, spot: "kitchen" }];
  state.viewer = { role: "host", profileId: HOST, name: "Giorgi" };
});

describe("POST /api/worlds/[id]/floorplan", () => {
  it("refuses a guest with 403 and does not rebuild", async () => {
    state.viewer = { role: "guest", profileId: "nino", name: "Nino" };
    const res = await call(WORLD);
    expect(res.status).toBe(403);
    expect(buildFloorPlans).not.toHaveBeenCalled();
  });

  it("refuses a host who does not own this listing with 403 and does not rebuild", async () => {
    state.viewer = { role: "host", profileId: OTHER_HOST, name: "Someone else" };
    const res = await call(WORLD);
    expect(res.status).toBe(403);
    expect(buildFloorPlans).not.toHaveBeenCalled();
  });

  it("rebuilds the plans for the listing's host", async () => {
    const res = await call(WORLD);
    expect(res.status).toBe(200);
    expect(buildFloorPlans).toHaveBeenCalledTimes(1);
    expect(buildFloorPlans).toHaveBeenCalledWith(LISTING, 3);
    const body = await res.json();
    expect(body).toMatchObject({ listingId: LISTING, version: 3 });
    expect(body.plans).toHaveLength(1);
  });

  it("returns 404 for an unknown world and does not rebuild", async () => {
    const res = await call(UNKNOWN);
    expect(res.status).toBe(404);
    expect(buildFloorPlans).not.toHaveBeenCalled();
  });

  it("returns 400 for an id that is not a uuid", async () => {
    const res = await call("not-a-uuid");
    expect(res.status).toBe(400);
    expect(buildFloorPlans).not.toHaveBeenCalled();
  });
});
