/**
 * World Labs CLI (owner: Temuri; GH-3 go/no-go, GH-6 hero homes, GH-10 adds --import).
 *
 *   pnpm worlds generate --video <walk-720.mp4 | public-url> [--name "Hero 1 v1"] [--prompt "..."] [--model marble-1.1-plus] [--wait]
 *   pnpm worlds generate --images <file-or-url,...> [--azimuths 0,90,180,270] [--reconstruct] [--wait]
 *   pnpm worlds upload <file>             (prints a media_asset_id)
 *   pnpm worlds status <operation_id>
 *   pnpm worlds wait <operation_id> [--timeout <minutes>]   (default 60; also for generate --wait)
 *   pnpm worlds get <world_id>
 *   pnpm worlds inspect <world_id> [--json]   (asset sizes, collider format, floor vs ground_plane_offset)
 *
 * Generation takes about 5 minutes and costs credits. Local files are uploaded straight to
 * World Labs (media assets), so no public URL is needed. URLs must open in an incognito
 * window (no login). Prepare videos first with `pnpm video:prepare` (under 20 MB).
 * Refuses to generate when DEMO_MODE=true (pass --force to override).
 */
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { isDemoMode, settings } from "@/lib/env";
import {
  generateWorld,
  getOperation,
  getWorld,
  MarbleError,
  pickSplatUrls,
  waitForWorld,
  worldAssets,
  worldScale,
  type GenerateWorldRequest,
  type MarbleModel,
  type MarbleWorld,
  type SourceRef,
  uploadMediaAsset,
} from "@/lib/marble";

const CONTENT_TYPES: Record<string, string> = {
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

/** A URL stays a URL; a local file is uploaded to World Labs and referenced as a media asset. */
async function sourceFor(input: string, kind: "image" | "video"): Promise<SourceRef> {
  if (/^https?:\/\//.test(input)) return { source: "uri", uri: input };
  const ext = path.extname(input).slice(1).toLowerCase();
  const contentType = CONTENT_TYPES[ext];
  if (!contentType) throw new Error(`Unknown file type: ${input}`);
  const { size } = await stat(input);
  if (kind === "video" && size > 20 * 1024 * 1024) {
    console.warn(
      `Warning: ${input} is ${(size / 1048576).toFixed(1)} MB; prepare it under 20 MB first.`,
    );
  }
  console.log(
    `Uploading ${path.basename(input)} (${(size / 1048576).toFixed(1)} MB) to World Labs...`,
  );
  const id = await uploadMediaAsset({
    fileName: path.basename(input),
    kind,
    contentType,
    bytes: new Uint8Array(await readFile(input)),
  });
  console.log(`media_asset_id: ${id}`);
  return { source: "media_asset", media_asset_id: id };
}

function printWorld(world: MarbleWorld) {
  const { web, hq } = pickSplatUrls(world);
  const scale = worldScale(world);
  console.log(
    JSON.stringify(
      {
        world_id: world.world_id,
        marble_url: world.world_marble_url,
        model: world.model,
        splat_sizes: Object.keys(world.assets?.splats?.spz_urls ?? {}),
        web_splat: web,
        hq_splat: hq,
        collider_mesh: world.assets?.mesh?.collider_mesh_url ?? null,
        hq_mesh: world.assets?.mesh?.hq_mesh_url ?? null,
        pano: world.assets?.imagery?.pano_url ?? null,
        thumbnail: world.assets?.thumbnail_url ?? null,
        caption: world.assets?.caption ?? null,
        metric_scale_factor: scale.metricScaleFactor,
        ground_plane_offset: scale.groundPlaneOffset,
      },
      null,
      2,
    ),
  );
  console.log(
    "\nNext: open marble_url, judge the result, and post this JSON in the GH-3 / GH-6 ticket.",
  );
}

const MB = 1024 * 1024;
/** Supabase Free plan file limit (D-020): a bigger splat cannot go into our storage. */
const STORAGE_FILE_LIMIT = 50 * MB;

/** Bytes of a remote file: HEAD, or a 1-byte ranged GET for URLs signed for GET only. */
async function remoteSize(url: string): Promise<number | null> {
  const head = await fetch(url, { method: "HEAD" }).catch(() => null);
  const length = Number(head?.ok ? head.headers.get("content-length") : NaN);
  if (length > 0) return length;
  const ranged = await fetch(url, { headers: { Range: "bytes=0-0" } }).catch(() => null);
  await ranged?.body?.cancel();
  const total = Number(ranged?.headers.get("content-range")?.split("/")[1]);
  return total > 0 ? total : null;
}

/**
 * What GH-3 records per world (D-009): asset sizes, the collider's format and extensions, and
 * the floor measured from the collider (marbleToThree + floorHeight) against ground_plane_offset.
 * World Labs' SPZ docs ground the splat with `metric.y -= ground_plane_offset` in the OpenCV frame,
 * so after our flip the collider floor should sit at y = -ground_plane_offset.
 */
async function inspect(worldId: string, asJson: boolean) {
  // Scripts run as CommonJS under tsx, and three's CommonJS build prints a deprecation warning
  // when loaded. Only inspect needs three, so it loads the geometry here, with the warning off.
  process.noDeprecation = true;
  const { ceilingHeight, colliderToThree, robustExtent } = await import("@/lib/geometry/collider");
  const { glbSummary, parseGlb } = await import("@/lib/geometry/glb");

  const world = await getWorld(worldId);
  const meta = world.assets?.splats?.semantics_metadata;
  const { metricScaleFactor } = worldScale(world);
  const groundPlaneOffset = meta?.ground_plane_offset ?? null;
  const assets = await Promise.all(
    worldAssets(world).map(async (a) => ({ ...a, bytes: await remoteSize(a.url) })),
  );

  let collider = null;
  const colliderUrl = world.assets?.mesh?.collider_mesh_url;
  if (colliderUrl) {
    const res = await fetch(colliderUrl);
    if (!res.ok) throw new Error(`Collider download failed (HTTP ${res.status})`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    const summary = glbSummary(parseGlb(bytes));
    let floor = null;
    if (!summary.compression) {
      const { positions, index, floorY } = colliderToThree(bytes, metricScaleFactor);
      const { min, max } = robustExtent(positions);
      floor = {
        floorY,
        floorYFromOffset: groundPlaneOffset == null ? null : -groundPlaneOffset,
        gap: groundPlaneOffset == null ? null : floorY + groundPlaneOffset,
        ceiling: ceilingHeight(positions, index),
        sizeX: max[0] - min[0],
        sizeZ: max[2] - min[2],
      };
    }
    collider = { bytes: bytes.length, ...summary, floor };
  }

  const report = {
    world_id: world.world_id,
    display_name: world.display_name,
    model: world.model,
    marble_url: world.world_marble_url,
    metric_scale_factor: meta?.metric_scale_factor ?? null,
    ground_plane_offset: groundPlaneOffset,
    assets: assets.map(({ label, bytes, url }) => ({ label, bytes, url })),
    collider,
  };
  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const mb = (bytes: number | null) => (bytes == null ? "?" : `${(bytes / MB).toFixed(1)} MB`);
  const m = (n: number) => `${n.toFixed(3)} m`;
  console.log(`${world.display_name}  (world ${world.world_id}, ${world.model ?? "model ?"})`);
  console.log(world.world_marble_url);
  console.log(
    `metric_scale_factor ${report.metric_scale_factor ?? "missing (using 1)"}   ground_plane_offset ${groundPlaneOffset ?? "missing"}`,
  );
  console.log("\nAssets");
  for (const a of assets) {
    const over = a.kind === "splat" && (a.bytes ?? 0) > STORAGE_FILE_LIMIT;
    console.log(
      `  ${a.label.padEnd(16)} ${mb(a.bytes).padStart(9)}${over ? "  over 50 MB: too big for Supabase Free (D-020)" : ""}`,
    );
  }
  if (!collider) {
    console.log("\nNo collider mesh.");
    return;
  }
  const fmt = (v: number[] | null) => (v ? `[${v.map((n) => n.toFixed(2)).join(", ")}]` : "?");
  console.log(
    `\nCollider: GLB ${mb(collider.bytes)}, ${collider.triangles.toLocaleString()} triangles, ${collider.vertices.toLocaleString()} vertices`,
  );
  console.log(`  generator: ${collider.generator ?? "?"}`);
  console.log(`  extensionsUsed: ${collider.extensionsUsed.join(", ") || "none"}`);
  console.log(
    `  node transforms: ${collider.nodeTransforms.length ? JSON.stringify(collider.nodeTransforms) : "none"}`,
  );
  console.log(
    `  POSITION min ${fmt(collider.positionMin)} max ${fmt(collider.positionMax)} (raw units)`,
  );
  const f = collider.floor;
  if (!f) {
    console.log(`  ${collider.compression}: floor not measured (needs a decoder in Node)`);
    return;
  }
  console.log(`  floor, measured (marbleToThree + floorHeight): ${m(f.floorY)}`);
  if (f.gap != null && f.floorYFromOffset != null) {
    const verdict = Math.abs(f.gap) < 0.1 ? "agree" : "DISAGREE: check D-016";
    console.log(
      `  floor from -ground_plane_offset:               ${m(f.floorYFromOffset)}   gap ${(f.gap * 100).toFixed(1)} cm: ${verdict}`,
    );
  }
  console.log(
    `  ceiling ${f.ceiling.toFixed(2)} m above the floor; ${f.sizeX.toFixed(1)} m (x) by ${f.sizeZ.toFixed(1)} m (z), 1st-99th percentile of vertices`,
  );
}

/** marble-1.1-plus on a 90-110 s walkthrough takes over 20 minutes; operations expire after 3 h. */
const DEFAULT_TIMEOUT_MINUTES = 60;

async function wait(operationId: string, timeoutMinutes: number) {
  const started = Date.now();
  let shownWorldId = false;
  try {
    const { world, operation } = await waitForWorld(operationId, {
      timeoutMs: timeoutMinutes * 60_000,
      onProgress: (op) => {
        const worldId = op.metadata?.world_id;
        if (!shownWorldId && typeof worldId === "string") {
          process.stdout.write(`world_id: ${worldId}\n`);
          shownWorldId = true;
        }
        const secs = Math.round((Date.now() - started) / 1000);
        process.stdout.write(`\r${op.done ? "done" : "generating"}... ${secs}s   `);
      },
    });
    process.stdout.write("\n");
    if (operation.cost) console.log(`Cost: ${operation.cost.total_credits} credits`);
    printWorld(world);
  } catch (error) {
    process.stdout.write("\n");
    if (error instanceof MarbleError && error.status === 408) {
      console.error(`Resume with: pnpm worlds wait ${operationId} [--timeout <minutes>]`);
    }
    throw error;
  }
}

async function main() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      video: { type: "string" },
      images: { type: "string" },
      azimuths: { type: "string" },
      reconstruct: { type: "boolean", default: false },
      name: { type: "string" },
      prompt: { type: "string" },
      model: { type: "string" },
      wait: { type: "boolean", default: false },
      force: { type: "boolean", default: false },
      json: { type: "boolean", default: false },
      timeout: { type: "string" },
    },
  });
  const [command, id] = positionals;
  const timeoutMinutes = Number(values.timeout ?? DEFAULT_TIMEOUT_MINUTES);

  if (command === "status" && id) {
    console.log(JSON.stringify(await getOperation(id), null, 2));
    return;
  }
  if (command === "wait" && id) return wait(id, timeoutMinutes);
  if (command === "get" && id) return printWorld(await getWorld(id));
  if (command === "inspect" && id) return inspect(id, values.json);
  if (command === "upload" && id) {
    const kind = /\.(mp4|mov|webm)$/i.test(id) ? "video" : "image";
    await sourceFor(id, kind);
    return;
  }

  if (command === "generate") {
    if (isDemoMode() && !values.force) {
      throw new Error(
        "DEMO_MODE=true: refusing to generate. Use the saved versions, or pass --force.",
      );
    }
    const model = (values.model ?? settings.marbleModel) as MarbleModel;
    let request: GenerateWorldRequest;
    if (values.video) {
      request = {
        model,
        display_name: values.name?.slice(0, 64),
        world_prompt: {
          type: "video",
          video_prompt: await sourceFor(values.video, "video"),
          text_prompt: values.prompt,
        },
      };
    } else if (values.images) {
      const inputs = values.images
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const azimuths = values.azimuths?.split(",").map(Number) ?? [];
      const limit = values.reconstruct ? 8 : 4;
      if (inputs.length > limit) {
        throw new Error(
          `Marble multi-image takes up to ${limit} images${values.reconstruct ? "" : " (8 with --reconstruct)"}. For more photos, use HY World on Scenario.`,
        );
      }
      const contents: SourceRef[] = [];
      for (const input of inputs) contents.push(await sourceFor(input, "image"));
      request = {
        model,
        display_name: values.name?.slice(0, 64),
        world_prompt: {
          type: "multi-image",
          reconstruct_images: values.reconstruct,
          multi_image_prompt: contents.map((content, i) => ({
            azimuth: azimuths[i] ?? null,
            content,
          })),
          text_prompt: values.prompt,
        },
      };
    } else {
      throw new Error("Pass --video <file|url> or --images <file-or-url,...>");
    }
    const op = await generateWorld(request);
    console.log(`Started. operation_id: ${op.operation_id}  (model ${model})`);
    if (values.wait) return wait(op.operation_id, timeoutMinutes);
    console.log(`Check later with: pnpm worlds wait ${op.operation_id}`);
    return;
  }

  console.log("Usage: pnpm worlds generate --video <file|url> | --images <files|urls> [--wait]");
  console.log("       pnpm worlds upload <file>");
  console.log("       pnpm worlds status|wait <operation_id>");
  console.log("       pnpm worlds get <world_id>");
  console.log("       pnpm worlds inspect <world_id> [--json]");
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  if (error instanceof MarbleError && error.body !== undefined) {
    console.error(JSON.stringify(error.body, null, 2));
  }
  process.exit(1);
});
