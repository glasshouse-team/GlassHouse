/**
 * Gap check of the 3D worlds (GH-19, owner: Temuri). See docs/tickets/GH-19.md.
 *
 *   pnpm gaps --mark-known            store the known invented areas (tools/verifier/known-gap.ts)
 *                                     and the ring-photo coverage scores; safe to re-run
 *   pnpm gaps --mark-known --dry-run  print what it would write, write nothing
 *
 * The automatic Verifier check (rig views, vision, ray to collider) is not built yet.
 * No World Labs calls: colliders come from our storage.
 */
import { parseArgs } from "node:util";
import { castRay, colliderFromGlb } from "@/components/tour/collider-mesh";
import { logEvent } from "@/lib/events";
import { isOurStorage } from "@/lib/geometry/store-floorplans";
import { supabaseAdmin } from "@/lib/supabase";
import {
  KNOWN_GAPS,
  azimuthToDirection,
  coverageUpdates,
  gapToInsert,
  knownGapRow,
  rayOrigin,
  type KnownGap,
} from "@/tools/verifier/known-gap";

const { values } = parseArgs({
  options: {
    "mark-known": { type: "boolean", default: false },
    "dry-run": { type: "boolean", default: false },
  },
});

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

/** Rays that miss (a blank area) place the gap this far out (GH-19 build notes). */
const MISS_DISTANCE_M = 2;

async function loadColliderBytes(url: string): Promise<Uint8Array> {
  if (!isOurStorage(url)) fail(`Collider is not in our storage (${url}); import the world first.`);
  const res = await fetch(url);
  if (!res.ok) fail(`Could not download the collider ${url}: HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

/** Distance from the spot centre to the collider along the known gap's ray, or null on a miss. */
async function rayDistance(
  known: KnownGap,
  world: { collider_mesh_url: string | null; metric_scale_factor: number | null },
): Promise<number | null> {
  if (!world.collider_mesh_url || !world.metric_scale_factor)
    fail(`${known.spot} v${known.version} has no collider or metric scale`);
  const collider = colliderFromGlb(
    await loadColliderBytes(world.collider_mesh_url),
    world.metric_scale_factor,
  );
  try {
    const hits = castRay(collider, rayOrigin(known), azimuthToDirection(known.azimuth));
    return hits.length ? Math.min(...hits.map((h) => h.distance)) : null;
  } finally {
    collider.dispose();
  }
}

async function markKnown(dryRun: boolean) {
  const db = supabaseAdmin();
  const tag = dryRun ? " (dry run, nothing saved)" : "";

  for (const known of KNOWN_GAPS) {
    const { data: world, error } = await db
      .from("worlds")
      .select("id, collider_mesh_url, metric_scale_factor")
      .eq("listing_id", known.listingId)
      .eq("version", known.version)
      .eq("spot", known.spot)
      .maybeSingle();
    if (error) fail(`Could not load the ${known.spot} v${known.version} world: ${error.message}`);
    if (!world)
      fail(`No ${known.spot} v${known.version} world for ${known.listingId}; import it first.`);

    const { data: existing, error: gapsError } = await db
      .from("gaps")
      .select("id, world_id, issue, description, status, position")
      .eq("world_id", world.id);
    if (gapsError) fail(`Could not load gaps: ${gapsError.message}`);

    const distance = await rayDistance(known, world);
    const row = knownGapRow(known, world.id, distance ?? MISS_DISTANCE_M);
    const insert = gapToInsert(row, existing ?? []);
    const hitText =
      distance === null
        ? `missed, placed ${MISS_DISTANCE_M} m out`
        : `hit at ${distance.toFixed(3)} m`;
    console.log(
      `${known.room} v${known.version} (world ${world.id}): ray at ${known.azimuth} deg, ${hitText}, ` +
        `position ${JSON.stringify(row.position)}`,
    );

    const { data: worlds, error: worldsError } = await db
      .from("worlds")
      .select("id, listing_id, version, spot, coverage_score")
      .eq("listing_id", known.listingId);
    if (worldsError) fail(`Could not load worlds: ${worldsError.message}`);
    const updates = coverageUpdates(worlds ?? [], [known]);

    if (!insert) console.log(`  gap already stored, left as it is`);
    else
      console.log(
        `  insert gap: ${row.issue}, severity ${row.severity}, radius ${row.radius_m} m${tag}`,
      );
    for (const u of updates)
      console.log(`  coverage ${u.spot} v${u.version} -> ${u.coverage_score}${tag}`);
    if (updates.length === 0) console.log(`  coverage scores already set`);
    if (dryRun || (!insert && updates.length === 0)) continue;

    let gapId: string | null = null;
    if (insert) {
      const { data: inserted, error: insertError } = await db
        .from("gaps")
        .insert(insert)
        .select("id")
        .single();
      if (insertError) fail(`Could not insert the gap: ${insertError.message}`);
      gapId = inserted.id;
    }
    for (const u of updates) {
      const { error: updateError } = await db
        .from("worlds")
        .update({ coverage_score: u.coverage_score })
        .eq("id", u.id);
      if (updateError)
        fail(`Could not set coverage of ${u.spot} v${u.version}: ${updateError.message}`);
    }

    const kitchen = updates.find((u) => u.version === known.version && u.spot === known.spot);
    await logEvent({
      actor_type: "agent",
      actor_name: "Verifier",
      agent: "verifier",
      action: "gap.marked",
      summary: insert
        ? `Flagged an AI-invented wall in the ${known.room.toLowerCase()} 3D (v${known.version}): photos ${known.missingPhotos.join(" and ")} were skipped`
        : `Set the 3D coverage scores from the ring photos (${known.room.toLowerCase()} v${known.version}: ${Math.round((kitchen?.coverage_score ?? 0) * 100)}%)`,
      listing_id: known.listingId,
      payload: {
        world_id: world.id,
        gap_id: gapId,
        position: row.position,
        coverage: updates.map((u) => ({
          spot: u.spot,
          version: u.version,
          score: u.coverage_score,
        })),
        coverage_source: "ring photo count",
      },
    });
  }
}

async function main() {
  if (values["mark-known"]) return markKnown(values["dry-run"]);
  fail(
    "The automatic gap check is not built yet (GH-19 part 2; see docs/tickets/GH-19.md).\n" +
      "Available now: pnpm gaps --mark-known [--dry-run] stores the known invented kitchen wall of hero 2 v1 and the coverage scores.",
  );
}

main().catch((error: unknown) => fail(error instanceof Error ? error.message : String(error)));
