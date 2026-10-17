/**
 * ffmpeg helpers for walkthroughs, fill-ins and check-ins (owner: Temuri, GH-3 / GH-10 / GH-22).
 * Uses the ffmpeg binary from ffmpeg-static, so nothing needs to be installed system-wide.
 * Server and scripts only.
 */
import { spawn } from "node:child_process";
import ffmpegStatic from "ffmpeg-static";

/** World Labs documents a 20 MB limit for inputs passed by URL. */
export const URL_INPUT_LIMIT_BYTES = 20 * 1024 * 1024;
/** Aim a little under the limit to leave room for container overhead. */
export const TARGET_VIDEO_BYTES = 19 * 1024 * 1024;

export function ffmpegPath(): string {
  const path = ffmpegStatic as unknown as string | null;
  if (!path)
    throw new Error(
      "ffmpeg-static has no binary for this platform. Reinstall dependencies on this machine.",
    );
  return path;
}

/** Video bitrate (kbit/s) that keeps a clip of `durationSec` under `targetBytes`. */
export function targetVideoKbps(durationSec: number, targetBytes = TARGET_VIDEO_BYTES): number {
  if (!(durationSec > 0)) throw new RangeError("durationSec must be positive");
  const kbps = Math.floor(((targetBytes * 8) / 1000 / durationSec) * 0.92);
  return Math.max(600, Math.min(kbps, 4000));
}

/**
 * Scales the short side to `shortSide`, keeping the aspect ratio: portrait 720x1280, landscape
 * 1280x720. ffmpeg applies the phone's rotation first, so iw/ih are the upright size.
 */
function scaleShortSide(shortSide: number): string {
  return `scale=w='if(gt(iw,ih),-2,${shortSide})':h='if(gt(iw,ih),${shortSide},-2)'`;
}

/**
 * HDR (iPhone HLG, or PQ) to SDR BT.709: linearize, convert BT.2020 primaries, Hable tone curve,
 * back to 8-bit BT.709. Only for HDR input: on SDR it would darken the picture.
 */
const TONEMAP_TO_SDR = [
  "zscale=t=linear:npl=100",
  "format=gbrpf32le",
  "zscale=p=bt709",
  "tonemap=tonemap=hable:desat=0",
  "zscale=t=bt709:m=bt709:r=tv",
  "format=yuv420p",
].join(",");

/** H.264, short side 720, 30 fps, no audio, SDR BT.709, sized for the URL limit. */
export function prepareVideoArgs({
  input,
  output,
  durationSec,
  shortSide = 720,
  fps = 30,
  hdr = false,
}: {
  input: string;
  output: string;
  durationSec: number;
  shortSide?: number;
  fps?: number;
  /** True for HLG or PQ input (probeVideo): tone-maps to SDR BT.709. */
  hdr?: boolean;
}): string[] {
  const kbps = targetVideoKbps(durationSec);
  const filters = [`fps=${fps}`, scaleShortSide(shortSide), ...(hdr ? [TONEMAP_TO_SDR] : [])];
  return [
    "-y",
    "-hide_banner",
    "-i",
    input,
    "-vf",
    filters.join(","),
    "-an",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-b:v",
    `${kbps}k`,
    "-maxrate",
    `${kbps}k`,
    "-bufsize",
    `${kbps * 2}k`,
    "-pix_fmt",
    "yuv420p",
    ...(hdr ? ["-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709"] : []),
    "-movflags",
    "+faststart",
    output,
  ];
}

/** One JPEG every `everySec` seconds, e.g. outPattern "frames/%04d.jpg". */
export function extractFramesArgs({
  input,
  outPattern,
  everySec = 0.5,
  height = 720,
}: {
  input: string;
  outPattern: string;
  everySec?: number;
  height?: number;
}): string[] {
  return [
    "-y",
    "-hide_banner",
    "-i",
    input,
    "-vf",
    `fps=1/${everySec},scale=-2:${height}`,
    "-q:v",
    "3",
    outPattern,
  ];
}

/** Content of a concat list file for joining clips (walkthrough + fill-ins). Clips must share codec, size and fps. */
export function concatFileList(paths: string[]): string {
  return paths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n") + "\n";
}

export function joinClipsArgs({
  listFile,
  output,
}: {
  listFile: string;
  output: string;
}): string[] {
  return ["-y", "-hide_banner", "-f", "concat", "-safe", "0", "-i", listFile, "-c", "copy", output];
}

/** Reads "Duration: 00:01:23.45" from ffmpeg's log. */
export function parseDurationSec(ffmpegLog: string): number | null {
  const match = ffmpegLog.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!match) return null;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

/**
 * HDR transfer of the first video stream in ffmpeg's log, e.g.
 * "Video: hevc (Main 10) ..., yuv420p10le(tv, bt2020nc/bt2020/arib-std-b67)" is iPhone HLG.
 */
export function parseHdrTransfer(ffmpegLog: string): "hlg" | "pq" | null {
  const video = ffmpegLog.split("\n").find((line) => /Stream #.*: Video:/.test(line));
  if (video?.includes("arib-std-b67")) return "hlg";
  if (video?.includes("smpte2084")) return "pq";
  return null;
}

function spawnFfmpeg(args: string[]): Promise<{ code: number | null; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath(), args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stderr }));
  });
}

/** Runs ffmpeg and rejects with the tail of its log on failure. */
export async function runFfmpeg(args: string[]): Promise<void> {
  const { code, stderr } = await spawnFfmpeg(args);
  if (code !== 0)
    throw new Error(`ffmpeg exited with ${code}:\n${stderr.split("\n").slice(-15).join("\n")}`);
}

/** Duration and HDR transfer, read from ffmpeg's input probe (ffmpeg-static ships no ffprobe). */
export async function probeVideo(
  input: string,
): Promise<{ durationSec: number; hdr: "hlg" | "pq" | null }> {
  const { stderr } = await spawnFfmpeg(["-hide_banner", "-i", input]);
  const durationSec = parseDurationSec(stderr);
  if (durationSec == null) throw new Error(`Could not read the duration of ${input}`);
  return { durationSec, hdr: parseHdrTransfer(stderr) };
}

/** Duration in seconds (see probeVideo). */
export async function probeDurationSec(input: string): Promise<number> {
  return (await probeVideo(input)).durationSec;
}
