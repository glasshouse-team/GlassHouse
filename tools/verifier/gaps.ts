/**
 * Automatic gap check of one spot world (GH-19, owner: Temuri). Server or script only.
 * Views: six crops of the world's panorama from our storage (tools/verifier/gap-views.ts).
 * Claude (agentModel) compares them with up to 4 real listing photos of the same room and
 * answers GapCheckResultSchema; code casts a ray per finding into the collider, merges gaps
 * within 1 m and scores coverage. No World Labs calls.
 *
 * `checkSpotWorld` only reads. `saveSpotCheck` writes: it replaces this check's own earlier open
 * gaps of the world, never a known gap (tools/verifier/known-gap.ts, D-041) and never a gap a host
 * already acted on, and skips findings within 1 m of a gap it keeps.
 */
import { generateText, NoObjectGeneratedError, Output, type LanguageModel } from "ai";
import sharp from "sharp";
import { loadPrompt } from "@/agents/load-prompt";
import { castRay, colliderFromGlb } from "@/components/tour/collider-mesh";
import { agentModel } from "@/lib/claude";
import { logEvent } from "@/lib/events";
import { isOurStorage } from "@/lib/geometry/store-floorplans";
import { GapCheckResultSchema, type GapCheckResult } from "@/lib/schemas/verifier";
import { Vec3Schema, type Vec3 } from "@/lib/schemas/world";
import { supabaseAdmin } from "@/lib/supabase";
import {
  GAP_RADIUS_M,
  gapCandidates,
  mergeGaps,
  nearAny,
  placeAlongRay,
  viewCoverage,
  type PlacedGap,
} from "./gap-findings";
import { cropView, viewSpecs, type RgbImage, type ViewSpec } from "./gap-views";
import { KNOWN_GAPS, type KnownGap } from "./known-gap";
import { prepareImage } from "./xray";

/** Findings below this severity are printed but not stored. */
export const MIN_SEVERITY = 2;

/** Real frames per check (GH-19). */
const MAX_REAL_FRAMES = 4;

export interface SpotCheck {
  worldId: string;
  listingId: string;
  version: number;
  spot: string;
  room: string;
  views: ViewSpec[];
  /** JPEG bytes per view id, for `--out` and debugging. */
  viewImages: Map<string, Buffer>;
  realFrames: number;
  result: GapCheckResult;
  gaps: PlacedGap[];
  coverage: number | null;
  usage: { inputTokens: number; outputTokens: number };
}

async function download(url: string, what: string): Promise<Buffer> {
  if (!isOurStorage(url)) throw new Error(`${what} is not in our storage (${url})`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not download ${what} ${url}: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function decodeRgb(bytes: Buffer): Promise<RgbImage> {
  const { data, info } = await sharp(bytes)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data: new Uint8Array(data) };
}

function encodeJpeg(img: RgbImage): Promise<Buffer> {
  return sharp(Buffer.from(img.data), {
    raw: { width: img.width, height: img.height, channels: 3 },
  })
    .jpeg({ quality: 85 })
    .toBuffer();
}

/** Listing photos whose room label names this spot ("kitchen", "living room"...). */
export function photosForSpot<P extends { room_label: string | null; sort: number }>(
  photos: readonly P[],
  spot: string,
  spotLabel: string | null,
  max = MAX_REAL_FRAMES,
): P[] {
  const names = [spot, spotLabel ?? ""].map((s) => s.toLowerCase().trim()).filter(Boolean);
  return [...photos]
    .filter((p) => {
      const label = (p.room_label ?? "").toLowerCase().trim();
      return label && names.some((n) => n.includes(label) || label.includes(n));
    })
    .sort((a, b) => a.sort - b.sort)
    .slice(0, max);
}

async function askVerifier(
  model: LanguageModel,
  room: string,
  views: ViewSpec[],
  viewImages: Map<string, Buffer>,
  frames: Buffer[],
): Promise<{ result: GapCheckResult; usage: SpotCheck["usage"] }> {
  const content = [
    ...views.flatMap((v) => [
      { type: "text" as const, text: `${v.id} (3D screenshot):` },
      { type: "file" as const, mediaType: "image/jpeg", data: viewImages.get(v.id)! },
    ]),
    ...frames.flatMap((f, i) => [
      { type: "text" as const, text: `real_frame_${i + 1} (photo the host took in this room):` },
      { type: "file" as const, mediaType: "image/jpeg", data: f },
    ]),
    {
      type: "text" as const,
      text: `Report exactly one finding for each of ${views.map((v) => v.id).join(", ")}.`,
    },
  ];
  const usage = { inputTokens: 0, outputTokens: 0 };
  for (let attempt = 1; ; attempt++) {
    try {
      const { output, usage: used } = await generateText({
        model,
        output: Output.object({ schema: GapCheckResultSchema }),
        system: loadPrompt("verifier-gaps", { room }),
        messages: [{ role: "user", content }],
      });
      usage.inputTokens += used.inputTokens ?? 0;
      usage.outputTokens += used.outputTokens ?? 0;
      return { result: output, usage };
    } catch (error) {
      if (!NoObjectGeneratedError.isInstance(error) || attempt >= 2) throw error;
    }
  }
}

/** Runs the check on one spot world. Reads only. */
export async function checkSpotWorld(
  worldId: string,
  options: { model?: LanguageModel } = {},
): Promise<SpotCheck> {
  const db = supabaseAdmin();
  const { data: world, error } = await db
    .from("worlds")
    .select(
      "id, listing_id, version, spot, spot_label, pano_url, collider_mesh_url, metric_scale_factor",
    )
    .eq("id", worldId)
    .maybeSingle();
  if (error) throw new Error(`Could not load world ${worldId}: ${error.message}`);
  if (!world) throw new Error(`World ${worldId} not found`);
  if (!world.pano_url || !world.collider_mesh_url || !world.metric_scale_factor)
    throw new Error(`World ${worldId} (${world.spot}) has no panorama, collider or scale`);

  const { data: photos, error: photoError } = await db
    .from("listing_photos")
    .select("url, room_label, sort")
    .eq("listing_id", world.listing_id);
  if (photoError) throw new Error(`Could not load photos: ${photoError.message}`);
  const room = world.spot_label ?? world.spot;
  const realPhotos = photosForSpot(photos ?? [], world.spot, world.spot_label);

  const [pano, colliderBytes, frames] = await Promise.all([
    download(world.pano_url, "panorama").then(decodeRgb),
    download(world.collider_mesh_url, "collider"),
    Promise.all(realPhotos.map((p) => prepareImage(p.url))),
  ]);

  const views = viewSpecs();
  const viewImages = new Map<string, Buffer>();
  for (const v of views) viewImages.set(v.id, await encodeJpeg(cropView(pano, v.yaw)));

  const { result, usage } = await askVerifier(
    options.model ?? agentModel(),
    room,
    views,
    viewImages,
    frames,
  );

  const collider = colliderFromGlb(new Uint8Array(colliderBytes), world.metric_scale_factor);
  let placed: PlacedGap[];
  try {
    // The panorama is taken from the capture camera: the spot centre, at its height above the floor.
    const origin: Vec3 = { x: 0, y: -collider.floorY, z: 0 };
    const candidates = gapCandidates(result, views).map((c) => {
      const hits = castRay(collider, origin, c.dir);
      const distance = hits.length ? Math.min(...hits.map((h) => h.distance)) : null;
      return { ...c, position: placeAlongRay(origin, c.dir, distance) };
    });
    placed = mergeGaps(candidates);
  } finally {
    collider.dispose();
  }

  return {
    worldId,
    listingId: world.listing_id,
    version: world.version,
    spot: world.spot,
    room,
    views,
    viewImages,
    realFrames: frames.length,
    result,
    gaps: placed,
    coverage: viewCoverage(result, views.length),
    usage,
  };
}

/** The known gaps (D-041) of a spot world. */
export function knownGapsFor(w: { listing_id: string; version: number; spot: string }): KnownGap[] {
  return KNOWN_GAPS.filter(
    (k) => k.listingId === w.listing_id && k.version === w.version && k.spot === w.spot,
  );
}

/**
 * True for a row with a known gap's (issue, room) in a known-gap world: the same key
 * `pnpm gaps --mark-known` uses (world, issue, room), so the check never removes or doubles it.
 */
export function isKnownGapRow(
  row: { issue: string; room: string | null },
  known: readonly KnownGap[],
): boolean {
  return known.some((k) => k.issue === row.issue && k.room === row.room);
}

export interface StoredGap {
  id: string;
  issue: string;
  room: string | null;
  description: string;
  status: string;
  position: unknown;
}

/**
 * What saving a check changes, pure: this check's earlier open gaps go (never a known gap
 * (D-041) or one a host already acted on); new gaps of severity 2 or more come in unless they are
 * within 1 m of a kept gap or share a known gap's (issue, room) key (the known gap already stands
 * for that). Severity 1 findings stay in the printout only (false-gap budget, GH-19).
 */
export function planGapWrite(
  existing: readonly StoredGap[],
  found: readonly PlacedGap[],
  room: string,
  known: readonly KnownGap[] = [],
  minSeverity = MIN_SEVERITY,
): { deleteIds: string[]; keep: StoredGap[]; insert: PlacedGap[] } {
  const keep = existing.filter((g) => isKnownGapRow(g, known) || g.status !== "open");
  const deleteIds = existing.filter((g) => !keep.includes(g)).map((g) => g.id);
  const keptPositions = keep.map((g) => {
    const parsed = Vec3Schema.safeParse(g.position);
    return parsed.success ? parsed.data : null;
  });
  const insert = found.filter(
    (g) =>
      g.severity >= minSeverity &&
      !nearAny(g.position, keptPositions) &&
      !isKnownGapRow({ issue: g.issue, room }, known),
  );
  return { deleteIds, keep, insert };
}

/**
 * Writes a check (see planGapWrite). With `coverage`, also sets coverage_score, except on a
 * world whose score comes from the ring count (D-041). Logs one Verifier event.
 */
export async function saveSpotCheck(
  check: SpotCheck,
  options: { coverage?: boolean } = {},
): Promise<{ inserted: number; kept: number; deleted: number }> {
  const db = supabaseAdmin();
  const { data: existing, error } = await db
    .from("gaps")
    .select("id, issue, room, description, status, position")
    .eq("world_id", check.worldId);
  if (error) throw new Error(`Could not load gaps: ${error.message}`);
  const world = { listing_id: check.listingId, version: check.version, spot: check.spot };
  const known = knownGapsFor(world);
  const plan = planGapWrite(existing ?? [], check.gaps, check.room, known);
  if (plan.deleteIds.length) {
    const { error: delError } = await db.from("gaps").delete().in("id", plan.deleteIds);
    if (delError) throw new Error(`Could not clear old gaps: ${delError.message}`);
  }
  if (plan.insert.length) {
    const { error: insError } = await db.from("gaps").insert(
      plan.insert.map((g) => ({
        world_id: check.worldId,
        room: check.room,
        issue: g.issue,
        description: g.description,
        severity: g.severity,
        position: g.position,
        view_dir: g.dir,
        radius_m: GAP_RADIUS_M,
        screenshot_url: null,
        status: "open",
      })),
    );
    if (insError) throw new Error(`Could not save gaps: ${insError.message}`);
  }
  // A known-gap world's score comes from its ring photo count (D-041).
  const ringScored = known.length > 0;
  const score = check.coverage;
  const writeCoverage = options.coverage === true && !ringScored && score !== null;
  if (writeCoverage) {
    const { error: covError } = await db
      .from("worlds")
      .update({ coverage_score: Math.round(score * 1000) / 1000 })
      .eq("id", check.worldId);
    if (covError) throw new Error(`Could not set coverage: ${covError.message}`);
  }
  const n = plan.insert.length;
  await logEvent({
    actor_type: "agent",
    actor_name: "Verifier",
    agent: "verifier",
    action: "gap.checked",
    summary: `Checked the ${check.room.toLowerCase()} 3D (v${check.version}): ${n} AI-filled ${n === 1 ? "area" : "areas"} found`,
    listing_id: check.listingId,
    payload: {
      world_id: check.worldId,
      gaps: n,
      kept: plan.keep.length,
      deleted: plan.deleteIds.length,
      coverage: writeCoverage ? score : null,
    },
  });
  return { inserted: n, kept: plan.keep.length, deleted: plan.deleteIds.length };
}
