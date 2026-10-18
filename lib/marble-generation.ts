/**
 * Starting a new world version (owner: Temuri, GH-10). POST /api/worlds calls startVersion:
 * one Marble generation per captured spot (D-009), and a copy of every other spot's row
 * from the version guests see now, so the new version is a complete tour (D-031).
 * Server only. In demo mode savedVersion() answers instead and nothing calls World Labs.
 */
import type { Json, Tables } from "./database.types";
import { settings } from "./env";
import { logEvent } from "./events";
import { generateWorld, MarbleError, type MarbleModel, type WorldPrompt } from "./marble";
import { SPOT_WORLD_CREDITS, WorldRequestError, type EventActor } from "./marble-worlds";
import { VERSION_ROW_COLUMNS, type WorldVersionRow } from "./marble-versions";
import { SpotLinkSchema, type SpotLink } from "./schemas/world";
import { BUCKETS, publicMediaUrl, supabaseAdmin } from "./supabase";

/** World Labs: up to 4 images, or up to 8 with reconstruct_images (D-009). */
export const MAX_RING_PHOTOS = 8;
/** World Labs accepts longer videos, then fails after about 47 minutes (GH-3). */
export const VIDEO_MAX_SECONDS = 30;

const IMAGE_FILE = /\.(jpe?g|png|webp)$/i;

// ---------- Pure helpers ----------

/** "Living room" -> "living-room"; a spot key for `worlds.spot`. */
export function spotKey(label: string): string {
  return (
    label
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "main"
  );
}

/** Host text goes into a World Labs prompt: one line, short, no control characters. */
export function cleanLabel(label: string | null | undefined): string {
  const clean = (label ?? "")
    .replace(/[\p{Cc}\s]+/gu, " ")
    .trim()
    .slice(0, 40);
  return clean || "Main room";
}

/**
 * Azimuths for a ring in turning order: the recorded compass headings when there is one
 * per photo (relative to the first), else even steps (8 photos: 0, 45, ..., 315).
 */
export function ringAzimuths(count: number, headings: number[] = []): number[] {
  if (headings.length === count && count > 0) {
    return headings.map((h) => Math.round((((h - headings[0]) % 360) + 360) % 360));
  }
  return Array.from({ length: count }, (_, i) => Math.round((i * 360) / count) % 360);
}

/** Ring photo file names sorted the way they were taken ("ring-2" before "ring-10"). */
export function sortRingPhotos(names: string[]): string[] {
  return names
    .filter((n) => IMAGE_FILE.test(n))
    .sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
}

export interface CaptureMedia {
  label: string;
  /** Public URLs of the ring photos in turning order. */
  photos: string[];
  headings?: number[];
  videoUrl?: string | null;
  durationS?: number | null;
}

/** The World Labs prompt for one spot (marble-world-pipeline skill, GH-3 recipe). */
export function spotPrompt(media: CaptureMedia): {
  inputKind: "multi-image" | "image" | "video";
  prompt: WorldPrompt;
} {
  const room = media.label.toLowerCase();
  const keep = (what: string) =>
    `The ${room} of a real home, seen from its middle. Keep everything exactly as the ${what} shows; do not add objects, doors or windows that are not in it.`;
  const { photos } = media;
  if (photos.length > MAX_RING_PHOTOS) {
    throw new WorldRequestError(
      400,
      "too_many_photos",
      `A ring takes at most ${MAX_RING_PHOTOS} photos; drop the most redundant shot.`,
    );
  }
  if (photos.length >= 2) {
    const azimuths = ringAzimuths(photos.length, media.headings);
    return {
      inputKind: "multi-image",
      prompt: {
        type: "multi-image",
        multi_image_prompt: photos.map((uri, i) => ({
          azimuth: azimuths[i],
          content: { source: "uri", uri },
        })),
        reconstruct_images: photos.length > 4,
        text_prompt: keep("photo ring"),
      },
    };
  }
  if (photos.length === 1) {
    return {
      inputKind: "image",
      prompt: {
        type: "image",
        image_prompt: { source: "uri", uri: photos[0] },
        text_prompt: keep("photo"),
      },
    };
  }
  if (media.videoUrl) {
    if ((media.durationS ?? 0) > VIDEO_MAX_SECONDS) {
      throw new WorldRequestError(
        400,
        "video_too_long",
        `Videos must be ${VIDEO_MAX_SECONDS} s or shorter; run pnpm video:prepare.`,
      );
    }
    return {
      inputKind: "video",
      prompt: {
        type: "video",
        video_prompt: { source: "uri", uri: media.videoUrl },
        text_prompt: keep("video"),
      },
    };
  }
  throw new WorldRequestError(
    400,
    "capture_empty",
    `The ${room} capture has no photos or prepared video yet.`,
  );
}

export interface BaseSpot {
  spot: string;
  spot_label: string | null;
  links: SpotLink[];
}

/**
 * Which spot a capture re-shoots: the gap's spot for a fill-in, else the base spot whose
 * key or label matches the capture's room, else a new spot with no doorway links yet.
 */
export function resolveSpot(
  label: string,
  baseSpots: BaseSpot[],
  gapSpot?: string | null,
): { spot: string; spotLabel: string; links: SpotLink[] } {
  const key = spotKey(label);
  const lower = label.toLowerCase();
  const match =
    baseSpots.find((s) => gapSpot && s.spot === gapSpot) ??
    baseSpots.find((s) => s.spot === key || s.spot_label?.toLowerCase() === lower);
  if (match) {
    return { spot: match.spot, spotLabel: match.spot_label ?? label, links: match.links };
  }
  return { spot: gapSpot ?? key, spotLabel: label, links: [] };
}

/** The next version number: one above every version the listing has ever had. */
export function nextVersionNumber(versions: number[]): number {
  return versions.reduce((max, v) => Math.max(max, v), 0) + 1;
}

/** Display name for World Labs (max 64 characters, metadata only). */
export function displayName(title: string, spotLabel: string, version: number): string {
  return `${title} - ${spotLabel} v${version}`.slice(0, 64);
}

// ---------- Database ----------

type CaptureRow = Tables<"captures">;
type WorldRow = Tables<"worlds">;

function parseLinks(value: Json): SpotLink[] {
  const parsed = SpotLinkSchema.array().safeParse(value);
  return parsed.success ? parsed.data : [];
}

/**
 * The version guests see now (the published entry row's version), else the newest version
 * whose spots all finished. Its rows are what a new version copies.
 */
async function baseVersionRows(listingId: string): Promise<WorldRow[]> {
  const db = supabaseAdmin();
  const { data: listing } = await db
    .from("listings")
    .select("published_world_id")
    .eq("id", listingId)
    .maybeSingle();
  const { data: rows, error } = await db
    .from("worlds")
    .select("*")
    .eq("listing_id", listingId)
    .order("version", { ascending: false });
  if (error) throw new Error(`worlds lookup failed: ${error.message}`);
  const all = rows ?? [];
  const published = all.find((r) => r.id === listing?.published_world_id);
  if (published) return all.filter((r) => r.version === published.version);
  const finished = ["ready", "published", "archived"];
  const versions = [...new Set(all.map((r) => r.version))];
  const base = versions.find((v) =>
    all.filter((r) => r.version === v).every((r) => finished.includes(r.status)),
  );
  return base === undefined ? [] : all.filter((r) => r.version === base);
}

async function captureMedia(capture: CaptureRow): Promise<CaptureMedia> {
  const folder = `captures/${capture.listing_id}/${capture.id}`;
  const { data: files, error } = await supabaseAdmin()
    .storage.from(BUCKETS.media)
    .list(folder, { limit: 100 });
  if (error) throw new Error(`storage list failed: ${error.message}`);
  const names = (files ?? []).filter((f) => Number(f.metadata?.size ?? 1) > 0).map((f) => f.name);
  const headings = Array.isArray(capture.heading_track)
    ? (capture.heading_track as Array<{ heading?: unknown }>)
        .map((h) => h?.heading)
        .filter((h): h is number => typeof h === "number")
    : [];
  const markers = Array.isArray(capture.room_markers)
    ? (capture.room_markers as Array<{ room?: unknown }>)
    : [];
  const room = typeof markers[0]?.room === "string" ? markers[0].room : null;
  const video =
    capture.prepared_url ?? (names.includes("prepared.mp4") ? publicMediaUrl(`${folder}/prepared.mp4`) : null);
  return {
    label: cleanLabel(room),
    photos: sortRingPhotos(names).map((n) => publicMediaUrl(`${folder}/${n}`)),
    headings,
    videoUrl: video,
    durationS: capture.duration_s,
  };
}

async function gapSpot(gapId: string | null): Promise<string | null> {
  if (!gapId) return null;
  const db = supabaseAdmin();
  const { data: gap } = await db.from("gaps").select("world_id").eq("id", gapId).maybeSingle();
  if (!gap) return null;
  const { data: world } = await db.from("worlds").select("spot").eq("id", gap.world_id).maybeSingle();
  return world?.spot ?? null;
}

export interface StartedVersion {
  version: number;
  worlds: WorldVersionRow[];
  /** Spots whose generation could not start (their rows are `failed`). */
  failed: Array<{ spot: string; error: string }>;
}

/**
 * POST /api/worlds: the next version, one generation per capture (spot), copies of the
 * other spots (D-031). Rows are inserted before any credits are spent, so a double click
 * hits the unique (listing, version, spot) key and starts nothing twice.
 */
export async function startVersion(input: {
  listingId: string;
  listingTitle: string;
  captureIds: string[];
  actor: EventActor;
}): Promise<StartedVersion> {
  const db = supabaseAdmin();
  const { data: captures, error: capError } = await db
    .from("captures")
    .select("*")
    .eq("listing_id", input.listingId)
    .in("id", input.captureIds);
  if (capError) throw new Error(`captures lookup failed: ${capError.message}`);
  const found = new Map((captures ?? []).map((c) => [c.id, c]));
  const missing = input.captureIds.filter((id) => !found.has(id));
  if (missing.length) {
    throw new WorldRequestError(404, "capture_not_found", "A capture is not part of this home.");
  }

  const base = await baseVersionRows(input.listingId);
  const baseSpots: BaseSpot[] = base.map((r) => ({
    spot: r.spot,
    spot_label: r.spot_label,
    links: parseLinks(r.links),
  }));

  const planned: Array<{
    capture: CaptureRow;
    spot: string;
    spotLabel: string;
    links: SpotLink[];
    inputKind: "multi-image" | "image" | "video";
    prompt: WorldPrompt;
  }> = [];
  for (const id of input.captureIds) {
    const capture = found.get(id)!;
    if (capture.status === "failed") {
      throw new WorldRequestError(409, "capture_failed", "That capture failed; record it again.");
    }
    const media = await captureMedia(capture);
    const spot = resolveSpot(media.label, baseSpots, await gapSpot(capture.gap_id));
    const { inputKind, prompt } = spotPrompt({ ...media, label: spot.spotLabel });
    if (planned.some((p) => p.spot === spot.spot)) {
      throw new WorldRequestError(400, "duplicate_spot", `Two captures are for ${spot.spotLabel}.`);
    }
    planned.push({ capture, ...spot, inputKind, prompt });
  }

  const { data: versions, error: vError } = await db
    .from("worlds")
    .select("version")
    .eq("listing_id", input.listingId);
  if (vError) throw new Error(`worlds lookup failed: ${vError.message}`);
  const version = nextVersionNumber((versions ?? []).map((v) => v.version));
  const model = settings.marbleModel as MarbleModel;
  const now = new Date().toISOString();

  const regenerated = new Set(planned.map((p) => p.spot));
  const copies = base
    .filter((r) => !regenerated.has(r.spot))
    .map((r) => ({
      listing_id: input.listingId,
      version,
      spot: r.spot,
      spot_label: r.spot_label,
      links: r.links,
      status: "ready",
      model: r.model,
      input_kind: r.input_kind,
      input_capture_ids: r.input_capture_ids,
      marble_world_id: r.marble_world_id,
      spz_url: r.spz_url,
      spz_hq_url: r.spz_hq_url,
      collider_mesh_url: r.collider_mesh_url,
      hq_mesh_url: r.hq_mesh_url,
      pano_url: r.pano_url,
      thumbnail_url: r.thumbnail_url,
      caption: r.caption,
      metric_scale_factor: r.metric_scale_factor,
      ground_plane_offset: r.ground_plane_offset,
      coverage_score: r.coverage_score,
      cost_credits: 0,
      ready_at: now,
    }));
  const fresh = planned.map((p) => ({
    listing_id: input.listingId,
    version,
    spot: p.spot,
    spot_label: p.spotLabel,
    links: p.links as unknown as Json,
    status: "queued",
    model,
    input_kind: p.inputKind,
    input_capture_ids: [p.capture.id],
  }));
  const { data: inserted, error: insError } = await db
    .from("worlds")
    .insert([...fresh, ...copies])
    .select("id,spot");
  if (insError) {
    if (insError.code === "23505") {
      throw new WorldRequestError(409, "already_started", "A new version is already starting.");
    }
    throw new Error(`worlds insert failed: ${insError.message}`);
  }
  const ids = new Map((inserted ?? []).map((r) => [r.spot, r.id]));

  const failed: StartedVersion["failed"] = [];
  for (const p of planned) {
    const rowId = ids.get(p.spot)!;
    try {
      const op = await generateWorld({
        world_prompt: p.prompt,
        display_name: displayName(input.listingTitle, p.spotLabel, version),
        model,
        tags: ["glasshouse", p.spot.slice(0, 32)],
      });
      const { error } = await db
        .from("worlds")
        .update({
          status: "generating",
          operation_id: op.operation_id,
          ...(op.response?.world_id ? { marble_world_id: op.response.world_id } : {}),
        })
        .eq("id", rowId);
      if (error) throw new Error(`worlds update failed: ${error.message}`);
    } catch (error) {
      const message = error instanceof MarbleError ? error.message : "Could not start the generation";
      if (!(error instanceof MarbleError)) console.error(error);
      failed.push({ spot: p.spot, error: message });
      await db.from("worlds").update({ status: "failed", error: message }).eq("id", rowId);
    }
  }

  const started = planned.length - failed.length;
  const names = planned.map((p) => p.spotLabel).join(", ");
  await logEvent({
    actor_type: input.actor.type,
    actor_name: input.actor.name,
    action: started ? "world.generating" : "world.failed",
    summary: started
      ? `World v${version} generating for ${input.listingTitle}: ${names} (about ${(started * SPOT_WORLD_CREDITS).toLocaleString("en-US")} credits)`
      : `World v${version} could not start for ${input.listingTitle}: ${failed[0]?.error}`,
    listing_id: input.listingId,
    payload: {
      version,
      spots: planned.map((p) => p.spot),
      copied_spots: copies.map((c) => c.spot),
      failed,
    },
  });

  return { version, worlds: await versionRows(input.listingId, version), failed };
}

/** The rows of one version, or of every version when `version` is omitted. */
export async function versionRows(listingId: string, version?: number): Promise<WorldVersionRow[]> {
  let query = supabaseAdmin()
    .from("worlds")
    .select(VERSION_ROW_COLUMNS)
    .eq("listing_id", listingId);
  if (version !== undefined) query = query.eq("version", version);
  const { data, error } = await query.order("version", { ascending: false });
  if (error) throw new Error(`worlds lookup failed: ${error.message}`);
  return (data ?? []) as WorldVersionRow[];
}

/**
 * DEMO_MODE: the version guests see now (or the newest finished one), with no insert and
 * no World Labs call. Null when the listing has no saved world.
 */
export async function savedVersion(
  listingId: string,
): Promise<{ version: number; worlds: WorldVersionRow[] } | null> {
  const base = await baseVersionRows(listingId);
  if (!base.length) return null;
  const version = base[0].version;
  return { version, worlds: await versionRows(listingId, version) };
}

/** The entry spot guests start at now, for the versions panel. */
export async function entrySpot(listingId: string): Promise<string | null> {
  const db = supabaseAdmin();
  const { data: listing } = await db
    .from("listings")
    .select("published_world_id")
    .eq("id", listingId)
    .maybeSingle();
  if (!listing?.published_world_id) return null;
  const { data } = await db
    .from("worlds")
    .select("spot")
    .eq("id", listing.published_world_id)
    .maybeSingle();
  return data?.spot ?? null;
}

/** Spots of the base version, for the "re-shoot a spot" picker. */
export async function baseSpots(listingId: string): Promise<Array<{ spot: string; label: string }>> {
  return (await baseVersionRows(listingId))
    .map((r) => ({ spot: r.spot, label: r.spot_label ?? r.spot }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
