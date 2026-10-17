import { describe, expect, it } from "vitest";
import { pickSplatUrls, splatSizeRank, worldScale, type MarbleWorld } from "./marble";

const world = (spz_urls: Record<string, string> | null, meta?: object): MarbleWorld => ({
  world_id: "w1",
  display_name: "test",
  world_marble_url: "https://marble.worldlabs.ai/world/w1",
  assets: { splats: { spz_urls, semantics_metadata: meta ?? null } },
});

describe("splatSizeRank", () => {
  it("orders size labels", () => {
    const labels = ["full_res", "100k", "1.5m", "500k"].sort(
      (a, b) => splatSizeRank(a) - splatSizeRank(b),
    );
    expect(labels).toEqual(["100k", "500k", "1.5m", "full_res"]);
  });
});

describe("pickSplatUrls", () => {
  it("prefers 500k for the web and the largest for HQ", () => {
    expect(pickSplatUrls(world({ "100k": "a", "500k": "b", full_res: "c" }))).toEqual({
      web: "b",
      hq: "c",
    });
  });

  it("falls back to the middle size when there is no 500k", () => {
    expect(pickSplatUrls(world({ "100k": "a", "1m": "b", "2m": "c" }))).toEqual({
      web: "b",
      hq: "c",
    });
  });

  it("handles missing splats", () => {
    expect(pickSplatUrls(world(null))).toEqual({ web: null, hq: null });
  });
});

describe("worldScale", () => {
  it("reads metric scale metadata", () => {
    expect(worldScale(world({}, { metric_scale_factor: 2.5, ground_plane_offset: -1.2 }))).toEqual({
      metricScaleFactor: 2.5,
      groundPlaneOffset: -1.2,
    });
  });

  it("defaults to unscaled", () => {
    expect(worldScale(world({}))).toEqual({ metricScaleFactor: 1, groundPlaneOffset: 0 });
  });
});
