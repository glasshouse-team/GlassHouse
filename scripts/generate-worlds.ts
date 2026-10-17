/**
 * World Labs CLI (owner: Temuri; GH-3 go/no-go, GH-6 hero homes, GH-10 adds --import).
 *
 *   pnpm worlds generate --video <public-mp4-url> [--name "Hero 1 v1"] [--prompt "..."] [--model marble-1.1-plus] [--wait]
 *   pnpm worlds generate --images <url1,url2,...> [--azimuths 0,90,180,270] [--reconstruct] [--wait]
 *   pnpm worlds status <operation_id>
 *   pnpm worlds wait <operation_id>
 *   pnpm worlds get <world_id>
 *
 * Generation takes about 5 minutes and costs credits. Input URLs must open in an
 * incognito window (no login). Prepare videos first with `pnpm video:prepare`.
 * Refuses to generate when DEMO_MODE=true (pass --force to override).
 */
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
} from "@/lib/marble";

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
          video_prompt: { source: "uri", uri: values.video },
          text_prompt: values.prompt,
        },
      };
    } else if (values.images) {
      const uris = values.images
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const azimuths = values.azimuths?.split(",").map(Number) ?? [];
      const limit = values.reconstruct ? 8 : 4;
      if (uris.length > limit) {
        throw new Error(
          `Marble multi-image takes up to ${limit} images${values.reconstruct ? "" : " (8 with --reconstruct)"}. For more photos, use HY World on Scenario.`,
        );
      }
      request = {
        model,
        display_name: values.name?.slice(0, 64),
        world_prompt: {
          type: "multi-image",
          reconstruct_images: values.reconstruct,
          multi_image_prompt: uris.map((uri, i) => ({
            azimuth: azimuths[i] ?? null,
            content: { source: "uri", uri },
          })),
          text_prompt: values.prompt,
        },
      };
    } else {
      throw new Error("Pass --video <url> or --images <url1,url2,...>");
    }
    const op = await generateWorld(request);
    console.log(`Started. operation_id: ${op.operation_id}  (model ${model})`);
    if (values.wait) return wait(op.operation_id);
    console.log(`Check later with: pnpm worlds wait ${op.operation_id}`);
    return;
  }

  console.log("Usage: pnpm worlds generate --video <url> | --images <urls> [--wait]");
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
