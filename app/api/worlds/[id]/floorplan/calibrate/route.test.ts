/**
 * POST /api/worlds/[id]/floorplan/calibrate (GH-18 v2): host only; one measurement scales every
 * plan of the version; refusals (unknown room, no outline, implausible number) save nothing and
 * log nothing; a saved calibration logs exactly one feed event. Storage and rows run on the
 * fake Supabase client, so the real calibration maths and row updates are exercised.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, type FakeSupabase } from "@/tests/fake-supabase";

const LISTING = "22222222-2222-4222-8222-222222222222";
const HOST = "33333333-3333-4333-8333-333333333333";
const OTHER_HOST = "55555555-5555-4555-8555-555555555555";
const BEDROOM_WORLD = "00000000-0000-4000-8000-000000000001";
const KITCHEN_WORLD = "00000000-0000-4000-8000-000000000002";
const OLD_WORLD = "00000000-0000-4000-8000-000000000003";
const UNKNOWN = "99999999-9999-4999-8999-999999999999";

const state = vi.hoisted(() => ({
  fake: null as unknown as FakeSupabase,
  viewer: { role: "host" as "host" | "guest", profileId: "", name: "Giorgi" },
}));

vi.mock("@/lib/supabase", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/supabase")>()),
  supabaseAdmin: () => state.fake.client,
  publicMediaUrl: (path: string) => `https://media.test/${path}`,
}));
vi.mock("@/lib/viewer", () => ({ getViewer: async () => state.viewer }));
vi.mock("@/lib/events", () => ({ logEvent: vi.fn(async () => {}) }));
vi.mock("@/lib/data/listings", () => ({
  getListing: async (id: string) =>
    id === LISTING ? { id: LISTING, host_id: HOST, title: "Tbilisi flat" } : null,
}));

import { logEvent } from "@/lib/events";
import { POST } from "./route";

/** A w x h rectangle centred at (cx, 0). */
const rect = (cx: number, w: number, h: number): [number, number][] => [
  [cx - w / 2, -h / 2],
  [cx + w / 2, -h / 2],
  [cx + w / 2, h / 2],
  [cx - w / 2, h / 2],
];

// Bedroom 4 x 3 m (12 m2), kitchen 2 x 2.5 m (5 m2), in the 3D's meters.
const rooms = (shift: number) => [
  { name: "Bedroom", label: [shift, 0], polygon: rect(shift, 4, 3), area_m2: 12 },
  { name: "Kitchen", label: [shift + 3.1, 0], polygon: rect(shift + 3.1, 2, 2.5), area_m2: 5 },
];

const plan = (worldId: string, shift: number) => ({
  id: `plan-${worldId}`,
  world_id: worldId,
  svg_url: "https://media.test/old.svg",
  rooms: rooms(shift),
  walls: [[shift - 2, -1.5, shift + 2, -1.5]],
  doors: [],
  total_area_m2: 17,
  scale_source: "marble-metric",
  version: "v2",
  status: "ready",
  created_at: "2026-10-18T10:00:00Z",
});

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const call = (id: string, body: unknown) =>
  POST(new Request("http://localhost", { method: "POST", body: JSON.stringify(body) }), ctx(id));

beforeEach(() => {
  vi.mocked(logEvent).mockClear();
  state.fake = createFakeSupabase();
  state.fake.tables.worlds = [
    { id: BEDROOM_WORLD, listing_id: LISTING, version: 2, spot: "bedroom", spot_label: "Bedroom" },
    { id: KITCHEN_WORLD, listing_id: LISTING, version: 2, spot: "kitchen", spot_label: "Kitchen" },
    { id: OLD_WORLD, listing_id: LISTING, version: 1, spot: "bedroom", spot_label: "Bedroom" },
  ];
  state.fake.tables.floor_plans = [
    plan(BEDROOM_WORLD, 0),
    plan(KITCHEN_WORLD, -3.1),
    plan(OLD_WORLD, 0),
  ];
  state.fake.tables.gaps = [];
  state.viewer = { role: "host", profileId: HOST, name: "Giorgi" };
});

const rowOf = (worldId: string) =>
  state.fake.tables.floor_plans.find((r) => r.world_id === worldId) as ReturnType<typeof plan> & {
    rooms: { name: string; area_m2: number | null; calibration?: Record<string, unknown> }[];
  };

describe("POST /api/worlds/[id]/floorplan/calibrate", () => {
  it("scales every plan of the version from one width and logs one event", async () => {
    // Bedroom is 3 m wide on the plan; the host says 3.3 m: scale 1.1, areas x 1.21.
    const res = await call(BEDROOM_WORLD, { room: "bedroom", meters: 3.3 });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.calibration).toMatchObject({
      room: "Bedroom",
      axis: "width",
      meters: 3.3,
      measured_m: 3,
      scale: 1.1,
      by: "Giorgi",
    });
    expect(body.rooms).toEqual([
      { room: "Bedroom", area_m2: 14.52 },
      { room: "Kitchen", area_m2: 6.05 },
    ]);
    expect(body.total_area_m2).toBe(20.6);
    expect(body.plans).toBe(2);

    for (const worldId of [BEDROOM_WORLD, KITCHEN_WORLD]) {
      const row = rowOf(worldId);
      expect(row.scale_source).toBe("host-calibrated");
      expect(row.total_area_m2).toBe(20.6);
      expect(row.rooms[0].calibration).toMatchObject({ meters: 3.3, scale: 1.1 });
      expect(row.rooms[1].calibration).toBeUndefined();
      // Geometry stays in the 3D's meters (the minimap dot is the camera).
      expect(row.rooms[0].polygon).toEqual(
        plan(worldId, worldId === BEDROOM_WORLD ? 0 : -3.1).rooms[0].polygon,
      );
      expect(row.svg_url).toMatch(
        new RegExp(`^https://media.test/worlds/${worldId}/floorplan.svg\\?v=`),
      );
    }
    // Another version is untouched.
    expect(rowOf(OLD_WORLD).scale_source).toBe("marble-metric");
    expect(state.fake.files.has(`media/worlds/${BEDROOM_WORLD}/floorplan.svg`)).toBe(true);

    expect(logEvent).toHaveBeenCalledTimes(1);
    expect(vi.mocked(logEvent).mock.calls[0][0]).toMatchObject({
      action: "floorplan.calibrated",
      actor_type: "human",
      actor_name: "Giorgi",
      listing_id: LISTING,
      payload: { room: "Bedroom", meters: 3.3, scale: 1.1, version: 2 },
    });
  });

  it("calibrates along the length when asked", async () => {
    const res = await call(KITCHEN_WORLD, { room: "Kitchen", axis: "length", meters: 2.5 });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.calibration).toMatchObject({ axis: "length", measured_m: 2.5, scale: 1 });
    expect(body.total_area_m2).toBe(17);
  });

  it("refuses a guest and a host of another home, saving and logging nothing", async () => {
    state.viewer = { role: "guest", profileId: "nino", name: "Nino" };
    expect((await call(BEDROOM_WORLD, { room: "Bedroom", meters: 3.2 })).status).toBe(403);
    state.viewer = { role: "host", profileId: OTHER_HOST, name: "Someone" };
    expect((await call(BEDROOM_WORLD, { room: "Bedroom", meters: 3.2 })).status).toBe(403);
    expect(rowOf(BEDROOM_WORLD).scale_source).toBe("marble-metric");
    expect(logEvent).not.toHaveBeenCalled();
  });

  it("refuses an unknown room (404) and an implausible number (422) without logging", async () => {
    const unknown = await call(BEDROOM_WORLD, { room: "Garage", meters: 3 });
    expect(unknown.status).toBe(404);
    expect((await unknown.json()).error).toBe("unknown_room");
    const far = await call(BEDROOM_WORLD, { room: "Bedroom", meters: 30 });
    expect(far.status).toBe(422);
    expect((await far.json()).message).toContain("3.00 m");
    expect(rowOf(BEDROOM_WORLD).scale_source).toBe("marble-metric");
    expect(logEvent).not.toHaveBeenCalled();
  });

  it("refuses a room without a measured outline (a v1 plan) with 409", async () => {
    (rowOf(BEDROOM_WORLD).rooms[0] as { area_m2: number | null }).area_m2 = null;
    const res = await call(BEDROOM_WORLD, { room: "Bedroom", meters: 3 });
    expect(res.status).toBe(409);
    expect(logEvent).not.toHaveBeenCalled();
  });

  it("returns 409 when the version has no floor plan yet", async () => {
    state.fake.tables.floor_plans = [];
    const res = await call(BEDROOM_WORLD, { room: "Bedroom", meters: 3 });
    expect(res.status).toBe(409);
  });

  it("validates the id and the body (400) and returns 404 for an unknown world", async () => {
    expect((await call("not-a-uuid", { room: "Bedroom", meters: 3 })).status).toBe(400);
    expect((await call(BEDROOM_WORLD, { room: "Bedroom", meters: -1 })).status).toBe(400);
    expect((await call(BEDROOM_WORLD, { room: "Bedroom", axis: "height", meters: 3 })).status).toBe(
      400,
    );
    expect((await call(BEDROOM_WORLD, { room: "", meters: 3 })).status).toBe(400);
    expect((await call(UNKNOWN, { room: "Bedroom", meters: 3 })).status).toBe(404);
    expect(logEvent).not.toHaveBeenCalled();
  });
});
