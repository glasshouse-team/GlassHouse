import { MockLanguageModelV4 } from "ai/test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CheckinReport } from "@/lib/schemas/checkin";

// Every data module and the model are mocked: nothing here touches Supabase or Claude.
const state = vi.hoisted(() => ({
  viewer: { role: "guest", profileId: "", name: "Nino" },
  reservation: null as unknown,
  listing: null as unknown,
  photos: [] as unknown[],
  answer: "{}",
  model: null as unknown,
}));
vi.mock("@/lib/viewer", () => ({ getViewer: async () => state.viewer }));
vi.mock("@/lib/data/checkins", () => ({
  getReservation: async () => state.reservation,
  getListingFacts: async () => [{ key: "beds_counted", value: 1, evidence: ["p1"] }],
  createCheckin: vi.fn(async () => "checkin-1"),
  finishCheckin: vi.fn(async () => {}),
}));
vi.mock("@/lib/data/listings", () => ({
  getListing: async () => state.listing,
  getListingPhotos: async () => state.photos,
}));
vi.mock("@/lib/events", () => ({ logEvent: vi.fn(async () => {}) }));
vi.mock("@/lib/claude", () => ({ agentModel: () => state.model }));
vi.mock("@/tools/verifier/xray", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/tools/verifier/xray")>()),
  prepareImage: vi.fn(async () => Buffer.from([0xff, 0xd8, 0xff, 0xe0])),
}));

import { createCheckin, finishCheckin } from "@/lib/data/checkins";
import { logEvent } from "@/lib/events";
import { DEMO_PROFILES, HERO_LISTINGS } from "@/seed/fixtures";
import { POST } from "./route";

const RESERVATION_ID = "00000000-0000-4000-8000-0000000000c1";
const JPEG = `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2]).toString("base64")}`;

const usage = {
  inputTokens: { total: 900, noCache: 900, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 80, text: 80, reasoning: undefined },
};
const answer: CheckinReport = {
  matches: [{ room: "bedroom", item: "double bed", evidence_frame: "frame_01" }],
  differences: [
    {
      room: "living room",
      listed: "lamp beside the sofa",
      seen: "lamp moved to the desk",
      evidence_frame: "frame_02",
      listing_photo: "photo_02",
      severity: "low",
    },
    {
      room: "kitchen",
      listed: "kettle",
      seen: "no kettle",
      evidence_frame: "frame_07",
      listing_photo: "",
      severity: "medium",
    },
  ],
  missing_items: [],
};

function mockModel(text: string) {
  return new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: "text" as const, text }],
      finishReason: { unified: "stop" as const, raw: undefined },
      usage,
      warnings: [],
    }),
  });
}

async function post(body: unknown) {
  const response = await POST(
    new Request("http://localhost/api/checkin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  return { status: response.status, json: (await response.json()) as Record<string, unknown> };
}

beforeEach(() => {
  vi.clearAllMocks();
  state.viewer = { role: "guest", profileId: DEMO_PROFILES.nino.id, name: "Nino" };
  state.reservation = {
    id: RESERVATION_ID,
    listing_id: HERO_LISTINGS.hero2.id,
    guest_id: DEMO_PROFILES.nino.id,
    status: "confirmed",
  };
  state.listing = {
    id: HERO_LISTINGS.hero2.id,
    host_id: DEMO_PROFILES.ana.id,
    title: "Tbilisi flat",
    amenities: ["wifi"],
    property_type: "apartment",
    max_guests: 2,
    bedrooms: 1,
    beds: 1,
    baths: 1,
  };
  state.photos = [
    { id: "p1", url: "https://x.test/1.jpg", room_label: "bedroom", sort: 1 },
    { id: "p2", url: "https://x.test/2.jpg", room_label: "living room", sort: 2 },
  ];
  state.model = mockModel(JSON.stringify(answer));
});

describe("POST /api/checkin", () => {
  it("compares the frames, saves the cleaned report and tells the host in the feed", async () => {
    const { status, json } = await post({ reservationId: RESERVATION_ID, frames: [JPEG, JPEG] });
    expect(status).toBe(201);
    const report = json.report as Record<string, unknown> & CheckinReport;
    // frame_07 was never sent: that finding is dropped.
    expect(report.differences.map((d) => d.seen)).toEqual(["lamp moved to the desk"]);
    expect(report.frame_ids).toEqual(["frame_01", "frame_02"]);
    expect(report.photo_ids).toEqual({ photo_01: "p1", photo_02: "p2" });

    expect(createCheckin).toHaveBeenCalledWith(RESERVATION_ID);
    expect(finishCheckin).toHaveBeenCalledWith(
      "checkin-1",
      expect.objectContaining({ status: "ready" }),
    );
    expect(logEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        actor_name: "Verifier",
        agent: "verifier",
        action: "checkin.verified",
        summary: "Verifier compared Nino's arrival with the listing: 1 difference",
        listing_id: HERO_LISTINGS.hero2.id,
        payload: expect.objectContaining({ notify: "host", hostId: DEMO_PROFILES.ana.id }),
      }),
    );

    // The model saw labelled listing photos, then labelled frames, and no image as a URL.
    const call = (state.model as MockLanguageModelV4).doGenerateCalls[0];
    const user = call.prompt.find((m) => m.role === "user");
    const texts = (user?.role === "user" ? user.content : [])
      .filter((p) => p.type === "text")
      .map((p) => (p as { text: string }).text);
    expect(texts).toEqual(
      expect.arrayContaining([
        "photo_01 (bedroom):",
        "photo_02 (living room):",
        "frame_01:",
        "frame_02:",
      ]),
    );
    expect(texts[0]).toContain('<data name="listing">');
  });

  it("refuses anyone but the guest of the reservation", async () => {
    state.viewer = { role: "guest", profileId: "someone-else", name: "Sam" };
    expect((await post({ reservationId: RESERVATION_ID, frames: [JPEG] })).status).toBe(403);
    state.viewer = { role: "host", profileId: DEMO_PROFILES.ana.id, name: "Ana" };
    expect((await post({ reservationId: RESERVATION_ID, frames: [JPEG] })).status).toBe(403);
    state.reservation = null;
    state.viewer = { role: "guest", profileId: DEMO_PROFILES.nino.id, name: "Nino" };
    expect((await post({ reservationId: RESERVATION_ID, frames: [JPEG] })).status).toBe(404);
    expect(createCheckin).not.toHaveBeenCalled();
  });

  it("rejects bodies that are not JPEG frames", async () => {
    expect((await post({ reservationId: RESERVATION_ID, frames: [] })).status).toBe(400);
    const png = `data:image/jpeg;base64,${Buffer.from("PNGDATA").toString("base64")}`;
    expect((await post({ reservationId: RESERVATION_ID, frames: [png] })).json.error).toBe(
      "invalid_frame",
    );
  });

  it("marks the check-in failed and logs it when the model fails", async () => {
    state.model = new MockLanguageModelV4({
      doGenerate: async () => {
        throw new Error("overloaded");
      },
    });
    const { status } = await post({ reservationId: RESERVATION_ID, frames: [JPEG] });
    expect(status).toBe(500);
    expect(finishCheckin).toHaveBeenCalledWith("checkin-1", { status: "failed" });
    expect(logEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "checkin.verified.failed" }),
    );
  });
});
