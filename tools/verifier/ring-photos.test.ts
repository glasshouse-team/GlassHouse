import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  angularDistance,
  loadRingFolder,
  matchRingFolder,
  photosFacing,
  ringOrder,
} from "./ring-photos";

const FOLDERS = ["bedroom", "entrance", "kitchen", "living room", "toilet"];

describe("matchRingFolder", () => {
  it("matches hero 2's spots to the capture folders", () => {
    expect(matchRingFolder("kitchen", "Kitchen", FOLDERS)).toBe("kitchen");
    expect(matchRingFolder("living", "Living room", FOLDERS)).toBe("living room");
    expect(matchRingFolder("bathroom", "Bathroom", FOLDERS)).toBe("toilet");
    expect(matchRingFolder("entrance", "Entrance hall", FOLDERS)).toBe("entrance");
    expect(matchRingFolder("bedroom", null, FOLDERS)).toBe("bedroom");
  });
  it("returns null when no folder fits", () => {
    expect(matchRingFolder("balcony", "Balcony", FOLDERS)).toBeNull();
  });
});

describe("angularDistance", () => {
  it("wraps around 360", () => {
    expect(angularDistance(350, 10)).toBe(20);
    expect(angularDistance(0, 180)).toBe(180);
    expect(angularDistance(270, 300)).toBe(30);
    expect(angularDistance(-45, 315)).toBe(0);
  });
});

describe("ringOrder", () => {
  it("sorts images by number, skips other files, keeps the first 8", () => {
    const files = [".DS_Store", "IMG_1020.HEIC", "IMG_1013.HEIC", "notes.txt"];
    for (let n = 1014; n <= 1019; n++) files.push(`IMG_${n}.HEIC`);
    files.push("IMG_1021.HEIC");
    const ring = ringOrder(files);
    expect(ring).toHaveLength(8);
    expect(ring[0]).toBe("IMG_1013.HEIC");
    expect(ring[7]).toBe("IMG_1020.HEIC");
    expect(ringOrder(["img10.jpg", "img9.jpg"])).toEqual(["img9.jpg", "img10.jpg"]);
  });
});

describe("photosFacing", () => {
  const ring = Array.from({ length: 8 }, (_, i) => ({ azimuth: i * 45 }));
  it("gives the view at 240 deg the photos at 225, 270 and 180 deg (nearest first)", () => {
    expect(photosFacing(ring, 240).map((p) => p.azimuth)).toEqual([225, 270, 180]);
  });
  it("gives the view at 300 deg the two skipped kitchen photos (270, 315) first", () => {
    expect(photosFacing(ring, 300).map((p) => p.azimuth)).toEqual([315, 270, 0]);
  });
  it("wraps around 0 and leaves out photos facing away", () => {
    expect(photosFacing(ring, 0).map((p) => p.azimuth)).toEqual([0, 45, 315]);
    expect(photosFacing(ring, 0, 8).map((p) => p.azimuth)).toEqual([0, 45, 315]);
    expect(photosFacing([{ azimuth: 180 }], 0)).toEqual([]);
  });
});

describe("loadRingFolder", () => {
  it("reads JPEGs in ring order with 45 deg azimuths and leaves the folder as it was", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "ring-test-"));
    try {
      const jpeg = await sharp({
        create: { width: 40, height: 30, channels: 3, background: "#808080" },
      })
        .jpeg()
        .toBuffer();
      for (const n of [3, 1, 2]) await writeFile(path.join(dir, `IMG_000${n}.jpg`), jpeg);
      await writeFile(path.join(dir, "readme.txt"), "x");
      const ring = await loadRingFolder(dir);
      expect(ring.map((p) => [p.name, p.azimuth])).toEqual([
        ["IMG_0001.jpg", 0],
        ["IMG_0002.jpg", 45],
        ["IMG_0003.jpg", 90],
      ]);
      expect((await sharp(ring[0].jpeg).metadata()).format).toBe("jpeg");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
