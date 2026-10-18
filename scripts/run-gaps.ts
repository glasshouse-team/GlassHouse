/**
 * Gap check of the 3D worlds (GH-19, owner: Temuri). See docs/tickets/GH-19.md.
 *
 *   pnpm gaps --mark-known            store the known invented areas (tools/verifier/known-gap.ts)
 *                                     and the ring-photo coverage scores; safe to re-run
 *   pnpm gaps --mark-known --dry-run  print what it would write, write nothing
 *   pnpm gaps --check hero-2 [--version 1] [--spot kitchen] [--out dir]
 *             [--rings ~/Desktop/house] [--runs 3] [--no-confirm] [--evaluate 3]
 *                                     automatic Verifier check (tools/verifier/gaps.ts, D-046):
 *                                     each view against the real photos facing that way (the
 *                                     spot's ring under --rings <root>/<room>/middle, read-only;
 *                                     else listing photos), voted over 3 runs, then a second look;
 *                                     prints the findings and the measured numbers, writes nothing
 *   pnpm gaps --check hero-2 --write  also stores the gaps, only when the measured evaluation met
 *                                     the target (MEASURED_HERO2) and this pass found the known
 *                                     gap; keeps the known gap and gaps a host acted on, never
 *                                     writes archived versions; --coverage stores coverage_score
 *                                     too (never on the ring-scored kitchen v1, D-041)
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
import { Vec3Schema, type Vec3 } from "@/lib/schemas/world";
import {
  checkSpotWorld,
  isKnownGapRow,
  knownGapsFor,
  MIN_SEVERITY,
  saveSpotCheck,
  type SpotCheck,
} from "@/tools/verifier/gaps";
import {
  falseGaps,
  foundNear,
  MEASURED_HERO2,
  targetMet,
  writeGate,
  type EvaluationNumbers,
} from "@/tools/verifier/gap-vote";
import { findRingDir, loadRingFolder, type RingPhoto } from "@/tools/verifier/ring-photos";

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
    rings: { type: "string" },
    runs: { type: "string" },
    "no-confirm": { type: "boolean", default: false },
    evaluate: { type: "string" },
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

type CheckWorld = {
  id: string;
  version: number;
  spot: string;
  spot_label: string | null;
  status: string;
  pano_url: string | null;
  collider_mesh_url: string | null;
  metric_scale_factor: number | null;
};

function printCheck(slug: string, w: CheckWorld, result: SpotCheck, ms: number | null) {
  console.log(
    `\n${slug} v${w.version} ${w.spot} (world ${w.id}, ${w.status}): ${result.realFrames} ${result.referenceSource}, ` +
      `${result.runs.length} runs, coverage ${result.coverage === null ? "-" : result.coverage.toFixed(2)}, ` +
      `${result.usage.inputTokens} in / ${result.usage.outputTokens} out tokens${ms === null ? " (shared files)" : `, ${ms} ms`}`,
  );
  result.runs.forEach((run, i) => {
    const flagged = run.views.filter((f) => f.issue !== "none");
    console.log(
      `  run ${i + 1}: ${flagged.length ? flagged.map((f) => `${f.view_id} ${f.issue} s${f.severity ?? "-"}`).join(", ") : "all views clean"}; ` +
        `${result.runGaps[i].length} gaps`,
    );
  });
  for (const g of result.voted) {
    const drop = result.dropped.find((d) => d.gap === g);
    console.log(
      `  ${drop ? "dropped" : "GAP"} ${g.issue} s${g.severity} at ${JSON.stringify(g.position)} ` +
        `(runs ${g.runs.map((r) => r + 1).join(",")}; views ${g.viewIds.join(",")}): ${g.description}` +
        (drop ? `\n    photos show it: ${drop.reason}` : ""),
    );
  }
  if (result.voted.length === 0) console.log("  no gap found by 2 of the runs");
}

/** Ring photos of a spot under `--rings` (read-only), or undefined when the folder has none. */
async function ringFor(w: CheckWorld): Promise<RingPhoto[] | undefined> {
  if (!values.rings) return undefined;
  const dir = await findRingDir(path.resolve(values.rings), w.spot, w.spot_label);
  if (!dir) {
    console.log(`  (no ring folder for ${w.spot} under ${values.rings}; using listing photos)`);
    return undefined;
  }
  const ring = await loadRingFolder(dir);
  return ring.length ? ring : undefined;
}

/** One pass over the worlds; worlds that share files (D-031) are checked once. */
async function checkAll(slug: string, worlds: CheckWorld[]) {
  const byFiles = new Map<string, SpotCheck>();
  const out: { world: CheckWorld; result: SpotCheck }[] = [];
  for (const w of worlds) {
    // Same panorama, collider and scale = the same world files (positions depend on all three).
    const filesKey = `${w.pano_url}|${w.collider_mesh_url}|${w.metric_scale_factor}`;
    const shared = byFiles.get(filesKey);
    const started = Date.now();
    const result = shared
      ? { ...shared, worldId: w.id, version: w.version }
      : await checkSpotWorld(w.id, {
          ring: await ringFor(w),
          runs: values.runs ? Number(values.runs) : undefined,
          confirm: !values["no-confirm"],
        });
    if (!shared) byFiles.set(filesKey, result);
    printCheck(slug, w, result, shared ? null : Date.now() - started);
    if (values.out && !shared) {
      const dir = path.resolve(values.out, `${slug}-v${w.version}-${w.spot}`);
      mkdirSync(dir, { recursive: true });
      for (const [id, jpeg] of result.viewImages) writeFileSync(path.join(dir, `${id}.jpg`), jpeg);
      writeFileSync(
        path.join(dir, "result.json"),
        JSON.stringify(
          { runs: result.runs, voted: result.voted, dropped: result.dropped },
          null,
          2,
        ),
      );
    }
    out.push({ world: w, result });
  }
  return out;
}

/** Stored position of each known gap (D-041) of a listing, by world id. */
async function knownPositions(worlds: CheckWorld[], listingId: string) {
  const db = supabaseAdmin();
  const positions = new Map<string, Vec3[]>();
  for (const w of worlds) {
    const known = knownGapsFor({ listing_id: listingId, version: w.version, spot: w.spot });
    if (!known.length) continue;
    const { data, error } = await db
      .from("gaps")
      .select("issue, room, position")
      .eq("world_id", w.id);
    if (error) fail(`Could not load gaps: ${error.message}`);
    const list = (data ?? [])
      .filter((g) => isKnownGapRow(g, known))
      .map((g) => Vec3Schema.safeParse(g.position))
      .filter((p) => p.success)
      .map((p) => p.data);
    if (!list.length)
      fail(`The known gap of ${w.spot} v${w.version} is not stored; run --mark-known first.`);
    positions.set(w.id, list);
  }
  return positions;
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
  // Archived versions are checked too (dry run; the evaluation compares v1 with v2), never written.
  let query = db
    .from("worlds")
    .select(
      "id, version, spot, spot_label, status, pano_url, collider_mesh_url, metric_scale_factor",
    )
    .eq("listing_id", row.id)
    .in("status", ["ready", "published", "archived"])
    .not("pano_url", "is", null);
  if (values.version) query = query.eq("version", Number(values.version));
  if (values.spot) query = query.eq("spot", values.spot);
  const { data: worlds, error: worldsError } = await query.order("version").order("spot");
  if (worldsError) fail(`Could not load worlds: ${worldsError.message}`);
  if (!worlds?.length) fail("No ready, published or archived spot worlds with a panorama matched.");

  const known = await knownPositions(worlds, row.id);
  const evaluations = Math.max(1, Number(values.evaluate ?? 1));
  const tally: EvaluationNumbers = { knownFound: 0, evaluations: 0, maxFalseGapsV2: 0 };
  const latest = worlds.length ? worlds[worlds.length - 1].version : 0;
  let last: { world: CheckWorld; result: SpotCheck }[] = [];
  for (let e = 1; e <= evaluations; e++) {
    if (evaluations > 1) console.log(`\n===== evaluation ${e} of ${evaluations} =====`);
    last = await checkAll(row.slug, worlds);
    let foundAll = known.size > 0;
    let falseLatest = 0;
    let falseOther = 0;
    for (const { world, result } of last) {
      const kp = known.get(world.id) ?? [];
      if (kp.length && !kp.every((p) => foundNear(result.gaps, p))) foundAll = false;
      const extra = falseGaps(result.gaps, kp, MIN_SEVERITY).length;
      if (world.version === latest) falseLatest += extra;
      else falseOther += extra;
    }
    tally.evaluations++;
    if (foundAll) tally.knownFound++;
    tally.maxFalseGapsV2 = Math.max(tally.maxFalseGapsV2, falseLatest);
    console.log(
      `\nevaluation ${e}: known gap ${known.size === 0 ? "n/a" : foundAll ? "FOUND within 1 m" : "MISSED"}; ` +
        `false gaps (severity ${MIN_SEVERITY}+): v${latest} ${falseLatest}, older versions ${falseOther}`,
    );
  }
  if (known.size > 0)
    console.log(
      `\nmeasured: known gap found in ${tally.knownFound} of ${tally.evaluations} evaluations; ` +
        `at most ${tally.maxFalseGapsV2} false gaps on v${latest}; D-046 target ${targetMet(tally) ? "met" : "NOT met"}`,
    );

  if (!values.write) {
    console.log("\n(dry run, nothing saved; add --write to store)");
    return;
  }
  // --write only stores what a check proven reliable on hero 2 finds (D-046).
  const gate = writeGate(
    MEASURED_HERO2,
    last.map(({ world, result }) => ({
      missedKnown: (known.get(world.id) ?? []).some((p) => !foundNear(result.gaps, p)),
    })),
  );
  if (!gate.ok) fail(`--write refused: ${gate.reason}. Nothing was saved.`);
  for (const { world, result } of last) {
    if (world.status === "archived") {
      console.log(`  v${world.version} ${world.spot}: archived, not written`);
      continue;
    }
    const saved = await saveSpotCheck(result, { coverage: values.coverage });
    console.log(
      `  v${world.version} ${world.spot}: saved ${saved.inserted} gaps, kept ${saved.kept}, removed ${saved.deleted} old automatic gaps`,
    );
  }
}

async function main() {
  if (values["mark-known"]) return markKnown(values["dry-run"]);
  if (values.check) return check(values.check);
  fail(
    "Usage: pnpm gaps --mark-known [--dry-run] | pnpm gaps --check <listing> [--version n] [--spot s] [--rings dir] [--runs n] [--no-confirm] [--evaluate n] [--out dir] [--write [--coverage]]",
  );
}

main().catch((error: unknown) => fail(error instanceof Error ? error.message : String(error)));
