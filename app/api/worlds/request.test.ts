import { describe, expect, it } from "vitest";
import { GenerateWorldSchema, checkCaptures, generationRequestSummary } from "./request";

const L = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const A = "33333333-3333-4333-8333-333333333333";
const B = "44444444-4444-4444-8444-444444444444";
const row = (id: string, room_markers: unknown, patch: object = {}) => ({
  id,
  listing_id: L,
  status: "uploaded",
  kind: "ring",
  room_markers,
  ...patch,
});

describe("GenerateWorldSchema", () => {
  it("needs a listing and at least one capture id", () => {
    expect(GenerateWorldSchema.safeParse({ listingId: L, captureIds: [A] }).success).toBe(true);
    expect(GenerateWorldSchema.safeParse({ listingId: L, captureIds: [] }).success).toBe(false);
    expect(GenerateWorldSchema.safeParse({ listingId: L, captureIds: ["x"] }).success).toBe(false);
  });
});

describe("checkCaptures", () => {
  it("returns the rooms in first-seen order, once each", () => {
    const rows = [
      row(A, [{ room: "Entrance", t: 0 }]),
      row(B, [
        { room: "Entrance", t: 0 },
        { room: "Kitchen", t: 9 },
      ]),
    ];
    expect(checkCaptures(L, [A, B, A], rows)).toEqual({ ok: true, rooms: ["Entrance", "Kitchen"] });
  });

  it("refuses a missing capture or one of another listing", () => {
    expect(checkCaptures(L, [A, B], [row(A, [])])).toMatchObject({ ok: false, status: 404 });
    expect(checkCaptures(L, [A], [row(A, [], { listing_id: OTHER })])).toMatchObject({
      ok: false,
      status: 404,
    });
  });

  it("refuses a capture that is still uploading or failed", () => {
    for (const status of ["uploading", "failed"])
      expect(checkCaptures(L, [A], [row(A, [], { status })])).toMatchObject({
        ok: false,
        status: 409,
        code: "capture_not_uploaded",
      });
  });

  it("ignores malformed room markers", () => {
    expect(checkCaptures(L, [A], [row(A, "junk")])).toEqual({ ok: true, rooms: [] });
  });
});

describe("generationRequestSummary", () => {
  it("names the count and up to three rooms", () => {
    expect(generationRequestSummary("Giorgi", 1, ["Kitchen"])).toBe(
      "Giorgi asked for a new 3D home from 1 capture (Kitchen)",
    );
    expect(generationRequestSummary("Giorgi", 4, ["A", "B", "C", "D"])).toBe(
      "Giorgi asked for a new 3D home from 4 captures (A, B, C…)",
    );
    expect(generationRequestSummary("Giorgi", 2, [])).toBe(
      "Giorgi asked for a new 3D home from 2 captures",
    );
  });
});
