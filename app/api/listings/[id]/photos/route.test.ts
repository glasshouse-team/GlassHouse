import { beforeEach, describe, expect, it, vi } from "vitest";

// The data layer and feed are mocked: nothing here touches Supabase or Storage.
const state = vi.hoisted(() => ({
  viewer: { role: "host", profileId: "", name: "Giorgi" },
  listing: null as Record<string, unknown> | null,
}));
vi.mock("@/lib/viewer", () => ({ getViewer: async () => state.viewer }));
vi.mock("@/lib/data/listings", () => ({
  getListingById: async () => state.listing,
  addListingPhotos: vi.fn(async (_id: string, images: Buffer[]) => images.length),
  TooManyPhotosError: class TooManyPhotosError extends Error {},
}));
vi.mock("@/lib/events", () => ({ logEvent: vi.fn(async () => {}) }));

import { addListingPhotos } from "@/lib/data/listings";
import { logEvent } from "@/lib/events";
import { DEMO_PROFILES } from "@/seed/fixtures";
import { POST } from "./route";

const ID = "33333333-3333-4333-8333-333333333333";
const photo = (type = "image/jpeg") =>
  new File([new Uint8Array([255, 216, 255])], "p.jpg", { type });

async function post(files: File[], room?: string) {
  const form = new FormData();
  for (const f of files) form.append("photos", f);
  if (room) form.append("room", room);
  const response = await POST(
    new Request(`http://localhost/api/listings/${ID}/photos`, { method: "POST", body: form }),
    { params: Promise.resolve({ id: ID }) },
  );
  return { status: response.status, json: (await response.json()) as Record<string, unknown> };
}

beforeEach(() => {
  state.viewer = { role: "host", profileId: DEMO_PROFILES.giorgi.id, name: "Giorgi" };
  state.listing = { id: ID, title: "Sunny flat", host_id: DEMO_PROFILES.giorgi.id };
  vi.mocked(addListingPhotos).mockClear();
  vi.mocked(logEvent).mockClear();
});

describe("POST /api/listings/[id]/photos", () => {
  it("adds the host's photos with the room and says so in the feed", async () => {
    expect(await post([photo(), photo()], "Kitchen")).toEqual({ status: 201, json: { added: 2 } });
    expect(vi.mocked(addListingPhotos).mock.calls[0][2]).toBe("Kitchen");
    expect(vi.mocked(logEvent).mock.calls[0][0]).toMatchObject({
      action: "listing.photos_added",
      listing_id: ID,
      summary: "Giorgi added 2 photos of the kitchen to Sunny flat",
    });
  });

  it("refuses guests, other hosts, non-images and empty or oversized batches", async () => {
    state.viewer = { role: "guest", profileId: DEMO_PROFILES.nino.id, name: "Nino" };
    expect((await post([photo()])).status).toBe(403);
    state.viewer = { role: "host", profileId: DEMO_PROFILES.ana.id, name: "Ana" };
    expect((await post([photo()])).json.error).toBe("not_your_listing");
    state.viewer = { role: "host", profileId: DEMO_PROFILES.giorgi.id, name: "Giorgi" };
    expect((await post([photo("video/mp4")])).status).toBe(400);
    expect((await post([])).status).toBe(400);
    expect((await post(Array.from({ length: 7 }, () => photo()))).status).toBe(400);
    expect(addListingPhotos).not.toHaveBeenCalled();
  });
});
