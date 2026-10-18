import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { MarbleWorld } from "./marble";
import {
  HeroHomeSchema,
  heroImportPlan,
  isOurStorageUrl,
  operationProgress,
  urlExtension,
  worldAssetPath,
  worldAssetPlan,
  type HeroHome,
} from "./marble-worlds";

const CDN = "https://cdn.marble.worldlabs.ai/w1";

const world = (overrides: Partial<NonNullable<MarbleWorld["assets"]>> = {}): MarbleWorld => ({
  world_id: "w1",
  display_name: "test",
  world_marble_url: "https://marble.worldlabs.ai/world/w1",
  assets: {
    splats: {
      spz_urls: {
        "100k": `${CDN}/a_100k.spz`,
        "500k": `${CDN}/a_500k.spz`,
        full_res: `${CDN}/a.spz`,
      },
    },
    mesh: { collider_mesh_url: `${CDN}/c.glb`, hq_mesh_url: `${CDN}/hq.glb` },
    imagery: { pano_url: `${CDN}/panos/rgb_0.png` },
    thumbnail_url: `${CDN}/mpi/thumbnail.webp?sig=1`,
    ...overrides,
  },
});

describe("worldAssetPlan", () => {
  it("copies the web and HQ splats, collider, pano and thumbnail, not the HQ mesh", () => {
    const plan = worldAssetPlan(world());
    expect(plan.map((a) => [a.column, a.file, a.contentType, a.required])).toEqual([
      ["spz_url", "splat-web.spz", "application/octet-stream", true],
      ["spz_hq_url", "splat-hq.spz", "application/octet-stream", false],
      ["collider_mesh_url", "collider.glb", "model/gltf-binary", true],
      ["pano_url", "pano.png", "image/png", false],
      ["thumbnail_url", "thumbnail.webp", "image/webp", false],
    ]);
    expect(plan[0].url).toBe(`${CDN}/a_500k.spz`);
    expect(plan[1].url).toBe(`${CDN}/a.spz`);
  });

  it("skips the HQ splat when there is only one size, and missing assets", () => {
    const plan = worldAssetPlan(
      world({
        splats: { spz_urls: { "500k": `${CDN}/only.spz` } },
        imagery: null,
        thumbnail_url: null,
      }),
    );
    expect(plan.map((a) => a.column)).toEqual(["spz_url", "collider_mesh_url"]);
  });
});

describe("urlExtension", () => {
  it("reads the path's extension and ignores the query", () => {
    expect(urlExtension("https://x.io/a/thumbnail.WEBP?sig=1")).toBe("webp");
    expect(urlExtension("https://x.io/a/noext")).toBe("");
  });
});

describe("worldAssetPath / isOurStorageUrl", () => {
  const supabase = "https://abc.supabase.co/";
  it("puts files under media/worlds/{row id}/", () => {
    expect(worldAssetPath("row-1", "collider.glb")).toBe("worlds/row-1/collider.glb");
  });
  it("accepts only public media URLs of our project", () => {
    expect(
      isOurStorageUrl(
        "https://abc.supabase.co/storage/v1/object/public/media/worlds/r/collider.glb",
        supabase,
      ),
    ).toBe(true);
    expect(isOurStorageUrl(`${CDN}/c.glb`, supabase)).toBe(false);
    expect(
      isOurStorageUrl("https://abc.supabase.co/storage/v1/object/public/captures/x", supabase),
    ).toBe(false);
    expect(isOurStorageUrl(null, supabase)).toBe(false);
  });
});

const home = (versions: HeroHome["versions"]): HeroHome => ({
  listingId: "00000000-0000-4000-8000-0000000000b2",
  entrySpot: "hall",
  versions,
  spots: {
    hall: { label: "Hall", links: [{ to: "kitchen", azimuth: 90 }] },
    kitchen: { label: "Kitchen", links: [{ to: "hall", azimuth: 270 }] },
  },
});

describe("heroImportPlan", () => {
  it("returns versions oldest first, each with every spot, label and links", () => {
    const plan = heroImportPlan(
      home({
        "2": { spots: { hall: "h", kitchen: "k2" } },
        "1": { spots: { hall: "h", kitchen: "k1" } },
      }),
    );
    expect(plan.map((v) => v.version)).toEqual([1, 2]);
    expect(plan[0].spots).toEqual([
      {
        spot: "hall",
        spotLabel: "Hall",
        links: [{ to: "kitchen", azimuth: 90 }],
        marbleWorldId: "h",
      },
      {
        spot: "kitchen",
        spotLabel: "Kitchen",
        links: [{ to: "hall", azimuth: 270 }],
        marbleWorldId: "k1",
      },
    ]);
  });

  it("refuses a version that misses a spot", () => {
    expect(() => heroImportPlan(home({ "1": { spots: { kitchen: "k1" } } }))).toThrow(
      /misses spots: hall/,
    );
  });

  it("refuses a link to an unknown spot", () => {
    const bad = home({ "1": { spots: { hall: "h", kitchen: "k" } } });
    bad.spots.hall.links.push({ to: "attic", azimuth: 10 });
    expect(() => heroImportPlan(bad)).toThrow(/unknown spot "attic"/);
  });

  it("plans hero-2 from docs/hero-worlds.json: v1 and v2 with 5 spots, v1 reusing 4 of v2's worlds", () => {
    const json = JSON.parse(
      readFileSync(path.join(process.cwd(), "docs/hero-worlds.json"), "utf8"),
    );
    const plan = heroImportPlan(HeroHomeSchema.parse(json["hero-2"]));
    expect(plan.map((v) => [v.version, v.spots.length])).toEqual([
      [1, 5],
      [2, 5],
    ]);
    const shared = plan[0].spots.filter(
      (s, i) => s.marbleWorldId === plan[1].spots[i].marbleWorldId,
    );
    expect(shared.map((s) => s.spot)).toEqual(["entrance", "bathroom", "bedroom", "living"]);
  });
});

describe("operationProgress", () => {
  it("reads a progress number wherever the metadata puts it", () => {
    expect(operationProgress({ done: false, metadata: { progress_percentage: 40 } })).toBe(0.4);
    expect(operationProgress({ done: false, metadata: { status: { progress: 0.25 } } })).toBe(0.25);
    expect(operationProgress({ done: false, metadata: { percent: 140 } })).toBe(1);
  });

  it("is 1 when done and null when the metadata has no number", () => {
    expect(operationProgress({ done: true, metadata: null })).toBe(1);
    expect(operationProgress({ done: false, metadata: { stage: "splatting" } })).toBeNull();
    expect(operationProgress({ done: false, metadata: null })).toBeNull();
  });
});
