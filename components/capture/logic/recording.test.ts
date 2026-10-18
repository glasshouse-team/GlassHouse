import { describe, expect, it } from "vitest";
import { VIDEO_MAX_SECONDS } from "@/lib/media";
import {
  CLIP_MAX_SECONDS,
  VIDEO_BITS_PER_SECOND,
  baseMimeType,
  defaultRooms,
  extensionFor,
  formatClock,
  pickMimeType,
} from "./recording";

describe("pickMimeType", () => {
  it("prefers mp4/H.264 (Safari)", () => {
    const safari = new Set(["video/mp4", "video/mp4;codecs=avc1"]);
    expect(pickMimeType((t) => safari.has(t))).toBe("video/mp4;codecs=avc1");
  });

  it("falls back to webm vp9 (Chrome on Android)", () => {
    const chrome = new Set(["video/webm", "video/webm;codecs=vp8", "video/webm;codecs=vp9"]);
    expect(pickMimeType((t) => chrome.has(t))).toBe("video/webm;codecs=vp9");
  });

  it("returns null when nothing records, and survives throwing checks", () => {
    expect(pickMimeType(() => false)).toBeNull();
    expect(
      pickMimeType((t) => {
        if (t.includes("avc1")) throw new Error("unknown codec");
        return t === "video/mp4";
      }),
    ).toBe("video/mp4");
  });
});

describe("mime helpers", () => {
  it("maps recorder types to stored types and extensions", () => {
    expect(baseMimeType("video/mp4;codecs=avc1")).toBe("video/mp4");
    expect(baseMimeType("video/webm;codecs=vp9")).toBe("video/webm");
    expect(extensionFor("video/webm")).toBe("webm");
    expect(extensionFor("video/quicktime")).toBe("mp4");
  });
});

describe("clip limits", () => {
  it("matches World Labs' 30 s limit in lib/media.ts (D-015)", () => {
    expect(CLIP_MAX_SECONDS).toBe(VIDEO_MAX_SECONDS);
  });

  it("keeps a full clip under 20 MB", () => {
    expect((VIDEO_BITS_PER_SECOND / 8) * CLIP_MAX_SECONDS).toBeLessThan(20 * 1024 * 1024);
  });
});

describe("defaultRooms", () => {
  it("pre-fills from bedrooms and baths", () => {
    expect(defaultRooms(1, 1)).toEqual(["Entrance", "Living room", "Kitchen", "Bedroom", "Bathroom"]);
    expect(defaultRooms(2, 1.5)).toEqual([
      "Entrance",
      "Living room",
      "Kitchen",
      "Bedroom 1",
      "Bedroom 2",
      "Bathroom 1",
      "Bathroom 2",
    ]);
  });

  it("always has a bathroom, never negative rooms", () => {
    expect(defaultRooms(0, 0)).toEqual(["Entrance", "Living room", "Kitchen", "Bathroom"]);
    expect(defaultRooms(-1, -1)).toHaveLength(4);
  });
});

describe("formatClock", () => {
  it("formats seconds", () => {
    expect(formatClock(7.9)).toBe("0:07");
    expect(formatClock(65)).toBe("1:05");
    expect(formatClock(-3)).toBe("0:00");
  });
});
