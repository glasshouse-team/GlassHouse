/**
 * Automatic gap check of one spot world (GH-19, owner: Temuri). Server or script only.
 * Views: six crops of the world's panorama from our storage (tools/verifier/gap-views.ts).
 * D-046: each view is checked on its own against the real photos facing the same way (the spot's
 * 8-photo ring when the caller has it, else up to 4 listing photos of the room), 3 times; a gap
 * stays only when 2 of the 3 runs place one within 1 m (tools/verifier/gap-vote.ts), and then
 * only when a second look (red box on the view + the facing photos) says the photos do not show
 * that content. Code casts the rays into the collider and scores coverage. No World Labs calls.
 *
 * `checkSpotWorld` only reads. `saveSpotCheck` writes: it replaces the world's open gaps (gaps has
 * no source column, so every open gap counts as an earlier automatic one) except a known gap
 * (tools/verifier/known-gap.ts, D-041); gaps a host acted on stay. Findings within 1 m of a kept
 * gap, and in a known-gap world findings with that gap's (issue, room), are not stored.
 */
import {
  generateText,
  NoObjectGeneratedError,
  Output,
  type LanguageModel,
  type UserContent,
} from "ai";
import type { z } from "zod";
import sharp from "sharp";
import { loadPrompt } from "@/agents/load-prompt";
import { castRay, colliderFromGlb } from "@/components/tour/collider-mesh";
import { agentModel } from "@/lib/claude";
import { logEvent } from "@/lib/events";
import { isOurStorage } from "@/lib/geometry/store-floorplans";
import {
  GapConfirmSchema,
  ViewCheckSchema,
  type GapCheckResult,
  type ViewCheck,
} from "@/lib/schemas/verifier";
import { Vec3Schema, type Vec3 } from "@/lib/schemas/world";
import { supabaseAdmin } from "@/lib/supabase";
import {
  GAP_RADIUS_M,
  gapCandidates,
  mergeGaps,
  nearAny,
  placeAlongRay,
  type PlacedGap,
} from "./gap-findings";
import { MIN_VOTES, VOTE_RUNS, voteGaps, type VotedGap } from "./gap-vote";
import { cropView, directionAzimuth, viewSpecs, type RgbImage, type ViewSpec } from "./gap-views";
import { KNOWN_GAPS, type KnownGap } from "./known-gap";
import { photosFacing, type RingPhoto } from "./ring-photos";
import { prepareImage } from "./xray";

/** Findings below this severity are printed but not stored. */
export const MIN_SEVERITY = 2;

/** Listing photos per check when there is no ring (GH-19). */
const MAX_REAL_FRAMES = 4;
/** Model calls in flight at once. */
export const MODEL_CONCURRENCY = 6;

/** A real photo the views are compared with. `azimuth` null: direction unknown (listing photo). */
export interface Reference {
  azimuth: number | null;
  jpeg: Buffer;
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
}

export interface DroppedGap {
  gap: VotedGap;
  reason: string;
}

export interface SpotCheck {
  worldId: string;
  listingId: string;
  version: number;
  spot: string;
  room: string;
  views: ViewSpec[];
  /** JPEG bytes per view id, for `--out` and debugging. */
  viewImages: Map<string, Buffer>;
  referenceSource: "ring" | "listing photos";
  realFrames: number;
  /** Every run's per-view findings (the first run's objects are the world's objects). */
  runs: GapCheckResult[];
  /** Every run's gaps after ray placement and the 1 m merge. */
  runGaps: PlacedGap[][];
  /** Gaps found by at least 2 runs (all runs' gaps when only one run was made). */
  voted: VotedGap[];
  /** Voted gaps the second look found in the real photos: not stored. */
  dropped: DroppedGap[];
  /** The result: voted and not dropped. */
  gaps: VotedGap[];
  /** Share of views without a remaining gap. */
  coverage: number | null;
  usage: Usage;
}

export interface CheckOptions {
  model?: LanguageModel;
  /** The spot's ring photos (read-only, from `loadRingFolder`); else listing photos of the room. */
  ring?: readonly RingPhoto[];
  /** Vision runs to vote over (default 3). */
  runs?: number;
  /** Second look at every voted gap (default true). */
  confirm?: boolean;
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

/**
 * The real photos a view (or a gap seen along `yaw`) is compared with: the ring photos facing
 * that way when the references have azimuths, else every reference (listing photos).
 */
export function referencesFor<R extends { azimuth: number | null }>(
  refs: readonly R[],
  yaw: number,
  max?: number,
): R[] {
  const ring = refs.filter((r): r is R & { azimuth: number } => r.azimuth !== null);
  if (ring.length) return photosFacing(ring, yaw, max);
  return refs.slice(0, max ?? MAX_REAL_FRAMES);
}

/** The six per-view answers of one run as one GapCheckResult (view ids added). */
export function assembleResult(
  views: readonly ViewSpec[],
  answers: readonly ViewCheck[],
): GapCheckResult {
  return {
    views: views.map((v, i) => ({
      view_id: v.id,
      issue: answers[i].issue,
      description: answers[i].description,
      bbox: answers[i].bbox,
      severity: answers[i].severity,
    })),
    objects: views.flatMap((v, i) =>
      answers[i].objects.map((o) => ({ view_id: v.id, label: o.label, bbox: o.bbox })),
    ),
  };
}

/** Share of the views no remaining gap was seen in, 0..1 (null without views). */
export function gapCoverage(
  views: readonly ViewSpec[],
  gaps: readonly { viewIds: readonly string[] }[],
): number | null {
  if (views.length === 0) return null;
  const hit = new Set(gaps.flatMap((g) => g.viewIds));
  return views.filter((v) => !hit.has(v.id)).length / views.length;
}

/** Runs `fn` over `items` with at most `limit` in flight; results in input order. */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return out;
}

/** The view image with the suspected area outlined in red, for the second look. */
async function drawBox(
  jpeg: Buffer,
  bbox: { x: number; y: number; w: number; h: number },
): Promise<Buffer> {
  const { width = 512, height = 512 } = await sharp(jpeg).metadata();
  const c = (v: number) => Math.min(1, Math.max(0, v));
  const x = Math.round(c(bbox.x) * width);
  const y = Math.round(c(bbox.y) * height);
  const w = Math.max(8, Math.round(c(bbox.w) * width));
  const h = Math.max(8, Math.round(c(bbox.h) * height));
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="#ff0000" stroke-width="5"/></svg>`;
  return sharp(jpeg)
    .composite([{ input: Buffer.from(svg) }])
    .jpeg({ quality: 85 })
    .toBuffer();
}

function refContent(refs: readonly Reference[]) {
  return refs.flatMap((r, i) => [
    {
      type: "text" as const,
      text:
        r.azimuth === null
          ? `real_photo_${i + 1} (taken by the host in this room, direction unknown):`
          : `real_photo_${i + 1} (taken by the host from the same spot, facing ${Math.round(r.azimuth)} deg):`,
    },
    { type: "file" as const, mediaType: "image/jpeg", data: r.jpeg },
  ]);
}

/** One structured call, retried once when the answer does not fit the schema. */
async function ask<S extends z.ZodType>(
  model: LanguageModel,
  schema: S,
  system: string,
  content: UserContent,
  usage: Usage,
): Promise<z.infer<S>> {
  for (let attempt = 1; ; attempt++) {
    try {
      const { output, usage: used } = await generateText({
        model,
        output: Output.object({ schema }),
        system,
        messages: [{ role: "user", content }],
      });
      usage.inputTokens += used.inputTokens ?? 0;
      usage.outputTokens += used.outputTokens ?? 0;
      return output as z.infer<S>;
    } catch (error) {
      if (!NoObjectGeneratedError.isInstance(error) || attempt >= 2) throw error;
      usage.inputTokens += error.usage?.inputTokens ?? 0;
      usage.outputTokens += error.usage?.outputTokens ?? 0;
    }
  }
}

/** The room name as it goes into the prompt: host text, so letters, digits and spaces only. */
export function promptRoom(room: string): string {
  return (
    room
      .replace(/[^\p{L}\p{N} ]+/gu, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 40) || "room"
  );
}

/** Runs the check on one spot world. Reads only. */
export async function checkSpotWorld(
  worldId: string,
  options: CheckOptions = {},
): Promise<SpotCheck> {
  const model = options.model ?? agentModel();
  const runCount = Math.max(1, options.runs ?? VOTE_RUNS);
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
  const room = world.spot_label ?? world.spot;

  let refs: Reference[];
  if (options.ring?.length) {
    refs = options.ring.map((p) => ({ azimuth: p.azimuth, jpeg: p.jpeg }));
  } else {
    const { data: photos, error: photoError } = await db
      .from("listing_photos")
      .select("url, room_label, sort")
      .eq("listing_id", world.listing_id);
    if (photoError) throw new Error(`Could not load photos: ${photoError.message}`);
    const realPhotos = photosForSpot(photos ?? [], world.spot, world.spot_label);
    // Listing photos may be seed URLs outside our storage (as in the X-ray); they are images only.
    const jpegs = await Promise.all(realPhotos.map((p) => prepareImage(p.url)));
    refs = jpegs.map((jpeg) => ({ azimuth: null, jpeg }));
  }

  const [pano, colliderBytes] = await Promise.all([
    download(world.pano_url, "panorama").then(decodeRgb),
    download(world.collider_mesh_url, "collider"),
  ]);
  const views = viewSpecs();
  const viewImages = new Map<string, Buffer>();
  for (const v of views) viewImages.set(v.id, await encodeJpeg(cropView(pano, v.yaw)));

  const usage: Usage = { inputTokens: 0, outputTokens: 0 };
  const system = loadPrompt("verifier-gaps", { room: promptRoom(room) });
  const jobs = Array.from({ length: runCount }, (_, run) => views.map((v) => ({ run, v }))).flat();
  const answers = await mapLimit(jobs, MODEL_CONCURRENCY, ({ v }) =>
    ask(
      model,
      ViewCheckSchema,
      system,
      [
        { type: "text", text: `3D view ${v.id} (facing ${v.yaw} deg):` },
        { type: "file", mediaType: "image/jpeg", data: viewImages.get(v.id)! },
        ...refContent(referencesFor(refs, v.yaw)),
        { type: "text", text: `Report the finding for 3D view ${v.id}.` },
      ],
      usage,
    ),
  );
  const runs = Array.from({ length: runCount }, (_, run) =>
    assembleResult(
      views,
      views.map((_, i) => answers[run * views.length + i]),
    ),
  );

  const collider = colliderFromGlb(new Uint8Array(colliderBytes), world.metric_scale_factor);
  let runGaps: PlacedGap[][];
  try {
    // The panorama is taken from the capture camera: the spot centre, at its height above the floor.
    const origin: Vec3 = { x: 0, y: -collider.floorY, z: 0 };
    runGaps = runs.map((result) =>
      mergeGaps(
        gapCandidates(result, views).map((c) => {
          const hits = castRay(collider, origin, c.dir);
          const distance = hits.length ? Math.min(...hits.map((h) => h.distance)) : null;
          return { ...c, position: placeAlongRay(origin, c.dir, distance) };
        }),
      ),
    );
  } finally {
    collider.dispose();
  }

  const voted = voteGaps(runGaps, { minVotes: Math.min(MIN_VOTES, runCount) });
  const dropped: DroppedGap[] = [];
  const gaps: VotedGap[] = [];
  if (options.confirm === false || refs.length === 0) gaps.push(...voted);
  else {
    const confirmSystem = loadPrompt("verifier-gaps-confirm", { room: promptRoom(room) });
    const looks = await mapLimit(voted, MODEL_CONCURRENCY, async (g) => {
      const image = viewImages.get(g.viewId)!;
      const boxed = g.bbox ? await drawBox(image, g.bbox) : image;
      return ask(
        model,
        GapConfirmSchema,
        confirmSystem,
        [
          { type: "text", text: "3D view with the suspected area in the red box:" },
          { type: "file", mediaType: "image/jpeg", data: boxed },
          ...refContent(referencesFor(refs, directionAzimuth(g.dir))),
          { type: "text", text: "Do the real photos show what is inside the red box?" },
        ],
        usage,
      );
    });
    voted.forEach((g, i) => {
      if (looks[i].shown_in_photos) dropped.push({ gap: g, reason: looks[i].reason });
      else gaps.push(g);
    });
  }

  return {
    worldId,
    listingId: world.listing_id,
    version: world.version,
    spot: world.spot,
    room,
    views,
    viewImages,
    referenceSource: options.ring?.length ? "ring" : "listing photos",
    realFrames: refs.length,
    runs,
    runGaps,
    voted,
    dropped,
    gaps,
    coverage: gapCoverage(views, gaps),
    usage,
  };
}

/** A check as JSON (POST /api/worlds/[id]/gaps): findings only, no images; never saved. */
export function checkSummary(check: SpotCheck) {
  const gap = (g: VotedGap) => ({
    issue: g.issue,
    severity: g.severity,
    description: g.description,
    position: g.position,
    viewIds: g.viewIds,
    votes: g.runs.length,
  });
  return {
    worldId: check.worldId,
    version: check.version,
    spot: check.spot,
    room: check.room,
    referenceSource: check.referenceSource,
    runs: check.runs.length,
    coverage: check.coverage,
    gaps: check.gaps.map(gap),
    dropped: check.dropped.map((d) => ({ ...gap(d.gap), reason: d.reason })),
    objects: check.runs[0]?.objects ?? [],
    saved: false as const,
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
  // Insert first, then delete the old rows by id: a failed insert leaves the old gaps in place.
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
  if (plan.deleteIds.length) {
    const { error: delError } = await db.from("gaps").delete().in("id", plan.deleteIds);
    if (delError) throw new Error(`Could not clear old gaps: ${delError.message}`);
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
