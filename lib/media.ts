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

/** H.264, 720p, 30 fps, no audio, sized for the URL limit. */
export function prepareVideoArgs({
  input,
  output,
  durationSec,
  height = 720,
  fps = 30,
}: {
  input: string;
  output: string;
  durationSec: number;
  height?: number;
  fps?: number;
}): string[] {
  const kbps = targetVideoKbps(durationSec);
  return [
    "-y",
    "-hide_banner",
    "-i",
    input,
    "-vf",
    `scale=-2:${height},fps=${fps}`,
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

/** Duration in seconds, read from ffmpeg's input probe (ffmpeg-static ships no ffprobe). */
export async function probeDurationSec(input: string): Promise<number> {
  const { stderr } = await spawnFfmpeg(["-hide_banner", "-i", input]);
  const duration = parseDurationSec(stderr);
  if (duration == null) throw new Error(`Could not read the duration of ${input}`);
  return duration;
}
