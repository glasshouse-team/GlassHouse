import { describe, expect, it } from "vitest";
import type { CheckinReport } from "@/lib/schemas/checkin";
import { CheckinRequestSchema } from "@/lib/schemas/checkin";
import {
  checkinFeedLine,
  checkinProblem,
  cleanReport,
  frameIds,
  needsIssue,
  pickListingPhotos,
  severitySummary,
} from "./checkin";

const nino = { role: "guest" as const, profileId: "nino" };

describe("checkinProblem", () => {
  const reservation = { guest_id: "nino", status: "confirmed" };

  it("lets only the guest of the reservation check in", () => {
    expect(checkinProblem(nino, reservation)).toBeNull();
    expect(checkinProblem({ role: "guest", profileId: "other" }, reservation)?.code).toBe(
      "not_your_trip",
    );
    expect(checkinProblem({ role: "host", profileId: "nino" }, reservation)?.status).toBe(403);
  });

  it("refuses a missing or cancelled reservation", () => {
    expect(checkinProblem(nino, null)?.status).toBe(404);
    expect(checkinProblem(nino, { ...reservation, status: "cancelled" })?.code).toBe("cancelled");
  });
});

describe("frameIds", () => {
  it("labels frames frame_01..", () => {
    expect(frameIds(3)).toEqual(["frame_01", "frame_02", "frame_03"]);
  });
});

describe("pickListingPhotos", () => {
  const p = (id: string, sort: number, room: string | null) => ({
    id,
    sort,
    room_label: room,
    url: `https://x.test/${id}.jpg`,
  });

  it("takes one photo per room first, then the rest, at most 8", () => {
    const photos = [
      p("k1", 1, "kitchen"),
      p("k2", 2, "kitchen"),
      p("b1", 3, "bedroom"),
      p("l1", 4, "Living room"),
      p("l2", 5, "living room"),
      ...Array.from({ length: 6 }, (_, i) => p(`x${i}`, 10 + i, "bathroom")),
    ];
    const picked = pickListingPhotos(photos);
    expect(picked).toHaveLength(8);
    expect(picked.slice(0, 4).map((x) => x.photo.id)).toEqual(["k1", "b1", "l1", "x0"]);
    expect(picked[4].photo.id).toBe("k2");
    expect(picked.map((x) => x.label)[7]).toBe("photo_08");
  });
});

describe("cleanReport", () => {
  const raw: CheckinReport = {
    matches: [
      { room: "Kitchen", item: "gas stove", evidence_frame: "FRAME_01 " },
      { room: "kitchen", item: "gas  stove", evidence_frame: "frame_02" },
      { room: "bedroom", item: "double bed", evidence_frame: "frame_09" },
    ],
    differences: [
      {
        room: "living room",
        listed: "armchair by the window",
        seen: "armchair moved to the wall",
        evidence_frame: "frame_02",
        listing_photo: "photo_07",
        severity: "low",
      },
      {
        room: "bedroom",
        listed: "two beds",
        seen: "one bed",
        evidence_frame: "frame_01",
        listing_photo: "PHOTO_01",
        severity: "high",
      },
      {
        room: "bathroom",
        listed: "bathtub",
        seen: "shower only",
        evidence_frame: "frame_12",
        listing_photo: "",
        severity: "medium",
      },
    ],
    missing_items: ["  desk ", "desk", ""],
  };

  it("drops findings citing frames that were not sent, dedupes and orders by severity", () => {
    const clean = cleanReport(raw, frameIds(2), ["photo_01", "photo_02"]);
    expect(clean.matches).toEqual([
      { room: "Kitchen", item: "gas stove", evidence_frame: "frame_01" },
    ]);
    expect(clean.differences.map((d) => d.seen)).toEqual(["one bed", "armchair moved to the wall"]);
    expect(clean.differences[0].listing_photo).toBe("photo_01");
    expect(clean.differences[1].listing_photo).toBe("");
    expect(clean.missing_items).toEqual(["desk"]);
  });

  it("summarises severity and the feed line", () => {
    const clean = cleanReport(raw, frameIds(2), ["photo_01"]);
    expect(severitySummary(clean)).toEqual({ high: 1, medium: 0, low: 1, total: 2 });
    expect(needsIssue(clean)).toBe(true);
    expect(checkinFeedLine("Nino", clean)).toBe(
      "Verifier compared Nino's arrival with the listing: 2 differences (1 high)",
    );
    const one = { ...clean, differences: clean.differences.slice(1) };
    expect(needsIssue(one)).toBe(false);
    expect(checkinFeedLine("Nino", one)).toBe(
      "Verifier compared Nino's arrival with the listing: 1 difference",
    );
    expect(checkinFeedLine("Nino", { ...clean, differences: [] })).toMatch(/no differences$/);
  });
});

describe("CheckinRequestSchema", () => {
  const id = "00000000-0000-4000-8000-0000000000c1";
  it("takes 1 to 8 JPEG data URLs", () => {
    const frame = "data:image/jpeg;base64,/9j/4AAQ";
    expect(CheckinRequestSchema.safeParse({ reservationId: id, frames: [frame] }).success).toBe(
      true,
    );
    expect(CheckinRequestSchema.safeParse({ reservationId: id, frames: [] }).success).toBe(false);
    expect(
      CheckinRequestSchema.safeParse({ reservationId: id, frames: Array(9).fill(frame) }).success,
    ).toBe(false);
    expect(
      CheckinRequestSchema.safeParse({
        reservationId: id,
        frames: ["data:image/png;base64,iVBOR"],
      }).success,
    ).toBe(false);
  });
});
