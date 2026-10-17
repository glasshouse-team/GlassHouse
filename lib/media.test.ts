import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  concatFileList,
  ffmpegPath,
  parseDurationSec,
  parseHdrTransfer,
  prepareVideoArgs,
  probeVideo,
  runFfmpeg,
  targetVideoKbps,
} from "./media";

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
  it("builds a no-audio H.264 command that scales the short side to 720", () => {
    const args = prepareVideoArgs({ input: "in.mov", output: "out.mp4", durationSec: 80 });
    expect(args).toContain("-an");
    expect(args).toContain("libx264");
    expect(args[args.indexOf("-vf") + 1]).toBe(
      "fps=30,scale=w='if(gt(iw,ih),-2,720)':h='if(gt(iw,ih),720,-2)'",
    );
    expect(args).not.toContain("-color_trc");
    expect(args.at(-1)).toBe("out.mp4");
  });

  it("tone-maps HDR to SDR BT.709 and tags the output", () => {
    const args = prepareVideoArgs({
      input: "in.mov",
      output: "out.mp4",
      durationSec: 80,
      hdr: true,
    });
    const vf = args[args.indexOf("-vf") + 1];
    expect(vf).toMatch(/^fps=30,scale=.*,zscale=t=linear:npl=100,/);
    expect(vf).toContain("tonemap=tonemap=hable:desat=0");
    expect(vf).toMatch(/zscale=t=bt709:m=bt709:r=tv,format=yuv420p$/);
    expect(args[args.indexOf("-color_trc") + 1]).toBe("bt709");
    expect(args[args.indexOf("-color_primaries") + 1]).toBe("bt709");
  });
});

describe("parseHdrTransfer", () => {
  it("reads HLG from an iPhone stream line, PQ from HDR10, nothing from SDR", () => {
    const iphone =
      "  Stream #0:0[0x1](und): Video: hevc (Main 10) (hvc1 / 0x31637668), yuv420p10le(tv, bt2020nc/bt2020/arib-std-b67), 1920x1080, 14897 kb/s, 59.68 fps";
    expect(parseHdrTransfer(`  Duration: 00:01:32.84\n${iphone}\n`)).toBe("hlg");
    expect(
      parseHdrTransfer(
        "  Stream #0:0: Video: hevc (Main 10), yuv420p10le(tv, bt2020nc/bt2020/smpte2084), 3840x2160",
      ),
    ).toBe("pq");
    expect(
      parseHdrTransfer(
        "  Stream #0:0[0x1](und): Video: h264 (High), yuv420p(tv, bt709, progressive), 720x1280",
      ),
    ).toBeNull();
  });
});

/** The real-ffmpeg tests need the ffmpeg-static binary with zscale (libzimg). */
function ffmpegWithZscale(): boolean {
  try {
    const bin = ffmpegPath();
    return (
      existsSync(bin) &&
      spawnSync(bin, ["-hide_banner", "-filters"]).stdout.toString().includes(" zscale ")
    );
  } catch {
    return false;
  }
}

function videoLine(file: string): string {
  const { stderr } = spawnSync(ffmpegPath(), ["-hide_banner", "-i", file]);
  return (
    stderr
      .toString()
      .split("\n")
      .find((line) => line.includes("Video:")) ?? ""
  );
}

describe.skipIf(!ffmpegWithZscale())("prepareVideoArgs with the real ffmpeg", () => {
  let dir = "";
  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "glasshouse-media-"));
  });
  afterAll(() => rm(dir, { recursive: true, force: true }));

  it("turns a portrait HLG clip into 720x1280 SDR BT.709", async () => {
    const input = path.join(dir, "hlg.mkv");
    await runFfmpeg([
      "-y",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=s=360x640:r=30:d=0.4",
      "-vf",
      "format=yuv420p,zscale=pin=bt709:tin=bt709:min=bt709:rin=tv:p=bt2020:t=arib-std-b67:m=bt2020nc:r=tv,format=yuv420p10le",
      "-color_primaries",
      "bt2020",
      "-color_trc",
      "arib-std-b67",
      "-colorspace",
      "bt2020nc",
      "-c:v",
      "ffv1",
      input,
    ]);
    const { durationSec, hdr } = await probeVideo(input);
    expect(hdr).toBe("hlg");

    const output = path.join(dir, "hlg-720.mp4");
    await runFfmpeg(prepareVideoArgs({ input, output, durationSec, hdr: true }));
    expect(videoLine(output)).toMatch(/yuv420p\(tv, bt709.*\b720x1280\b/);
  }, 30_000);

  it("turns a 60 fps landscape SDR clip into 1280x720 at 30 fps", async () => {
    const input = path.join(dir, "sdr.mp4");
    await runFfmpeg([
      "-y",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=s=640x360:r=60:d=0.4",
      "-pix_fmt",
      "yuv420p",
      "-c:v",
      "libx264",
      input,
    ]);
    const { durationSec, hdr } = await probeVideo(input);
    expect(hdr).toBeNull();

    const output = path.join(dir, "sdr-720.mp4");
    await runFfmpeg(prepareVideoArgs({ input, output, durationSec }));
    expect(videoLine(output)).toMatch(/\b1280x720\b.*\b30 fps\b/);
  }, 30_000);
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
