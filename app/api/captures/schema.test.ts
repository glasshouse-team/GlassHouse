import { describe, expect, it } from "vitest";
import {
  CreateCaptureSchema,
  captureObjectPaths,
  checkUpload,
  rawUrlFor,
  requiredStatus,
  ringPhotoName,
  uploadSummary,
} from "./schema";

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
  /** A ring of `photos` photos with `headings` compass samples. */
  const ringOf = (photos: number, headings: number) => ({
    ...base,
    kind: "ring",
    files: Array(photos).fill(photo),
    headingTrack: Array.from({ length: headings }, (_, i) => ({ t: i, heading: (i * 45) % 360 })),
  });

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
    ).toBe(false); // no headings and no "no_compass" flag
    expect(CreateCaptureSchema.safeParse(ringOf(8, 8)).success).toBe(true);
    expect(CreateCaptureSchema.safeParse(ringOf(10, 10)).success).toBe(true);
  });

  it("needs one heading per ring photo, or none with the no_compass flag", () => {
    expect(CreateCaptureSchema.safeParse(ringOf(8, 7)).success).toBe(false);
    expect(CreateCaptureSchema.safeParse(ringOf(9, 8)).success).toBe(false);
    const parsed = CreateCaptureSchema.safeParse(ringOf(8, 3));
    expect(parsed.error?.issues[0]?.path).toEqual(["headingTrack"]);
    expect(CreateCaptureSchema.safeParse({ ...ringOf(8, 0), qualityFlags: [] }).success).toBe(
      false,
    );
    expect(
      CreateCaptureSchema.safeParse({ ...ringOf(8, 0), qualityFlags: ["no_compass"] }).success,
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
        file: { contentType: "video/x-msvideo", sizeBytes: 1 },
      },
      { kind: "walkthrough", durationS: 10, file: { contentType: "video/mp4", sizeBytes: 60e6 } },
      { kind: "checkin", durationS: 10, file: { contentType: "video/mp4", sizeBytes: 1 } },
    ])
      expect(CreateCaptureSchema.safeParse({ ...base, ...bad }).success).toBe(false);
  });

  it("refuses headings outside 0..360 and blank room names", () => {
    const ring = ringOf(8, 8);
    expect(
      CreateCaptureSchema.safeParse({
        ...ring,
        headingTrack: ring.headingTrack.map((h, i) => (i === 3 ? { ...h, heading: 400 } : h)),
      }).success,
    ).toBe(false);
    expect(
      CreateCaptureSchema.safeParse({ ...ring, roomMarkers: [{ room: "  ", t: 0 }] }).success,
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
    expect(
      captureObjectPaths(L, C, { kind: "walkthrough", file: { contentType: "video/quicktime" } }),
    ).toEqual([`${L}/${C}/raw.mov`]);
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

describe("checkUpload", () => {
  const ringRow = { kind: "ring", path: `${L}/${C}/ring/`, headingCount: 8, sizeBytes: 8_000 };
  const jpgs = (n: number, size: number | null = 1_000) =>
    Array.from({ length: n }, (_, i) => ({ name: ringPhotoName(i), size }));

  it("expects one ring photo per heading", () => {
    expect(checkUpload(ringRow, jpgs(8))).toEqual({ complete: true, fileCount: 8, missing: [] });
    const partial = checkUpload(ringRow, jpgs(3));
    expect(partial.complete).toBe(false);
    expect(partial.missing).toEqual(["03.jpg", "04.jpg", "05.jpg", "06.jpg", "07.jpg"]);
    const nine = { ...ringRow, headingCount: 9, sizeBytes: 9_000 };
    expect(checkUpload(nine, jpgs(8)).missing).toEqual(["08.jpg"]);
  });

  it("checks a compass-off ring by its 8 photos and its bytes", () => {
    const row = { ...ringRow, headingCount: 0, sizeBytes: 10_000 };
    expect(checkUpload(row, jpgs(8)).complete).toBe(false); // two doorway photos missing
    expect(checkUpload(row, jpgs(10)).complete).toBe(true);
    expect(checkUpload(row, jpgs(10, null)).complete).toBe(true); // sizes unknown: names only
  });

  it("ignores other files and checks the video by name and size", () => {
    expect(checkUpload(ringRow, [...jpgs(8), { name: "notes.txt", size: 5 }]).complete).toBe(true);
    const video = {
      kind: "walkthrough",
      path: `${L}/${C}/raw.mp4`,
      headingCount: 1,
      sizeBytes: 50,
    };
    expect(checkUpload(video, [{ name: "raw.mp4", size: 50 }]).complete).toBe(true);
    expect(checkUpload(video, [{ name: "raw.mp4", size: 20 }]).complete).toBe(false);
    expect(checkUpload(video, [{ name: "raw.webm", size: 50 }]).missing).toEqual(["raw.mp4"]);
  });
});

describe("requiredStatus", () => {
  it("finishes an uploading row and reopens only a failed one", () => {
    expect(requiredStatus("uploaded")).toBe("uploading");
    expect(requiredStatus("failed")).toBe("uploading");
    expect(requiredStatus("uploading")).toBe("failed");
  });
});
