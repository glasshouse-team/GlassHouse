/**
 * World Labs CLI (owner: Temuri; GH-3 go/no-go, GH-6 hero homes, GH-10 adds --import).
 *
 *   pnpm worlds generate --video <walk-720.mp4 | public-url> [--name "Hero 1 v1"] [--prompt "..."] [--model marble-1.1-plus] [--wait]
 *   pnpm worlds generate --images <file-or-url,...> [--azimuths 0,90,180,270] [--reconstruct] [--wait]
 *   pnpm worlds upload <file>             (prints a media_asset_id)
 *   pnpm worlds status <operation_id>
 *   pnpm worlds wait <operation_id>
 *   pnpm worlds get <world_id>
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

async function wait(operationId: string) {
  const started = Date.now();
  const { world, operation } = await waitForWorld(operationId, {
    onProgress: (op) => {
      const secs = Math.round((Date.now() - started) / 1000);
      process.stdout.write(`\r${op.done ? "done" : "generating"}... ${secs}s   `);
    },
  });
  process.stdout.write("\n");
  if (operation.cost) console.log(`Cost: ${operation.cost.total_credits} credits`);
  printWorld(world);
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
    },
  });
  const [command, id] = positionals;

  if (command === "status" && id) {
    console.log(JSON.stringify(await getOperation(id), null, 2));
    return;
  }
  if (command === "wait" && id) return wait(id);
  if (command === "get" && id) return printWorld(await getWorld(id));
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
    if (values.wait) return wait(op.operation_id);
    console.log(`Check later with: pnpm worlds wait ${op.operation_id}`);
    return;
  }

  console.log("Usage: pnpm worlds generate --video <file|url> | --images <files|urls> [--wait]");
  console.log("       pnpm worlds upload <file>");
  console.log("       pnpm worlds status|wait <operation_id>");
  console.log("       pnpm worlds get <world_id>");
  process.exitCode = 1;
}

main().catch((error) => {
  if (error instanceof MarbleError)
    console.error(`${error.message}\n${JSON.stringify(error.body, null, 2)}`);
  else console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
