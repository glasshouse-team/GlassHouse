/**
 * Builds the floor plans (walls, room outlines with m² areas, SVG, room anchors) from the
 * stored collider meshes (GH-18, owner: Temuri). See docs/tickets/GH-18.md and
 * lib/geometry/store-floorplans.ts. Prints each room's area; a host calibration is kept.
 * No World Labs calls: colliders come from our storage.
 *
 *   pnpm floorplans                              every version of every listing with worlds
 *   pnpm floorplans --listing hero-2 --version 2 one version
 *   pnpm floorplans --dry-run --out /tmp/plans   compute only, write the SVGs to a folder
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { buildFloorPlans } from "@/lib/geometry/store-floorplans";
import { supabaseAdmin } from "@/lib/supabase";

const { values } = parseArgs({
  options: {
    listing: { type: "string" },
    version: { type: "string" },
    "dry-run": { type: "boolean", default: false },
    out: { type: "string" },
  },
});

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const version = values.version === undefined ? undefined : Number(values.version);
if (version !== undefined && (!Number.isInteger(version) || version < 1))
  fail("--version must be a whole number, 1 or more");

async function main() {
  const db = supabaseAdmin();
  let listingQuery = db.from("listings").select("id, slug");
  if (values.listing) listingQuery = listingQuery.eq("slug", values.listing);
  const { data: listings, error } = await listingQuery;
  if (error) fail(`Could not load listings: ${error.message}`);
  if (!listings?.length) fail(values.listing ? `No listing "${values.listing}"` : "No listings");

  let built = 0;
  for (const listing of listings) {
    const { data: rows, error: worldsError } = await db
      .from("worlds")
      .select("version")
      .eq("listing_id", listing.id)
      .in("status", ["ready", "published"]);
    if (worldsError) fail(`Could not load worlds: ${worldsError.message}`);
    const versions = [...new Set((rows ?? []).map((r) => r.version))]
      .filter((v) => version === undefined || v === version)
      .sort((a, b) => a - b);
    for (const v of versions) {
      const started = Date.now();
      const result = await buildFloorPlans(listing.id, v, { dryRun: values["dry-run"] });
      built++;
      console.log(
        `${listing.slug} v${v}: ${result.rooms} rooms in ${Date.now() - started} ms` +
          (values["dry-run"] ? " (dry run, nothing saved)" : ""),
      );
      for (const plan of result.plans) {
        console.log(`  ${plan.spot.padEnd(10)} ${plan.walls} walls  ${plan.svgUrl ?? ""}`);
      }
      const scale = result.calibration
        ? `calibrated from the ${result.calibration.room} ${result.calibration.axis} ${result.calibration.meters} m (x${result.calibration.scale})`
        : "not calibrated";
      console.log(`  areas (${scale}):`);
      for (const { room, area_m2 } of result.areas) {
        console.log(`    ${room.padEnd(14)} ${area_m2 === null ? "no outline" : `${area_m2} m²`}`);
      }
      console.log(`    ${"total".padEnd(14)} ${result.totalArea ?? "-"} m²`);
      if (values.out) {
        const dir = path.resolve(values.out);
        mkdirSync(dir, { recursive: true });
        for (const [spot, svg] of result.svgs) {
          writeFileSync(path.join(dir, `${listing.slug}-v${v}-${spot}.svg`), svg);
        }
      }
    }
  }
  if (built === 0) fail("No world version with ready or published worlds matched.");
}

main().catch((error: unknown) => fail(error instanceof Error ? error.message : String(error)));
