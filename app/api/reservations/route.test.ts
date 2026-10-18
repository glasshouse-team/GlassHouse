import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// Every data module is mocked: nothing here touches Supabase.
const state = vi.hoisted(() => ({
  viewer: { role: "guest", profileId: "", name: "Nino" },
  listing: null as unknown,
  blockedDates: [] as string[],
  overrides: [] as { date: string; price_override_cents: number | null }[],
  overlap: false,
}));
vi.mock("@/lib/viewer", () => ({ getViewer: async () => state.viewer }));
vi.mock("@/lib/data/listings", () => ({
  getListing: async () => state.listing,
  getAvailability: async () => ({ blockedDates: state.blockedDates, overrides: state.overrides }),
}));
vi.mock("@/lib/data/reservations", () => ({
  hasOverlappingReservation: async () => state.overlap,
  createReservation: vi.fn(async () => "reservation-1"),
  DatesTakenError: class DatesTakenError extends Error {},
}));
vi.mock("@/lib/events", () => ({ logEvent: vi.fn(async () => {}) }));

import { createReservation } from "@/lib/data/reservations";
import { logEvent } from "@/lib/events";
import { DEMO_DEAL, DEMO_PROFILES, HERO_1_PRICING, HERO_LISTINGS } from "@/seed/fixtures";
import { POST } from "./route";

const hero = {
  id: HERO_LISTINGS.hero1.id,
  host_id: HERO_LISTINGS.hero1.hostId,
  title: "Stone house with a fireplace",
  max_guests: 4,
  ...HERO_1_PRICING,
};
const stay = {
  listingId: hero.id,
  checkIn: DEMO_DEAL.checkIn,
  checkOut: DEMO_DEAL.checkOut,
  guests: DEMO_DEAL.guests,
};

async function post(body: unknown) {
  const response = await POST(
    new Request("http://localhost/api/reservations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  const json = (await response.json()) as { error?: string };
  return { status: response.status, error: json.error };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-18T12:00:00Z"));
  state.viewer = { role: "guest", profileId: DEMO_PROFILES.nino.id, name: "Nino" };
  state.listing = hero;
  state.blockedDates = [];
  state.overrides = [];
  state.overlap = false;
  vi.mocked(createReservation).mockClear();
  vi.mocked(logEvent).mockClear();
});
afterAll(() => vi.useRealTimers());

describe("POST /api/reservations", () => {
  it("books the demo stay at the server's $572, whatever price the client sends", async () => {
    expect(await post({ ...stay, totalCents: 1, discountCents: 99_999 })).toEqual({
      status: 201,
      error: undefined,
    });
    expect(vi.mocked(createReservation).mock.calls[0][0]).toMatchObject({
      listing_id: hero.id,
      guest_id: DEMO_PROFILES.nino.id,
      nightly_total_cents: 48_000,
      cleaning_cents: 4_000,
      discount_cents: 0,
      service_fee_cents: 5_200,
      total_cents: 57_200,
      status: "confirmed",
    });
    expect(vi.mocked(logEvent).mock.calls[0][0]).toMatchObject({
      actor_type: "human",
      action: "reservation.created",
      listing_id: hero.id,
      summary: "Nino booked Stone house with a fireplace, Nov 9 to Nov 13, $572",
    });
  });

  it("prices per-night overrides on the server", async () => {
    state.overrides = [{ date: "2026-11-10", price_override_cents: 20_000 }];
    expect((await post(stay)).status).toBe(201);
    expect(vi.mocked(createReservation).mock.calls[0][0]).toMatchObject({
      nightly_total_cents: 56_000,
      total_cents: 66_000,
    });
  });

  it("refuses hosts, past, blocked and booked dates, too many guests, unknown homes and bad bodies", async () => {
    state.viewer = { role: "host", profileId: DEMO_PROFILES.giorgi.id, name: "Giorgi" };
    expect(await post(stay)).toEqual({ status: 403, error: "guests_only" });
    state.viewer = { role: "guest", profileId: DEMO_PROFILES.nino.id, name: "Nino" };

    const past = { ...stay, checkIn: "2026-10-05", checkOut: "2026-10-09" };
    expect(await post(past)).toEqual({ status: 400, error: "cannot_book" });
    expect(await post({ ...stay, guests: 5 })).toEqual({ status: 400, error: "cannot_book" });
    state.blockedDates = ["2026-11-11"];
    expect(await post(stay)).toEqual({ status: 400, error: "cannot_book" });
    state.blockedDates = [];
    state.overlap = true;
    expect(await post(stay)).toEqual({ status: 409, error: "already_booked" });
    state.overlap = false;
    state.listing = null;
    expect(await post(stay)).toEqual({ status: 404, error: "not_found" });
    state.listing = hero;

    expect((await post({ ...stay, listingId: "hero-1" })).status).toBe(400);
    expect((await post({ ...stay, guests: 1.5 })).status).toBe(400);
    expect((await post({ ...stay, checkOut: stay.checkIn })).status).toBe(400);
    expect(createReservation).not.toHaveBeenCalled();
    expect(logEvent).not.toHaveBeenCalled();
  });
});
