/**
 * Hero 2's object anchors for Ask the space (owner: Temuri, GH-11 / GH-20, D-026).
 * Each object's azimuth was read from the spot's own photos: the 8-photo ring in turning
 * order and the spot world's panorama (pano column u = 0.5 + azimuth / 360, checked against a
 * depth panorama of the collider). A ray from the spot centre along that azimuth hits the
 * spot world's collider (from OUR storage, never World Labs): `look_at` is the hit, `position`
 * stands back toward the centre at eye height (lib/geometry/anchors.ts). Every hero-2 world row
 * of a spot gets them, so v1 (the published demo version after `pnpm demo:reset`) and v2 both
 * have them (D-031: v1 shares four spot worlds with v2; its kitchen is its own world).
 *
 * Idempotent: keyed by (world_id, name), an existing anchor is updated in place (its id, and
 * any ?anchor= link, stays). source is "manual": placed by hand from the host's own photos.
 * `pnpm demo:reset` does not touch anchors; `pnpm floorplans` replaces only auto room anchors.
 *
 *   npx tsx scripts/seed-anchors.ts            write the anchors, log one feed event
 *   npx tsx scripts/seed-anchors.ts --dry-run  print them only
 */
import { parseArgs } from "node:util";
import { castRay, colliderFromGlb, type SpotCollider } from "@/components/tour/collider-mesh";
import { logEvent } from "@/lib/events";
import {
  aimDirection,
  aimOrigin,
  anchorFromHit,
  firstHit,
  type AnchorAim,
} from "@/lib/geometry/anchors";
import { isOurStorage } from "@/lib/geometry/store-floorplans";
import type { Anchor } from "@/lib/schemas/world";
import { supabaseAdmin } from "@/lib/supabase";
import { HERO_LISTINGS } from "@/seed/fixtures";

interface HeroAnchor extends AnchorAim {
  spot: string;
  /** What the guest agent sees; "photo frames" etc. must appear for its questions to match. */
  name: string;
  /** Where the photos show it. */
  seen: string;
}

/** Hero 2 (Temuri's apartment). Azimuths from the ring photos and the spot panoramas. */
const HERO2_ANCHORS: HeroAnchor[] = [
  {
    spot: "living",
    name: "desk with ultrawide monitor",
    azimuth: 218,
    rayHeight: 1.0,
    seen: "ring photo IMG_0993 (6th of 9), pano 212-226 deg, left of the sofa",
  },
  {
    spot: "living",
    name: "sofa",
    azimuth: 272,
    rayHeight: 0.6,
    seen: "ring photos IMG_0994-0995, pano 222-322 deg, behind the coffee table",
  },
  {
    spot: "living",
    name: "TV",
    azimuth: 95,
    rayHeight: 1.2,
    seen: "ring photos IMG_0989-0990, pano 75-114 deg, on the wood-panel wall",
  },
  {
    spot: "kitchen",
    name: "dining table",
    azimuth: 180,
    rayHeight: 1.4,
    pitch: -35,
    seen: "pano 130-230 deg, the white table between the kitchen and the living room",
  },
  {
    spot: "kitchen",
    name: "cooktop",
    azimuth: 310,
    rayHeight: 1.4,
    pitch: -35,
    seen: "pano 295-327 deg, the gas hob left of the sink",
  },
  {
    spot: "kitchen",
    name: "kitchen wall with the photo frames",
    azimuth: 235,
    rayHeight: 1.5,
    seen: "ring photos IMG_1019-1020 (left out of v1), pano frame at 220-230 deg; v1 invented a door there",
  },
  {
    spot: "bathroom",
    name: "washing machine",
    azimuth: 126,
    rayHeight: 0.55,
    seen: "ring photo IMG_0919, listing photo 15-washing-machine, pano 116-132 deg; the collider has its front at 118-128 deg, the open door from 130",
  },
  {
    spot: "bedroom",
    name: "bed",
    azimuth: 290,
    rayHeight: 1.4,
    pitch: -30,
    seen: "pano: headboard at 255-321 deg, the double bed under the camera",
  },
  {
    spot: "bedroom",
    name: "bedroom TV",
    azimuth: 70,
    rayHeight: 1.15,
    seen: "pano 55-85 deg, wall-mounted opposite the bed",
  },
  {
    spot: "entrance",
    name: "wardrobe",
    azimuth: 238,
    rayHeight: 1.2,
    seen: "pano 205-320 deg; aimed at the open part, the mirror doors (270-320) reflect",
  },
];

const { values } = parseArgs({ options: { "dry-run": { type: "boolean", default: false } } });
const dryRun = values["dry-run"];

interface WorldRow {
  id: string;
  version: number;
  spot: string;
  spot_label: string | null;
  collider_mesh_url: string | null;
  metric_scale_factor: number | null;
}

type Placed = Pick<
  Anchor,
  "world_id" | "name" | "kind" | "room" | "position" | "look_at" | "source"
>;

async function loadCollider(world: WorldRow): Promise<SpotCollider> {
  const url = world.collider_mesh_url;
  if (!url || !isOurStorage(url))
    throw new Error(`${world.spot} v${world.version}: no stored collider`);
  if (!world.metric_scale_factor)
    throw new Error(`${world.spot} v${world.version}: no metric scale`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${world.spot} v${world.version}: collider ${res.status}`);
  return colliderFromGlb(new Uint8Array(await res.arrayBuffer()), world.metric_scale_factor);
}

function place(world: WorldRow, collider: SpotCollider, aim: HeroAnchor): Placed {
  const hits = castRay(collider, aimOrigin(aim), aimDirection(aim.azimuth, aim.pitch ?? 0));
  const d = firstHit(hits.map((h) => h.distance));
  if (d === null) throw new Error(`${aim.name}: the ray at ${aim.azimuth} deg hit nothing`);
  const { position, look_at } = anchorFromHit(aim, d);
  return {
    world_id: world.id,
    name: aim.name,
    kind: "object",
    room: world.spot_label ?? world.spot,
    position,
    look_at,
    source: "manual",
  };
}

async function upsert(anchor: Placed): Promise<"inserted" | "updated"> {
  const db = supabaseAdmin();
  const { data: existing, error } = await db
    .from("anchors")
    .select("id")
    .eq("world_id", anchor.world_id)
    .eq("name", anchor.name);
  if (error) throw new Error(`read anchors: ${error.message}`);
  if (existing && existing.length > 0) {
    const [keep, ...extra] = existing;
    const upd = await db.from("anchors").update(anchor).eq("id", keep.id);
    if (upd.error) throw new Error(`update ${anchor.name}: ${upd.error.message}`);
    if (extra.length) {
      const del = await db
        .from("anchors")
        .delete()
        .in(
          "id",
          extra.map((a) => a.id),
        );
      if (del.error) throw new Error(`dedupe ${anchor.name}: ${del.error.message}`);
    }
    return "updated";
  }
  const ins = await db.from("anchors").insert(anchor);
  if (ins.error) throw new Error(`insert ${anchor.name}: ${ins.error.message}`);
  return "inserted";
}

async function main() {
  const listing = HERO_LISTINGS.hero2;
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("worlds")
    .select("id, version, spot, spot_label, collider_mesh_url, metric_scale_factor")
    .eq("listing_id", listing.id)
    .order("version");
  if (error) throw new Error(`load worlds: ${error.message}`);
  const worlds = (data ?? []) as WorldRow[];
  const spots = new Set(HERO2_ANCHORS.map((a) => a.spot));
  const targets = worlds.filter((w) => spots.has(w.spot));
  if (targets.length === 0) throw new Error("hero-2 has no spot worlds yet (pnpm worlds --import)");

  // v1 and v2 share most spot worlds' files (D-031): parse each collider once.
  const colliders = new Map<string, Promise<SpotCollider>>();
  const placed: Placed[] = [];
  for (const world of targets) {
    const key = world.collider_mesh_url ?? world.id;
    if (!colliders.has(key)) colliders.set(key, loadCollider(world));
    const collider = await colliders.get(key)!;
    for (const aim of HERO2_ANCHORS.filter((a) => a.spot === world.spot)) {
      const anchor = place(world, collider, aim);
      placed.push(anchor);
      const { position: p, look_at: t } = anchor;
      console.log(
        `v${world.version} ${world.spot.padEnd(8)} ${aim.name.padEnd(36)} az ${String(aim.azimuth).padStart(3)}  eye (${p.x}, ${p.y}, ${p.z})  look_at (${t!.x}, ${t!.y}, ${t!.z})`,
      );
    }
  }
  for (const c of colliders.values()) (await c).dispose();
  if (dryRun) return console.log(`dry run: ${placed.length} anchors, nothing written`);

  const counts = { inserted: 0, updated: 0 };
  for (const anchor of placed) counts[await upsert(anchor)]++;
  const versions = [...new Set(targets.map((w) => w.version))].sort();
  const names = HERO2_ANCHORS.map((a) => a.name);
  console.log(`${counts.inserted} inserted, ${counts.updated} updated`);
  await logEvent({
    actor_type: "system",
    actor_name: "Tour builder",
    action: "anchors.placed",
    summary: `Marked ${names.length} things in the 3D tour from the host's photos: desk, washing machine, bed, TV, cooktop and more`,
    listing_id: listing.id,
    payload: { versions, anchors: names, ...counts },
  });
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
