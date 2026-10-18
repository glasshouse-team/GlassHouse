import { beforeEach, describe, expect, it, vi } from "vitest";

// Every data module is mocked: nothing here touches Supabase.
const state = vi.hoisted(() => ({
  viewer: { role: "host", profileId: "", name: "Giorgi" },
  listing: null as unknown,
  capture: null as unknown,
  files: [] as string[],
  gapListing: null as string | null,
}));
vi.mock("@/lib/viewer", () => ({ getViewer: async () => state.viewer }));
vi.mock("@/lib/data/listings", () => ({ getListing: async () => state.listing }));
vi.mock("@/lib/events", () => ({ logEvent: vi.fn(async () => {}) }));
vi.mock("./store", () => ({
  insertCapture: vi.fn(async () => {}),
  getCapture: async () => state.capture,
  setCaptureStatus: vi.fn(async () => {}),
  listCaptureFiles: async () => state.files,
  gapListingId: async () => state.gapListing,
  signUploads: async (paths: string[]) =>
    paths.map((path) => ({
      bucket: "captures",
      path,
      signedUrl: `https://signed/${path}`,
      token: "t",
    })),
}));

import { logEvent } from "@/lib/events";
import { DEMO_PROFILES, HERO_LISTINGS } from "@/seed/fixtures";
import { PATCH } from "./[id]/route";
import { POST } from "./route";
import { insertCapture, setCaptureStatus } from "./store";

const hero = { id: HERO_LISTINGS.hero1.id, host_id: HERO_LISTINGS.hero1.hostId, title: "Hero" };
const CAPTURE_ID = "33333333-3333-4333-8333-333333333333";
const ring = {
  listingId: hero.id,
  kind: "ring",
  roomMarkers: [{ room: "Kitchen", t: 0 }],
  headingTrack: Array.from({ length: 8 }, (_, i) => ({ t: i * 3, heading: i * 45 })),
  qualityFlags: [],
  files: Array(8).fill({ contentType: "image/jpeg", sizeBytes: 1_000_000 }),
};
const clip = {
  listingId: hero.id,
  kind: "walkthrough",
  roomMarkers: [
    { room: "Entrance", t: 0 },
    { room: "Kitchen", t: 12.5 },
  ],
  headingTrack: [{ t: 0, heading: 10 }],
  qualityFlags: ["too_dark"],
  durationS: 29.5,
  file: { contentType: "video/webm", sizeBytes: 5_500_000 },
};

async function post(body: unknown) {
  const response = await POST(
    new Request("http://localhost/api/captures", { method: "POST", body: JSON.stringify(body) }),
  );
  return { status: response.status, json: (await response.json()) as Record<string, unknown> };
}

async function patch(status: string) {
  const response = await PATCH(
    new Request(`http://localhost/api/captures/${CAPTURE_ID}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),
    { params: Promise.resolve({ id: CAPTURE_ID }) },
  );
  return { status: response.status, json: (await response.json()) as Record<string, unknown> };
}

beforeEach(() => {
  state.viewer = { role: "host", profileId: DEMO_PROFILES.giorgi.id, name: "Giorgi" };
  state.listing = hero;
  state.capture = null;
  state.files = [];
  state.gapListing = null;
  vi.mocked(insertCapture).mockClear();
  vi.mocked(setCaptureStatus).mockClear();
  vi.mocked(logEvent).mockClear();
});

describe("POST /api/captures", () => {
  it("registers a ring with one signed upload per photo in the private bucket", async () => {
    const { status, json } = await post(ring);
    expect(status).toBe(201);
    const uploads = json.uploads as { bucket: string; path: string }[];
    expect(uploads).toHaveLength(8);
    expect(uploads.every((u) => u.bucket === "captures")).toBe(true);
    const row = vi.mocked(insertCapture).mock.calls[0]![0];
    expect(row).toMatchObject({
      id: json.captureId,
      kind: "ring",
      listing_id: hero.id,
      raw_url: `captures/${hero.id}/${json.captureId}/ring/`,
      size_bytes: 8_000_000,
      duration_s: null,
    });
    expect(row.heading_track).toHaveLength(8);
  });

  it("saves room markers and the heading track of a clip", async () => {
    const { status, json } = await post(clip);
    expect(status).toBe(201);
    const row = vi.mocked(insertCapture).mock.calls[0]![0];
    expect(row.room_markers).toEqual(clip.roomMarkers);
    expect(row.quality_flags).toEqual(["too_dark"]);
    expect(row.raw_url).toBe(`captures/${hero.id}/${json.captureId}/raw.webm`);
  });

  it("refuses guests, other hosts and unknown homes", async () => {
    state.viewer = { role: "guest", profileId: DEMO_PROFILES.nino.id, name: "Nino" };
    expect((await post(ring)).status).toBe(403);
    state.viewer = { role: "host", profileId: DEMO_PROFILES.ana.id, name: "Ana" };
    expect((await post(ring)).status).toBe(403);
    state.listing = null;
    expect((await post(ring)).status).toBe(404);
    expect(insertCapture).not.toHaveBeenCalled();
  });

  it("only attaches a fill-in to a gap of this listing", async () => {
    const fillIn = { ...clip, kind: "fill_in", gapId: "55555555-5555-4555-8555-555555555555" };
    expect((await post(fillIn)).status).toBe(404);
    state.gapListing = HERO_LISTINGS.hero2.id;
    const other = await post(fillIn);
    expect(other.status).toBe(403);
    expect(other.json.error).toBe("not_your_gap");
    expect(insertCapture).not.toHaveBeenCalled();
    state.gapListing = hero.id;
    expect((await post(fillIn)).status).toBe(201);
    expect(vi.mocked(insertCapture).mock.calls[0]![0].gap_id).toBe(fillIn.gapId);
  });

  it("rejects a 90 s clip (World Labs takes 30 s, D-015)", async () => {
    expect((await post({ ...clip, durationS: 90 })).status).toBe(400);
  });
});

describe("PATCH /api/captures/[id]", () => {
  const uploading = {
    id: CAPTURE_ID,
    listing_id: hero.id,
    kind: "ring",
    status: "uploading",
    raw_url: `captures/${hero.id}/${CAPTURE_ID}/ring/`,
    room_markers: [{ room: "Kitchen", t: 0 }],
    duration_s: null,
  };

  it("marks an upload done once the files are in storage and logs it", async () => {
    state.capture = uploading;
    state.files = Array.from({ length: 8 }, (_, i) => `0${i}.jpg`);
    const { status } = await patch("uploaded");
    expect(status).toBe(200);
    expect(setCaptureStatus).toHaveBeenCalledWith(CAPTURE_ID, "uploaded");
    expect(vi.mocked(logEvent).mock.calls[0]![0]).toMatchObject({
      actor_type: "human",
      action: "capture.uploaded",
      listing_id: hero.id,
      summary: "Giorgi uploaded an 8-photo ring of Kitchen",
    });
  });

  it("refuses 'uploaded' while the files are missing", async () => {
    state.capture = uploading;
    expect((await patch("uploaded")).status).toBe(409);
    expect(setCaptureStatus).not.toHaveBeenCalled();
  });

  it("checks the video file by name", async () => {
    state.capture = {
      ...uploading,
      kind: "walkthrough",
      raw_url: `captures/${hero.id}/${CAPTURE_ID}/raw.mp4`,
      duration_s: 28,
    };
    state.files = ["other.mp4"];
    expect((await patch("uploaded")).status).toBe(409);
    state.files = ["raw.mp4"];
    expect((await patch("uploaded")).status).toBe(200);
  });

  it("records a failure, refuses a second update and other hosts", async () => {
    state.capture = uploading;
    expect((await patch("failed")).status).toBe(200);
    expect(vi.mocked(logEvent).mock.calls[0]![0].action).toBe("capture.failed");
    state.capture = { ...uploading, status: "uploaded" };
    expect((await patch("failed")).status).toBe(409);
    state.capture = uploading;
    state.viewer = { role: "host", profileId: DEMO_PROFILES.ana.id, name: "Ana" };
    expect((await patch("uploaded")).status).toBe(403);
  });
});
