import { describe, expect, it } from "vitest";
import { CreateCaptureSchema, captureObjectPaths, rawUrlFor, uploadSummary } from "./schema";

const L = "11111111-1111-4111-8111-111111111111";
const C = "22222222-2222-4222-8222-222222222222";
const photo = { contentType: "image/jpeg" as const, sizeBytes: 900_000 };

describe("CreateCaptureSchema", () => {
  const base = {
    listingId: L,
    roomMarkers: [{ room: "Kitchen", t: 0 }],
    headingTrack: [],
    qualityFlags: [],
  };

  it("accepts a 30 s walkthrough and an 8-photo ring", () => {
    expect(
      CreateCaptureSchema.safeParse({
        ...base,
        kind: "walkthrough",
        durationS: 30,
        file: { contentType: "video/webm", sizeBytes: 5_000_000 },
      }).success,
    ).toBe(true);
    expect(
      CreateCaptureSchema.safeParse({ ...base, kind: "ring", files: Array(8).fill(photo) }).success,
    ).toBe(true);
  });

  it("refuses clips over World Labs' 30 s limit and rings with fewer than 8 photos", () => {
    expect(
      CreateCaptureSchema.safeParse({
        ...base,
        kind: "walkthrough",
        durationS: 95,
        file: { contentType: "video/mp4", sizeBytes: 5_000_000 },
      }).success,
    ).toBe(false);
    expect(
      CreateCaptureSchema.safeParse({ ...base, kind: "ring", files: Array(7).fill(photo) }).success,
    ).toBe(false);
    expect(
      CreateCaptureSchema.safeParse({ ...base, kind: "ring", files: Array(13).fill(photo) })
        .success,
    ).toBe(false);
  });

  it("refuses other file types, oversize files and check-ins (GH-23 has its own route)", () => {
    for (const bad of [
      {
        kind: "walkthrough",
        durationS: 10,
        file: { contentType: "video/quicktime", sizeBytes: 1 },
      },
      { kind: "walkthrough", durationS: 10, file: { contentType: "video/mp4", sizeBytes: 60e6 } },
      { kind: "checkin", durationS: 10, file: { contentType: "video/mp4", sizeBytes: 1 } },
    ])
      expect(CreateCaptureSchema.safeParse({ ...base, ...bad }).success).toBe(false);
  });

  it("refuses headings outside 0..360 and blank room names", () => {
    expect(
      CreateCaptureSchema.safeParse({
        ...base,
        kind: "ring",
        files: Array(8).fill(photo),
        headingTrack: [{ t: 0, heading: 400 }],
      }).success,
    ).toBe(false);
    expect(
      CreateCaptureSchema.safeParse({
        ...base,
        kind: "ring",
        files: Array(8).fill(photo),
        roomMarkers: [{ room: "  ", t: 0 }],
      }).success,
    ).toBe(false);
  });
});

describe("captureObjectPaths", () => {
  it("names one raw video by its type", () => {
    expect(
      captureObjectPaths(L, C, { kind: "walkthrough", file: { contentType: "video/webm" } }),
    ).toEqual([`${L}/${C}/raw.webm`]);
    expect(
      captureObjectPaths(L, C, { kind: "fill_in", file: { contentType: "video/mp4" } }),
    ).toEqual([`${L}/${C}/raw.mp4`]);
  });

  it("numbers ring photos in upload order", () => {
    const paths = captureObjectPaths(L, C, { kind: "ring", files: Array(9).fill(photo) });
    expect(paths).toHaveLength(9);
    expect(paths[0]).toBe(`${L}/${C}/ring/00.jpg`);
    expect(paths[8]).toBe(`${L}/${C}/ring/08.jpg`);
  });
});

describe("rawUrlFor", () => {
  it("stores the bucket plus the file or folder", () => {
    expect(rawUrlFor("walkthrough", [`${L}/${C}/raw.mp4`])).toBe(`captures/${L}/${C}/raw.mp4`);
    expect(rawUrlFor("ring", [`${L}/${C}/ring/00.jpg`])).toBe(`captures/${L}/${C}/ring/`);
  });
});

describe("uploadSummary", () => {
  it("reads like a feed line", () => {
    expect(uploadSummary("Giorgi", "ring", ["Kitchen"], 8, null)).toBe(
      "Giorgi uploaded an 8-photo ring of Kitchen",
    );
    expect(uploadSummary("Giorgi", "walkthrough", ["Entrance", "Kitchen"], 1, 28.4)).toBe(
      "Giorgi uploaded a walkthrough clip (28 s) of Entrance, Kitchen",
    );
    expect(uploadSummary("Giorgi", "fill_in", [], 1, null)).toBe("Giorgi uploaded a fill-in clip");
  });
});
