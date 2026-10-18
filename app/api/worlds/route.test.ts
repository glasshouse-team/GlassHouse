/**
 * The GH-10 pipeline end to end with a mocked World Labs client and an in-memory Supabase:
 * POST /api/worlds (generating) -> GET /api/worlds/[id]/status (ready, assets in OUR
 * storage) -> POST /api/worlds/[id]/publish (published, previous version archived), plus
 * demo mode, failures and who may call the routes. Nothing here calls World Labs.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, type FakeSupabase } from "@/tests/fake-supabase";

const LISTING = "22222222-2222-4222-8222-222222222222";
const HOST = "33333333-3333-4333-8333-333333333333";
const CAPTURE = "44444444-4444-4444-8444-444444444444";
const SUPABASE = "https://proj.supabase.co";
const OUR = `${SUPABASE}/storage/v1/object/public/media/`;
const CDN = "https://cdn.marble.worldlabs.ai/w-new";

const state = vi.hoisted(() => ({
  fake: null as unknown as FakeSupabase,
  viewer: { role: "host", profileId: "", name: "Giorgi" },
}));

vi.mock("@/lib/supabase", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/supabase")>()),
  supabaseAdmin: () => state.fake.client,
}));
vi.mock("@/lib/marble", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/marble")>()),
  generateWorld: vi.fn(),
  getOperation: vi.fn(),
  getWorld: vi.fn(),
}));
vi.mock("@/lib/events", () => ({ logEvent: vi.fn(async () => {}) }));
vi.mock("@/lib/viewer", () => ({ getViewer: async () => state.viewer }));
vi.mock("@/lib/data/listings", () => ({
  getListing: async (id: string) =>
    id === LISTING ? { id: LISTING, host_id: HOST, title: "Tbilisi flat" } : null,
}));

import { logEvent } from "@/lib/events";
import { generateWorld, getOperation, getWorld, MarbleError, type MarbleWorld } from "@/lib/marble";
import { POST as publish } from "./[id]/publish/route";
import { GET as status } from "./[id]/status/route";
import { GET as list, POST as start } from "./route";

const SPOTS = ["entrance", "kitchen", "living", "bedroom", "bath"];

function seed() {
  state.fake = createFakeSupabase({
    unique: { worlds: [["listing_id", "version", "spot"]] },
    defaults: {
      worlds: {
        links: [],
        error: null,
        ready_at: null,
        published_at: null,
        operation_id: null,
        marble_world_id: null,
        cost_credits: null,
        coverage_score: null,
        thumbnail_url: null,
      },
    },
  });
  const t = state.fake.tables;
  t.listings = [{ id: LISTING, title: "Tbilisi flat", published_world_id: null }];
  t.worlds = SPOTS.map((spot, i) => ({
    id: `00000000-0000-4000-8000-00000000000${i}`,
    listing_id: LISTING,
    version: 2,
    spot,
    spot_label: spot[0].toUpperCase() + spot.slice(1),
    links: [{ to: SPOTS[(i + 1) % 5], azimuth: 90 }],
    status: "published",
    model: "marble-1.1-plus",
    input_kind: "multi-image",
    input_capture_ids: [],
    marble_world_id: `w-${spot}`,
    operation_id: null,
    spz_url: `${OUR}worlds/row-${spot}/splat-web.spz`,
    spz_hq_url: null,
    collider_mesh_url: `${OUR}worlds/row-${spot}/collider.glb`,
    hq_mesh_url: null,
    pano_url: null,
    thumbnail_url: `${OUR}worlds/row-${spot}/thumbnail.webp`,
    caption: null,
    metric_scale_factor: 1.2,
    ground_plane_offset: 0.4,
    coverage_score: spot === "kitchen" ? 0.6 : 0.95,
    cost_credits: 1600,
    error: null,
    created_at: "2026-10-18T08:00:00.000Z",
    ready_at: "2026-10-18T08:00:00.000Z",
    published_at: "2026-10-18T08:00:00.000Z",
  }));
  t.listings[0].published_world_id = t.worlds[0].id;
  t.captures = [
    {
      id: CAPTURE,
      listing_id: LISTING,
      kind: "ring",
      raw_url: `captures/${LISTING}/${CAPTURE}/ring/`,
      prepared_url: null,
      duration_s: null,
      room_markers: [{ room: "Kitchen", t: 0 }],
      heading_track: [0, 45, 90, 135, 180, 225, 270, 315, 20].map((heading, t) => ({ t, heading })),
      gap_id: null,
      status: "uploaded",
    },
  ];
  // GH-22 layout (D-037): 8 ring photos, then a doorway photo, in the private bucket.
  for (let i = 0; i <= 8; i++) {
    state.fake.files.set(`captures/${LISTING}/${CAPTURE}/ring/${String(i).padStart(2, "0")}.jpg`, {
      bytes: 2_000_000,
    });
  }
}

const newWorld: MarbleWorld = {
  world_id: "w-new",
  display_name: "Tbilisi flat - Kitchen v3",
  world_marble_url: "https://marble.worldlabs.ai/world/w-new",
  model: "marble-1.1-plus",
  assets: {
    caption: "A kitchen with a gas cooktop",
    thumbnail_url: `${CDN}/thumbnail.webp`,
    imagery: { pano_url: `${CDN}/pano.png` },
    mesh: { collider_mesh_url: `${CDN}/collider.glb`, hq_mesh_url: `${CDN}/hq.glb` },
    splats: {
      spz_urls: {
        "100k": `${CDN}/s_100k.spz`,
        "500k": `${CDN}/s_500k.spz`,
        full_res: `${CDN}/s.spz`,
      },
      semantics_metadata: { metric_scale_factor: 1.3, ground_plane_offset: 0.5 },
    },
  },
};

const json = (body: unknown) =>
  new Request("http://localhost/api/worlds", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const rows = (version: number) =>
  state.fake.tables.worlds.filter((r) => r.version === version) as Array<Record<string, unknown>>;
const actions = () => vi.mocked(logEvent).mock.calls.map(([e]) => e.action);

beforeEach(() => {
  seed();
  state.viewer = { role: "host", profileId: HOST, name: "Giorgi" };
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SUPABASE);
  vi.stubEnv("DEMO_MODE", "false");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(new Uint8Array(1234))),
  );
  vi.mocked(generateWorld).mockReset().mockResolvedValue({ operation_id: "op-1", done: false });
  vi.mocked(getOperation).mockReset();
  vi.mocked(getWorld).mockReset().mockResolvedValue(newWorld);
  vi.mocked(logEvent).mockClear();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("GH-10 pipeline: generating -> ready -> published", () => {
  it("runs one re-shot spot through every status, with every change in the feed", async () => {
    // 1. Start: v3 with the kitchen generating and the other 4 spots copied (D-031).
    const started = await start(json({ listingId: LISTING, captureIds: [CAPTURE] }));
    expect(started.status).toBe(201);
    const body = (await started.json()) as { version: number; failed: unknown[] };
    expect(body).toMatchObject({ demo: false, version: 3, failed: [] });

    expect(generateWorld).toHaveBeenCalledTimes(1);
    const request = vi.mocked(generateWorld).mock.calls[0][0];
    expect(request.model).toBe("marble-1.1-plus");
    expect(request.world_prompt.type).toBe("multi-image");
    if (request.world_prompt.type !== "multi-image") throw new Error("unreachable");
    expect(request.world_prompt.reconstruct_images).toBe(true);
    expect(request.world_prompt.multi_image_prompt.map((p) => p.azimuth)).toEqual([
      0, 45, 90, 135, 180, 225, 270, 315,
    ]);
    expect(request.world_prompt.multi_image_prompt[0].content).toEqual({
      source: "uri",
      uri: `https://fake.storage/sign/captures/${LISTING}/${CAPTURE}/ring/00.jpg?expires=21600`,
    });

    const v3 = rows(3);
    expect(v3).toHaveLength(5);
    const kitchen = v3.find((r) => r.spot === "kitchen")!;
    expect(kitchen).toMatchObject({
      status: "generating",
      operation_id: "op-1",
      spot_label: "Kitchen",
      input_capture_ids: [CAPTURE],
      links: [{ to: "living", azimuth: 90 }],
    });
    const copies = v3.filter((r) => r.spot !== "kitchen");
    for (const copy of copies) {
      const original = rows(2).find((r) => r.spot === copy.spot)!;
      expect(copy).toMatchObject({
        status: "ready",
        cost_credits: 0,
        spz_url: original.spz_url,
        collider_mesh_url: original.collider_mesh_url,
        coverage_score: original.coverage_score,
        links: original.links,
      });
    }
    expect(actions()).toEqual(["world.generating"]);
    expect(vi.mocked(logEvent).mock.calls[0][0].summary).toBe(
      "World v3 generating for Tbilisi flat: Kitchen (about 1,600 credits)",
    );

    // 2. Poll while running: progress, no row change, no event, no download.
    vi.mocked(getOperation).mockResolvedValueOnce({
      operation_id: "op-1",
      done: false,
      metadata: { progress_percentage: 40 },
    });
    let res = await status(new Request("http://localhost"), ctx(kitchen.id as string));
    expect(await res.json()).toMatchObject({ status: "generating", progress: 0.4, changed: false });
    expect(getWorld).not.toHaveBeenCalled();
    expect(actions()).toEqual(["world.generating"]);

    // 3. Poll when done: assets copied into media/worlds/{id}/, status ready, one event.
    vi.mocked(getOperation).mockResolvedValueOnce({
      operation_id: "op-1",
      done: true,
      response: { ...newWorld, assets: null },
      cost: { total_credits: 1600, line_items: [] },
    });
    res = await status(new Request("http://localhost"), ctx(kitchen.id as string));
    expect(await res.json()).toMatchObject({ status: "ready", changed: true });
    const ready = rows(3).find((r) => r.spot === "kitchen")!;
    const folder = `${OUR}worlds/${kitchen.id}/`;
    expect(ready).toMatchObject({
      marble_world_id: "w-new",
      spz_url: `${folder}splat-web.spz`,
      spz_hq_url: `${folder}splat-hq.spz`,
      collider_mesh_url: `${folder}collider.glb`,
      pano_url: `${folder}pano.png`,
      thumbnail_url: `${folder}thumbnail.webp`,
      hq_mesh_url: null,
      metric_scale_factor: 1.3,
      ground_plane_offset: 0.5,
      caption: "A kitchen with a gas cooktop",
      cost_credits: 1600,
    });
    expect(
      [...state.fake.files.keys()].filter((k) => k.startsWith(`media/worlds/${kitchen.id}/`)),
    ).toHaveLength(5);
    expect(actions()).toEqual(["world.generating", "world.ready"]);
    expect(vi.mocked(logEvent).mock.calls[1][0].summary).toBe(
      "World v3 ready for Tbilisi flat: preview it and publish",
    );

    // 4. A late second poll changes nothing and calls World Labs no more.
    vi.mocked(getOperation).mockClear();
    vi.mocked(getWorld).mockClear();
    res = await status(new Request("http://localhost"), ctx(kitchen.id as string));
    expect(await res.json()).toMatchObject({ status: "ready", changed: false });
    expect(getOperation).not.toHaveBeenCalled();
    expect(getWorld).not.toHaveBeenCalled();

    // 5. Publish: v3 live, v2 archived, the entry spot stays the entrance.
    res = await publish(
      new Request("http://localhost", { method: "POST" }),
      ctx(kitchen.id as string),
    );
    expect(res.status).toBe(200);
    expect(rows(3).every((r) => r.status === "published")).toBe(true);
    expect(rows(2).every((r) => r.status === "archived")).toBe(true);
    const entry = rows(3).find((r) => r.spot === "entrance")!;
    expect(state.fake.tables.listings[0].published_world_id).toBe(entry.id);
    expect(actions()).toEqual(["world.generating", "world.ready", "world.published"]);
    expect(vi.mocked(logEvent).mock.calls[2][0]).toMatchObject({
      actor_type: "human",
      actor_name: "Giorgi (host)",
    });

    // 6. The versions panel shows both, newest first.
    res = await list(new Request(`http://localhost/api/worlds?listingId=${LISTING}`));
    const panel = (await res.json()) as { versions: Array<{ version: number; status: string }> };
    expect(panel.versions.map((v) => [v.version, v.status])).toEqual([
      [3, "published"],
      [2, "archived"],
    ]);
  });

  it("refuses to publish a version that is still generating", async () => {
    await start(json({ listingId: LISTING, captureIds: [CAPTURE] }));
    const kitchen = rows(3).find((r) => r.spot === "kitchen")!;
    const res = await publish(
      new Request("http://localhost", { method: "POST" }),
      ctx(kitchen.id as string),
    );
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe("not_ready");
    expect(rows(2).every((r) => r.status === "published")).toBe(true);
  });

  it("marks a failed generation failed and logs it once", async () => {
    await start(json({ listingId: LISTING, captureIds: [CAPTURE] }));
    const kitchen = rows(3).find((r) => r.spot === "kitchen")!;
    vi.mocked(getOperation).mockResolvedValue({
      operation_id: "op-1",
      done: true,
      error: { message: "Could not reconstruct the scene" },
    });
    await status(new Request("http://localhost"), ctx(kitchen.id as string));
    await status(new Request("http://localhost"), ctx(kitchen.id as string));
    expect(rows(3).find((r) => r.spot === "kitchen")).toMatchObject({
      status: "failed",
      error: "Could not reconstruct the scene",
    });
    expect(actions()).toEqual(["world.generating", "world.failed"]);
  });

  it("keeps generating when one poll fails (the generation goes on)", async () => {
    await start(json({ listingId: LISTING, captureIds: [CAPTURE] }));
    const kitchen = rows(3).find((r) => r.spot === "kitchen")!;
    vi.mocked(getOperation).mockRejectedValueOnce(
      new MarbleError(503, "World Labs request failed."),
    );
    const res = await status(new Request("http://localhost"), ctx(kitchen.id as string));
    expect(await res.json()).toMatchObject({
      status: "generating",
      pollError: "World Labs request failed.",
    });
  });

  it("marks the row failed, once, when a required asset is over the 50 MB limit", async () => {
    await start(json({ listingId: LISTING, captureIds: [CAPTURE] }));
    const kitchen = rows(3).find((r) => r.spot === "kitchen")!;
    vi.mocked(getOperation).mockResolvedValue({
      operation_id: "op-1",
      done: true,
      response: { ...newWorld, assets: null },
      cost: { total_credits: 1600, line_items: [] },
    });
    // The web splat (500k) is 51 MB; everything else is small.
    vi.mocked(fetch).mockImplementation(async (input) =>
      String(input).endsWith("s_500k.spz")
        ? new Response(new Uint8Array(51 * 1024 * 1024))
        : new Response(new Uint8Array(1234)),
    );
    const first = await status(new Request("http://localhost"), ctx(kitchen.id as string));
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ status: "failed", changed: true });
    const second = await status(new Request("http://localhost"), ctx(kitchen.id as string));
    expect(await second.json()).toMatchObject({ status: "failed", changed: false });
    const failed = rows(3).find((r) => r.spot === "kitchen")!;
    expect(failed.status).toBe("failed");
    expect(failed.error).toMatch(/splat-web\.spz is 51\.0 MB, over the 50 MB limit/);
    expect(actions()).toEqual(["world.generating", "world.failed"]);
  });

  it("marks the row failed when the CDN refuses an asset (404), not a 500 on every poll", async () => {
    await start(json({ listingId: LISTING, captureIds: [CAPTURE] }));
    const kitchen = rows(3).find((r) => r.spot === "kitchen")!;
    vi.mocked(getOperation).mockResolvedValue({
      operation_id: "op-1",
      done: true,
      response: { ...newWorld, assets: null },
    });
    vi.mocked(fetch).mockImplementation(async (input) =>
      String(input).endsWith("collider.glb")
        ? new Response("gone", { status: 404 })
        : new Response(new Uint8Array(1234)),
    );
    const res = await status(new Request("http://localhost"), ctx(kitchen.id as string));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "failed", changed: true });
    expect(actions()).toEqual(["world.generating", "world.failed"]);
  });

  it("keeps generating when an asset download fails for a moment (CDN 503, network)", async () => {
    await start(json({ listingId: LISTING, captureIds: [CAPTURE] }));
    const kitchen = rows(3).find((r) => r.spot === "kitchen")!;
    vi.mocked(getOperation).mockResolvedValue({
      operation_id: "op-1",
      done: true,
      response: { ...newWorld, assets: null },
    });
    vi.mocked(fetch).mockResolvedValueOnce(new Response("busy", { status: 503 }));
    let res = await status(new Request("http://localhost"), ctx(kitchen.id as string));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      status: "generating",
      pollError: expect.stringMatching(/HTTP 503/),
    });
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError("fetch failed"));
    res = await status(new Request("http://localhost"), ctx(kitchen.id as string));
    expect(await res.json()).toMatchObject({ status: "generating", pollError: expect.any(String) });
    // The next poll copies everything and the row is ready.
    res = await status(new Request("http://localhost"), ctx(kitchen.id as string));
    expect(await res.json()).toMatchObject({ status: "ready", changed: true });
    expect(actions()).toEqual(["world.generating", "world.ready"]);
  });

  it("marks the row failed when World Labs refuses to start (no credits)", async () => {
    vi.mocked(generateWorld).mockRejectedValue(
      new MarbleError(402, "Not enough World Labs API credits."),
    );
    const res = await start(json({ listingId: LISTING, captureIds: [CAPTURE] }));
    expect(((await res.json()) as { failed: unknown[] }).failed).toEqual([
      { spot: "kitchen", error: "Not enough World Labs API credits." },
    ]);
    expect(rows(3).find((r) => r.spot === "kitchen")).toMatchObject({ status: "failed" });
    expect(actions()).toEqual(["world.failed"]);
  });
});

describe("demo mode", () => {
  beforeEach(() => vi.stubEnv("DEMO_MODE", "true"));

  it("POST returns the saved version and calls nothing", async () => {
    const res = await start(json({ listingId: LISTING, captureIds: [CAPTURE] }));
    const body = (await res.json()) as { demo: boolean; version: number; worlds: unknown[] };
    expect(body).toMatchObject({ demo: true, version: 2 });
    expect(body.worlds).toHaveLength(5);
    expect(generateWorld).not.toHaveBeenCalled();
    expect(rows(3)).toHaveLength(0);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("status never polls World Labs, even for a generating row", async () => {
    state.fake.tables.worlds[1].status = "generating";
    state.fake.tables.worlds[1].operation_id = "op-x";
    const res = await status(
      new Request("http://localhost"),
      ctx(state.fake.tables.worlds[1].id as string),
    );
    expect(await res.json()).toMatchObject({ status: "generating", changed: false });
    expect(getOperation).not.toHaveBeenCalled();
    expect(getWorld).not.toHaveBeenCalled();
  });
});

describe("access and input", () => {
  it("only the home's host may start, poll or publish", async () => {
    state.viewer = { role: "guest", profileId: "nino", name: "Nino" };
    const id = state.fake.tables.worlds[0].id as string;
    expect((await start(json({ listingId: LISTING, captureIds: [CAPTURE] }))).status).toBe(403);
    expect((await status(new Request("http://localhost"), ctx(id))).status).toBe(403);
    expect((await publish(new Request("http://localhost"), ctx(id))).status).toBe(403);
    expect(generateWorld).not.toHaveBeenCalled();
  });

  it("rejects bad bodies and unknown captures before spending credits", async () => {
    expect((await start(json({ listingId: LISTING, captureIds: [] }))).status).toBe(400);
    expect((await start(json({ listingId: "nope", captureIds: [CAPTURE] }))).status).toBe(400);
    const other = "55555555-5555-4555-8555-555555555555";
    expect((await start(json({ listingId: LISTING, captureIds: [other] }))).status).toBe(404);
    expect(generateWorld).not.toHaveBeenCalled();
  });

  it("sends only the 8 ring photos, not the doorway photos", async () => {
    await start(json({ listingId: LISTING, captureIds: [CAPTURE] }));
    const prompt = vi.mocked(generateWorld).mock.calls[0][0].world_prompt;
    if (prompt.type !== "multi-image") throw new Error("expected multi-image");
    expect(prompt.multi_image_prompt.map((p) => p.content)).not.toContainEqual(
      expect.objectContaining({ uri: expect.stringContaining("ring/08.jpg") }),
    );
    expect(prompt.multi_image_prompt).toHaveLength(8);
  });

  it("waits for an upload to be confirmed", async () => {
    state.fake.tables.captures[0].status = "uploading";
    const res = await start(json({ listingId: LISTING, captureIds: [CAPTURE] }));
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe("capture_uploading");
    expect(rows(3)).toHaveLength(0);
  });

  it("sends a clip as a video prompt from a signed link", async () => {
    Object.assign(state.fake.tables.captures[0], {
      kind: "walkthrough",
      raw_url: `captures/${LISTING}/${CAPTURE}/raw.mp4`,
      duration_s: 24,
    });
    await start(json({ listingId: LISTING, captureIds: [CAPTURE] }));
    expect(vi.mocked(generateWorld).mock.calls[0][0].world_prompt).toMatchObject({
      type: "video",
      video_prompt: {
        source: "uri",
        uri: `https://fake.storage/sign/captures/${LISTING}/${CAPTURE}/raw.mp4?expires=21600`,
      },
    });
    expect(rows(3).find((r) => r.spot === "kitchen")).toMatchObject({ input_kind: "video" });
  });
});
