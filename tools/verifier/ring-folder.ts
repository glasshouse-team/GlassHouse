/**
 * Reads a spot's ring photos from a local capture folder for `pnpm gaps --check --rings`
 * (GH-19, owner: Temuri, D-047). Script only (never imported by a route): it reads the folder
 * read-only, JPEG/PNG through sharp, HEIC through macOS `sips` into a temp folder that is removed
 * afterwards. The pure parts are in ./ring-photos.ts.
 */
import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";
import { RING_SIZE, ringAzimuth } from "./known-gap";
import { matchRingFolder, ringOrder, RING_PHOTO_PX, type RingPhoto } from "./ring-photos";

const run = promisify(execFile);

async function toJpeg(file: string, tmp: string): Promise<Buffer> {
  if (/\.(heic|heif)$/i.test(file)) {
    // sharp's prebuilt libvips has no HEVC decoder; macOS sips does. The source stays untouched.
    const out = path.join(tmp, `${path.basename(file)}.jpg`);
    await run("sips", ["-s", "format", "jpeg", "-Z", String(RING_PHOTO_PX), file, "--out", out]);
    return sharp(await readFile(out))
      .jpeg({ quality: 82 })
      .toBuffer();
  }
  return sharp(await readFile(file))
    .rotate()
    .resize({ width: RING_PHOTO_PX, height: RING_PHOTO_PX, fit: "inside" })
    .jpeg({ quality: 82 })
    .toBuffer();
}

/** Reads one ring folder (read-only) into JPEGs with their azimuths. */
export async function loadRingFolder(dir: string): Promise<RingPhoto[]> {
  const names = ringOrder(await readdir(dir));
  const tmp = await mkdtemp(path.join(tmpdir(), "gh19-ring-"));
  try {
    return await Promise.all(
      names.map(async (name, i) => ({
        name,
        azimuth: ringAzimuth(i, RING_SIZE),
        jpeg: await toJpeg(path.join(dir, name), tmp),
      })),
    );
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

/** The middle-ring folder of a spot under a capture root (`<root>/<room>/middle`), or null. */
export async function findRingDir(
  root: string,
  spot: string,
  spotLabel: string | null,
): Promise<string | null> {
  const entries = await readdir(root, { withFileTypes: true });
  const folder = matchRingFolder(
    spot,
    spotLabel,
    entries.filter((e) => e.isDirectory()).map((e) => e.name),
  );
  if (!folder) return null;
  const middle = path.join(root, folder, "middle");
  try {
    await readdir(middle);
    return middle;
  } catch {
    return path.join(root, folder);
  }
}
