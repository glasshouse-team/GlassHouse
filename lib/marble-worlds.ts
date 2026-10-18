/**
 * World versions in OUR storage (owner: Temuri, GH-10). Shared by the `pnpm worlds` CLI,
 * the /api/worlds routes and GH-26's reset. Server only (service-role client).
 *
 * D-009: a version is a set of spot worlds, one `worlds` row per room spot, linked by
 * doorway arrows (`spot`, `spot_label`, `links`, migration 0002). Every asset is copied
 * from World Labs into `media/worlds/{row id}/` once; pages only ever read our URLs.
 * D-031: a spot world reused by another version (hero-2 v1 reuses 4 of v2's spots) shares
 * the files of the row that copied it first, so nothing is stored or downloaded twice.
 */
import { z } from "zod";
import type { Json } from "./database.types";
import { logEvent } from "./events";
import { getWorld, pickSplatUrls, worldScale, type MarbleWorld } from "./marble";
import { SpotLinkSchema, type SpotLink } from "./schemas/world";
import { BUCKETS, publicMediaUrl, supabaseAdmin } from "./supabase";

/** Supabase Free plan file limit (D-020). */
export const STORAGE_FILE_LIMIT = 50 * 1024 * 1024;
/** One marble-1.1-plus multi-image generation (D-009, GH-3). */
export const SPOT_WORLD_CREDITS = 1600;

// ---------- docs/hero-worlds.json ----------

export const HeroHomeSchema = z.object({
  listingId: z.uuid(),
  entrySpot: z.string().min(1),
  /** Version number -> spot key -> World Labs world id. */
  versions: z.record(
    z.string().regex(/^[1-9]\d*$/),
    z.object({ spots: z.record(z.string().min(1), z.string().min(1)) }),
  ),
  spots: z.record(
    z.string().min(1),
    z.object({ label: z.string().min(1), links: z.array(SpotLinkSchema) }),
  ),
});
export type HeroHome = z.infer<typeof HeroHomeSchema>;

export interface SpotImport {
  spot: string;
  spotLabel: string;
  links: SpotLink[];
  marbleWorldId: string;
}
export interface VersionImport {
  version: number;
  spots: SpotImport[];
}

/**
 * The versions to import, oldest first, each with every spot of the home. Throws when a
 * version misses a spot, a spot has no label, or a link leads to an unknown spot: a half
 * version would strand a visitor behind a doorway arrow.
 */
export function heroImportPlan(home: HeroHome): VersionImport[] {
  const spotKeys = Object.keys(home.spots);
  if (!home.spots[home.entrySpot]) throw new Error(`entrySpot "${home.entrySpot}" is not a spot`);
  for (const [key, { links }] of Object.entries(home.spots)) {
    for (const link of links) {
      if (!home.spots[link.to]) throw new Error(`Spot "${key}" links to unknown spot "${link.to}"`);
    }
  }
  return Object.entries(home.versions)
    .map(([n, { spots }]) => {
      const version = Number(n);
      const missing = spotKeys.filter((key) => !spots[key]);
      const unknown = Object.keys(spots).filter((key) => !home.spots[key]);
      if (missing.length) throw new Error(`Version ${n} misses spots: ${missing.join(", ")}`);
      if (unknown.length) throw new Error(`Version ${n} has unknown spots: ${unknown.join(", ")}`);
      return {
        version,
        spots: spotKeys.map((spot) => ({
          spot,
          spotLabel: home.spots[spot].label,
          links: home.spots[spot].links,
          marbleWorldId: spots[spot],
        })),
      };
    })
    .sort((a, b) => a.version - b.version);
}

// ---------- Which assets to copy ----------

export type AssetColumn =
  "spz_url" | "spz_hq_url" | "collider_mesh_url" | "pano_url" | "thumbnail_url";

export interface AssetCopy {
  column: AssetColumn;
  /** World Labs URL (signed CDN link). */
  url: string;
  /** File name inside media/worlds/{row id}/. */
  file: string;
  contentType: string;
  /** A required asset over the file limit fails the import; an optional one is left null. */
  required: boolean;
}

const CONTENT_TYPES: Record<string, string> = {
  spz: "application/octet-stream",
  glb: "model/gltf-binary",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

/** Lower-case extension of a URL's path ("" when it has none). */
export function urlExtension(url: string): string {
  const pathname = new URL(url).pathname;
  const match = pathname.match(/\.([a-z0-9]+)$/i);
  return match ? match[1].toLowerCase() : "";
}

/**
 * What GH-10 copies from a world: the web splat (pickSplatUrls().web), the HQ splat, the
 * collider, the pano and the thumbnail. The HQ mesh stays null (its export can take an hour,
 * GH-10 build notes). The HQ splat is skipped when it is the web splat.
 */
export function worldAssetPlan(world: MarbleWorld): AssetCopy[] {
  const { web, hq } = pickSplatUrls(world);
  const a = world.assets;
  const entries: Array<[AssetColumn, string | null | undefined, string, boolean]> = [
    ["spz_url", web, "splat-web", true],
    ["spz_hq_url", hq && hq !== web ? hq : null, "splat-hq", false],
    ["collider_mesh_url", a?.mesh?.collider_mesh_url, "collider", true],
    ["pano_url", a?.imagery?.pano_url, "pano", false],
    ["thumbnail_url", a?.thumbnail_url, "thumbnail", false],
  ];
  return entries.flatMap(([column, url, name, required]) => {
    if (!url) return [];
    const ext = urlExtension(url) || (column.startsWith("spz") ? "spz" : "bin");
    return [
      {
        column,
        url,
        file: `${name}.${ext}`,
        contentType: CONTENT_TYPES[ext] ?? "application/octet-stream",
        required,
      },
    ];
  });
}

/** Storage path of a world asset in the `media` bucket. */
export function worldAssetPath(rowId: string, file: string): string {
  return `worlds/${rowId}/${file}`;
}

/** True when `url` is a public object in our Supabase project's `media` bucket. */
export function isOurStorageUrl(url: string | null | undefined, supabaseUrl: string): boolean {
  if (!url) return false;
  const base = `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/${BUCKETS.media}/`;
  return url.startsWith(base);
}

// ---------- Import ----------

type WorldRow = {
  id: string;
  status: string;
  marble_world_id: string | null;
  spz_url: string | null;
  collider_mesh_url: string | null;
};

const ASSET_COLUMNS: AssetColumn[] = [
  "spz_url",
  "spz_hq_url",
  "collider_mesh_url",
  "pano_url",
  "thumbnail_url",
];
const SHARED_COLUMNS =
  "spz_url,spz_hq_url,collider_mesh_url,pano_url,thumbnail_url,model,caption,metric_scale_factor,ground_plane_offset";

export interface ImportedSpot {
  id: string;
  spot: string;
  /** "copied": files downloaded now; "stored": already in our storage; "shared": D-031. */
  source: "copied" | "stored" | "shared";
  uploaded: string[];
  created: boolean;
}

export interface ImportWorldInput extends SpotImport {
  listingId: string;
  version: number;
  log?: (line: string) => void;
}

async function downloadAndUpload(
  asset: AssetCopy,
  path: string,
  log: (line: string) => void,
): Promise<boolean> {
  const res = await fetch(asset.url);
  if (!res.ok) throw new Error(`Download of ${asset.file} failed (HTTP ${res.status})`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.length > STORAGE_FILE_LIMIT) {
    if (asset.required) {
      throw new Error(
        `${asset.file} is ${(bytes.length / 1048576).toFixed(1)} MB, over the 50 MB limit (D-020)`,
      );
    }
    log(`    skip ${asset.file}: ${(bytes.length / 1048576).toFixed(1)} MB is over 50 MB (D-020)`);
    return false;
  }
  const { error } = await supabaseAdmin()
    .storage.from(BUCKETS.media)
    .upload(path, bytes, { contentType: asset.contentType, upsert: true });
  if (error) throw new Error(`Upload of ${path} failed: ${error.message}`);
  log(`    uploaded ${asset.file} (${(bytes.length / 1048576).toFixed(1)} MB)`);
  return true;
}

/**
 * Imports one spot world into a `worlds` row (upsert on listing, version, spot) with OUR
 * storage URLs. Idempotent: an existing row keeps its id and status (a published row stays
 * published), files already in storage are not uploaded again, and a world another row has
 * already stored is shared without calling World Labs (D-031). Makes only GET calls.
 */
export async function importWorld(input: ImportWorldInput): Promise<ImportedSpot> {
  const db = supabaseAdmin();
  const log = input.log ?? (() => {});
  const key = { listing_id: input.listingId, version: input.version, spot: input.spot };

  const { data: existing, error: findError } = await db
    .from("worlds")
    .select("id,status,marble_world_id,spz_url,collider_mesh_url")
    .match(key)
    .maybeSingle<WorldRow>();
  if (findError) throw new Error(`worlds lookup failed: ${findError.message}`);

  const meta = {
    spot_label: input.spotLabel,
    links: input.links as unknown as Json,
    marble_world_id: input.marbleWorldId,
    input_kind: "multi-image",
  };
  let row: WorldRow;
  if (existing) {
    row = existing;
  } else {
    const { data, error } = await db
      .from("worlds")
      .insert({ ...key, ...meta, status: "queued" })
      .select("id,status,marble_world_id,spz_url,collider_mesh_url")
      .single<WorldRow>();
    if (error || !data) throw new Error(`worlds insert failed: ${error?.message}`);
    row = data;
  }
  const created = !existing;
  const status = ["published", "archived"].includes(row.status) ? row.status : "ready";
  const finish = async (fields: Record<string, unknown>) => {
    const { error } = await db
      .from("worlds")
      .update({
        ...meta,
        ...fields,
        status,
        ...(row.status === "queued" ? { ready_at: new Date().toISOString() } : {}),
      })
      .eq("id", row.id);
    if (error) throw new Error(`worlds update failed: ${error.message}`);
  };

  // D-031: another row already holds this world's files.
  const { data: candidates } = await db
    .from("worlds")
    .select(`id,${SHARED_COLUMNS}`)
    .eq("marble_world_id", input.marbleWorldId)
    .neq("id", row.id)
    .not("spz_url", "is", null)
    .not("collider_mesh_url", "is", null)
    .order("created_at", { ascending: true })
    .limit(20);
  const ownsFiles = (r: { id: string; spz_url: string | null; collider_mesh_url: string | null }) =>
    [r.spz_url, r.collider_mesh_url].every((u) => u?.includes(`/worlds/${r.id}/`));
  const ownFiles = [row.spz_url, row.collider_mesh_url].every((u) =>
    u?.includes(`/worlds/${row.id}/`),
  );
  const owner = ownFiles ? undefined : candidates?.find(ownsFiles);
  if (owner) {
    const { id: ownerId, ...shared } = owner;
    await finish({ ...shared, hq_mesh_url: null, cost_credits: 0 });
    log(`  ${input.spot}: shares the files of row ${ownerId}`);
    return { id: row.id, spot: input.spot, source: "shared", uploaded: [], created };
  }

  const world = await getWorld(input.marbleWorldId);
  const plan = worldAssetPlan(world);
  const { data: listing, error: listError } = await db.storage
    .from(BUCKETS.media)
    .list(`worlds/${row.id}`, { limit: 100 });
  if (listError) throw new Error(`storage list failed: ${listError.message}`);
  const stored = new Set(
    (listing ?? []).filter((f) => Number(f.metadata?.size ?? 0) > 0).map((f) => f.name),
  );

  const urls: Partial<Record<AssetColumn, string | null>> = {};
  const uploaded: string[] = [];
  for (const asset of plan) {
    const path = worldAssetPath(row.id, asset.file);
    if (stored.has(asset.file)) {
      urls[asset.column] = publicMediaUrl(path);
      continue;
    }
    if (await downloadAndUpload(asset, path, log)) {
      urls[asset.column] = publicMediaUrl(path);
      uploaded.push(asset.file);
    } else {
      urls[asset.column] = null;
    }
  }
  if (!urls.spz_url || !urls.collider_mesh_url) {
    throw new Error(`World ${input.marbleWorldId} has no web splat or collider to import`);
  }
  const scale = world.assets?.splats?.semantics_metadata;
  await finish({
    ...Object.fromEntries(ASSET_COLUMNS.map((c) => [c, urls[c] ?? null])),
    hq_mesh_url: null,
    model: world.model ?? null,
    caption: world.assets?.caption?.trim() || null,
    metric_scale_factor: scale?.metric_scale_factor ?? worldScale(world).metricScaleFactor,
    ground_plane_offset: scale?.ground_plane_offset ?? null,
    cost_credits: SPOT_WORLD_CREDITS,
  });
  log(
    `  ${input.spot}: ${uploaded.length ? `uploaded ${uploaded.length} files` : "all files already stored"}`,
  );
  return {
    id: row.id,
    spot: input.spot,
    source: uploaded.length ? "copied" : "stored",
    uploaded,
    created,
  };
}

async function listingTitle(listingId: string): Promise<string> {
  const { data } = await supabaseAdmin()
    .from("listings")
    .select("title")
    .eq("id", listingId)
    .maybeSingle();
  return data?.title ?? "listing";
}

/** Imports every spot of one version; logs one feed event when anything changed. */
export async function importVersion(
  listingId: string,
  plan: VersionImport,
  log: (line: string) => void = () => {},
): Promise<ImportedSpot[]> {
  log(`Version ${plan.version}`);
  const spots: ImportedSpot[] = [];
  for (const spot of plan.spots) {
    spots.push(await importWorld({ ...spot, listingId, version: plan.version, log }));
  }
  const changed = spots.some((s) => s.created || s.uploaded.length > 0);
  if (changed) {
    const uploaded = spots.reduce((n, s) => n + s.uploaded.length, 0);
    await logEvent({
      actor_type: "system",
      actor_name: "3D pipeline",
      action: "world.imported",
      summary: `World v${plan.version} imported for ${await listingTitle(listingId)}: ${spots.length} room spots, served from our storage`,
      listing_id: listingId,
      payload: {
        version: plan.version,
        spots: spots.map((s) => ({ spot: s.spot, id: s.id, source: s.source })),
        files_uploaded: uploaded,
      },
    });
  }
  return spots;
}

// ---------- Publish ----------

/**
 * Publishes a version (D-009): its spot rows become `published`, rows of the previously
 * published version become `archived`, and `listings.published_world_id` points at the
 * entry spot's row. Logs one event when something changed. Returns the entry row id.
 */
export async function publishVersion(
  listingId: string,
  version: number,
  entrySpot: string,
): Promise<{ entryWorldId: string; changed: boolean }> {
  const db = supabaseAdmin();
  const { data: rows, error } = await db
    .from("worlds")
    .select("id,spot,status,spz_url")
    .eq("listing_id", listingId)
    .eq("version", version);
  if (error) throw new Error(`worlds lookup failed: ${error.message}`);
  if (!rows?.length) throw new Error(`No worlds for version ${version}`);
  const entry = rows.find((r) => r.spot === entrySpot);
  if (!entry) throw new Error(`Version ${version} has no "${entrySpot}" spot`);
  const notReady = rows.filter(
    (r) => !r.spz_url || !["ready", "published", "archived"].includes(r.status),
  );
  if (notReady.length) {
    throw new Error(`Version ${version} is not ready: ${notReady.map((r) => r.spot).join(", ")}`);
  }

  const { data: listing } = await db
    .from("listings")
    .select("title,published_world_id")
    .eq("id", listingId)
    .single();
  const unpublished = rows.filter((r) => r.status !== "published");
  const changed = unpublished.length > 0 || listing?.published_world_id !== entry.id;
  if (!changed) return { entryWorldId: entry.id, changed };

  const now = new Date().toISOString();
  const archive = await db
    .from("worlds")
    .update({ status: "archived" })
    .eq("listing_id", listingId)
    .eq("status", "published")
    .neq("version", version);
  if (archive.error) throw new Error(`archive failed: ${archive.error.message}`);
  if (unpublished.length) {
    const publish = await db
      .from("worlds")
      .update({ status: "published", published_at: now })
      .in(
        "id",
        unpublished.map((r) => r.id),
      );
    if (publish.error) throw new Error(`publish failed: ${publish.error.message}`);
  }
  const point = await db
    .from("listings")
    .update({ published_world_id: entry.id })
    .eq("id", listingId);
  if (point.error) throw new Error(`listing update failed: ${point.error.message}`);

  await logEvent({
    actor_type: "system",
    actor_name: "3D pipeline",
    action: "world.published",
    summary: `World v${version} published for ${listing?.title ?? "listing"}: guests now tour ${rows.length} room spots`,
    listing_id: listingId,
    payload: { version, entry_world_id: entry.id, spots: rows.map((r) => r.spot) },
  });
  return { entryWorldId: entry.id, changed };
}
