/**
 * Gap check of the 3D worlds (GH-19, owner: Temuri). See docs/tickets/GH-19.md.
 *
 *   pnpm gaps --mark-known            store the known invented areas (tools/verifier/known-gap.ts)
 *                                     and the ring-photo coverage scores; safe to re-run
 *   pnpm gaps --mark-known --dry-run  print what it would write, write nothing
 *   pnpm gaps --check hero-2 [--version 1] [--spot kitchen] [--out dir]
 *                                     automatic Verifier check (tools/verifier/gaps.ts); prints
 *                                     the findings and writes nothing
 *   pnpm gaps --check hero-2 --write  also stores the gaps (keeps the known gap and gaps a host
 *                                     acted on); add --coverage to store coverage_score too
 *
 * No World Labs calls: panoramas and colliders come from our storage.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { castRay, colliderFromGlb } from "@/components/tour/collider-mesh";
import { logEvent } from "@/lib/events";
import { isOurStorage } from "@/lib/geometry/store-floorplans";
import { supabaseAdmin } from "@/lib/supabase";
import {
  KNOWN_GAPS,
  RING_SIZE,
  azimuthToDirection,
  coverageUpdates,
  knownGapRow,
  planKnownGap,
  rayOrigin,
  ringCoverage,
  type KnownGap,
} from "@/tools/verifier/known-gap";
import { checkSpotWorld, saveSpotCheck } from "@/tools/verifier/gaps";

const { values } = parseArgs({
  options: {
    "mark-known": { type: "boolean", default: false },
    "dry-run": { type: "boolean", default: false },
    check: { type: "string" },
    version: { type: "string" },
    spot: { type: "string" },
    write: { type: "boolean", default: false },
    coverage: { type: "boolean", default: false },
    out: { type: "string" },
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
      .select("id, world_id, issue, room, description, severity, radius_m, position, view_dir")
      .eq("world_id", world.id);
    if (gapsError) fail(`Could not load gaps: ${gapsError.message}`);

    const distance = await rayDistance(known, world);
    const row = knownGapRow(known, world.id, distance ?? MISS_DISTANCE_M);
    const write = planKnownGap(row, existing ?? []);
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

    if (write.kind === "none") console.log(`  gap ${write.id} already stored as it should be`);
    else if (write.kind === "update")
      console.log(`  update gap ${write.id}: ${Object.keys(write.changes).join(", ")}${tag}`);
    else
      console.log(
        `  insert gap: ${row.issue}, severity ${row.severity}, radius ${row.radius_m} m${tag}`,
      );
    for (const u of updates)
      console.log(`  coverage ${u.spot} v${u.version} -> ${u.coverage_score}${tag}`);
    if (updates.length === 0) console.log(`  coverage scores already set`);
    if (dryRun || (write.kind === "none" && updates.length === 0)) continue;

    let gapId: string = write.kind === "insert" ? "" : write.id;
    if (write.kind === "insert") {
      const { data: inserted, error: insertError } = await db
        .from("gaps")
        .insert(write.row)
        .select("id")
        .single();
      if (insertError) fail(`Could not insert the gap: ${insertError.message}`);
      gapId = inserted.id;
    } else if (write.kind === "update") {
      const { error: updateError } = await db.from("gaps").update(write.changes).eq("id", write.id);
      if (updateError) fail(`Could not update the gap: ${updateError.message}`);
    }
    for (const u of updates) {
      const { error: updateError } = await db
        .from("worlds")
        .update({ coverage_score: u.coverage_score })
        .eq("id", u.id);
      if (updateError)
        fail(`Could not set coverage of ${u.spot} v${u.version}: ${updateError.message}`);
    }

    const knownScore = ringCoverage(RING_SIZE, known.missingPhotos.length);
    await logEvent({
      actor_type: "agent",
      actor_name: "Verifier",
      agent: "verifier",
      action: "gap.marked",
      summary:
        write.kind === "update"
          ? `Updated the AI-invented wall marker in the ${known.room.toLowerCase()} 3D (v${known.version}): ${Object.keys(write.changes).join(", ")}`
          : write.kind === "insert"
            ? `Flagged an AI-invented wall in the ${known.room.toLowerCase()} 3D (v${known.version}): photos ${known.missingPhotos.join(" and ")} were skipped`
            : `Set the 3D coverage scores from the ring photos (${known.room.toLowerCase()} v${known.version}: ${Math.round(knownScore * 100)}%)`,
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

/** The automatic check on every spot world of a listing (or one version / spot). */
async function check(listing: string) {
  const db = supabaseAdmin();
  const byId = /^[0-9a-f-]{36}$/i.test(listing);
  const { data: row, error } = await db
    .from("listings")
    .select("id, slug")
    .eq(byId ? "id" : "slug", listing)
    .maybeSingle();
  if (error) fail(`Could not load listing: ${error.message}`);
  if (!row) fail(`No listing "${listing}"`);
  let query = db
    .from("worlds")
    .select("id, version, spot, pano_url")
    .eq("listing_id", row.id)
    .in("status", ["ready", "published"]);
  if (values.version) query = query.eq("version", Number(values.version));
  if (values.spot) query = query.eq("spot", values.spot);
  const { data: worlds, error: worldsError } = await query.order("version").order("spot");
  if (worldsError) fail(`Could not load worlds: ${worldsError.message}`);
  if (!worlds?.length) fail("No ready or published spot worlds matched.");

  // A version's unchanged spots share files with another version's rows (D-031): check each
  // panorama once and give every row that shares it the same findings.
  const byPano = new Map<string, Awaited<ReturnType<typeof checkSpotWorld>>>();
  for (const w of worlds) {
    const started = Date.now();
    const shared = w.pano_url ? byPano.get(w.pano_url) : undefined;
    const result = shared
      ? { ...shared, worldId: w.id, version: w.version }
      : await checkSpotWorld(w.id);
    if (w.pano_url && !shared) byPano.set(w.pano_url, result);
    if (shared)
      console.log(
        `\n(${w.spot} v${w.version} shares its panorama with v${shared.version}: same findings)`,
      );
    console.log(
      `\n${row.slug} v${w.version} ${w.spot} (world ${w.id}): ${result.realFrames} real frames, ` +
        `coverage ${result.coverage === null ? "-" : result.coverage.toFixed(2)}, ` +
        `${result.usage.inputTokens} in / ${result.usage.outputTokens} out tokens, ${Date.now() - started} ms`,
    );
    for (const f of result.result.views) {
      const box = f.bbox
        ? ` box ${[f.bbox.x, f.bbox.y, f.bbox.w, f.bbox.h].map((n) => n.toFixed(2)).join(",")}`
        : "";
      console.log(
        `  ${f.view_id} ${f.issue}${f.severity ? ` s${f.severity}` : ""}${box}: ${f.description}`,
      );
    }
    for (const g of result.gaps)
      console.log(
        `  gap ${g.issue} s${g.severity} at ${JSON.stringify(g.position)} (views ${g.viewIds.join(", ")})`,
      );
    for (const o of result.result.objects) console.log(`  object ${o.label} in ${o.view_id}`);
    if (values.out) {
      const dir = path.resolve(values.out, `${row.slug}-v${w.version}-${w.spot}`);
      mkdirSync(dir, { recursive: true });
      for (const [id, jpeg] of result.viewImages) writeFileSync(path.join(dir, `${id}.jpg`), jpeg);
      writeFileSync(path.join(dir, "result.json"), JSON.stringify(result.result, null, 2));
    }
    if (values.write) {
      const saved = await saveSpotCheck(result, { coverage: values.coverage });
      console.log(
        `  saved ${saved.inserted} gaps, kept ${saved.kept}, removed ${saved.deleted} old automatic gaps`,
      );
    } else console.log("  (dry run, nothing saved; add --write to store)");
  }
}

async function main() {
  if (values["mark-known"]) return markKnown(values["dry-run"]);
  if (values.check) return check(values.check);
  fail(
    "Usage: pnpm gaps --mark-known [--dry-run] | pnpm gaps --check <listing> [--version n] [--spot s] [--out dir] [--write [--coverage]]",
  );
}

main().catch((error: unknown) => fail(error instanceof Error ? error.message : String(error)));
