/**
 * POST /api/worlds/[id]/gaps (GH-19): host-only dry run. The check is mocked; it must never run
 * for a refused caller or an unknown world, and the route never saves anything.
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
vi.mock("@/lib/events", () => ({ logEvent: vi.fn(async () => {}) }));
vi.mock("@/lib/data/listings", () => ({
  getListing: async (id: string) =>
    id === LISTING ? { id: LISTING, host_id: HOST, title: "Tbilisi flat" } : null,
}));
vi.mock("@/tools/verifier/gaps", async (importOriginal) => {
  const gap = {
    viewId: "v4",
    viewIds: ["v4"],
    issue: "invented",
    description: "A door that is not in your photos.",
    severity: 2,
    dir: { x: -1, y: 0, z: 0 },
    position: { x: -1.02, y: 1.4, z: 0 },
    runs: [0, 1, 2],
  };
  return {
    ...(await importOriginal<typeof import("@/tools/verifier/gaps")>()),
    saveSpotCheck: vi.fn(),
    checkSpotWorld: vi.fn(async (worldId: string, options: { runs?: number }) => ({
      worldId,
      listingId: LISTING,
      version: 1,
      spot: "kitchen",
      room: "Kitchen",
      views: [],
      viewImages: new Map(),
      referenceSource: "listing photos",
      realFrames: 2,
      runs: Array.from({ length: options.runs ?? 3 }, () => ({
        views: [],
        objects: [{ view_id: "v0", label: "table", bbox: { x: 0, y: 0, w: 1, h: 1 } }],
      })),
      runGaps: [],
      voted: [gap, { ...gap, issue: "smeared", position: { x: 2, y: 1, z: 0 } }],
      dropped: [
        {
          gap: { ...gap, issue: "smeared", position: { x: 2, y: 1, z: 0 } },
          reason: "The photos show it.",
        },
      ],
      gaps: [gap],
      coverage: 5 / 6,
      usage: { inputTokens: 1, outputTokens: 1 },
    })),
  };
});

import { logEvent } from "@/lib/events";
import { checkSpotWorld, saveSpotCheck } from "@/tools/verifier/gaps";
import { POST } from "./route";

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const call = (id: string, body?: string) =>
  POST(new Request("http://localhost", { method: "POST", body }), ctx(id));

beforeEach(() => {
  vi.mocked(checkSpotWorld).mockClear();
  vi.mocked(logEvent).mockClear();
  state.fake = createFakeSupabase();
  state.fake.tables.worlds = [{ id: WORLD, listing_id: LISTING, version: 1, spot: "kitchen" }];
  state.viewer = { role: "host", profileId: HOST, name: "Giorgi" };
});

describe("POST /api/worlds/[id]/gaps", () => {
  it("returns the voted findings and saves nothing", async () => {
    const res = await call(WORLD);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      worldId: WORLD,
      spot: "kitchen",
      runs: 3,
      saved: false,
      coverage: 5 / 6,
      gaps: [{ issue: "invented", severity: 2, votes: 3, position: { x: -1.02, y: 1.4, z: 0 } }],
      dropped: [{ issue: "smeared", reason: "The photos show it." }],
    });
    expect(json.objects).toHaveLength(1);
    expect(saveSpotCheck).not.toHaveBeenCalled();
  });

  it("passes the number of runs, 1 to 3", async () => {
    expect((await call(WORLD, JSON.stringify({ runs: 1 }))).status).toBe(200);
    expect(vi.mocked(checkSpotWorld).mock.calls[0]![1]).toEqual({ runs: 1 });
    expect((await call(WORLD, JSON.stringify({ runs: 9 }))).status).toBe(400);
    expect((await call(WORLD, "{not json")).status).toBe(400);
  });

  it("refuses guests and other hosts without running the check", async () => {
    state.viewer = { role: "guest", profileId: HOST, name: "Nino" };
    expect((await call(WORLD)).status).toBe(403);
    state.viewer = { role: "host", profileId: OTHER_HOST, name: "Ana" };
    expect((await call(WORLD)).status).toBe(403);
    expect(checkSpotWorld).not.toHaveBeenCalled();
  });

  it("404s an unknown or malformed world id", async () => {
    expect((await call(UNKNOWN)).status).toBe(404);
    expect((await call("nope")).status).toBe(404);
    expect(checkSpotWorld).not.toHaveBeenCalled();
  });

  it("logs one Verifier feed event per run, marked as a dry run", async () => {
    expect((await call(WORLD)).status).toBe(200);
    expect(logEvent).toHaveBeenCalledTimes(1);
    const event = vi.mocked(logEvent).mock.calls[0]![0];
    expect(event).toMatchObject({
      action: "gaps.checked",
      actor_name: "Verifier",
      agent: "verifier",
      listing_id: LISTING,
      payload: { worldId: WORLD, spot: "kitchen", gaps: 1, dropped: 1, dryRun: true },
    });
    expect(event.summary).toContain("1 found");
  });

  it("logs nothing when the caller is refused or the world is unknown", async () => {
    state.viewer = { role: "guest", profileId: HOST, name: "Nino" };
    expect((await call(WORLD)).status).toBe(403);
    state.viewer = { role: "host", profileId: HOST, name: "Giorgi" };
    expect((await call(UNKNOWN)).status).toBe(404);
    expect(logEvent).not.toHaveBeenCalled();
  });

  it("logs gaps.checked.failed and returns 500 when the check throws", async () => {
    vi.mocked(checkSpotWorld).mockRejectedValueOnce(new Error("vision call failed"));
    const res = await call(WORLD);
    expect(res.status).toBe(500);
    expect(logEvent).toHaveBeenCalledTimes(1);
    expect(vi.mocked(logEvent).mock.calls[0]![0]).toMatchObject({
      action: "gaps.checked.failed",
      actor_name: "Verifier",
      listing_id: LISTING,
    });
  });
});
