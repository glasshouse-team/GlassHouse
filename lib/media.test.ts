import { describe, expect, it } from "vitest";
import { concatFileList, parseDurationSec, prepareVideoArgs, targetVideoKbps } from "./media";

describe("targetVideoKbps", () => {
  it("keeps an 80 s walkthrough under 19 MB", () => {
    const kbps = targetVideoKbps(80);
    const bytes = (kbps * 1000 * 80) / 8;
    expect(bytes).toBeLessThan(19 * 1024 * 1024);
    expect(kbps).toBeGreaterThan(1500);
  });

  it("clamps to 600..4000 kbit/s", () => {
    expect(targetVideoKbps(5)).toBe(4000);
    expect(targetVideoKbps(3600)).toBe(600);
  });
});

describe("prepareVideoArgs", () => {
  it("builds a 720p, no-audio H.264 command", () => {
    const args = prepareVideoArgs({ input: "in.mov", output: "out.mp4", durationSec: 80 });
    expect(args).toContain("-an");
    expect(args).toContain("libx264");
    expect(args[args.indexOf("-vf") + 1]).toBe("scale=-2:720,fps=30");
    expect(args.at(-1)).toBe("out.mp4");
  });
});

describe("parseDurationSec", () => {
  it("reads ffmpeg's duration line", () => {
    expect(
      parseDurationSec("  Duration: 00:01:23.45, start: 0.000000, bitrate: 9000 kb/s"),
    ).toBeCloseTo(83.45);
    expect(parseDurationSec("no duration here")).toBeNull();
  });
});

describe("concatFileList", () => {
  it("quotes paths for ffmpeg's concat demuxer", () => {
    expect(concatFileList(["/a/b.mp4", "/c/it's.mp4"])).toBe(
      "file '/a/b.mp4'\nfile '/c/it'\\''s.mp4'\n",
    );
  });
});
