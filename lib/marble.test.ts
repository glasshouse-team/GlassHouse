import { afterEach, describe, expect, it, vi } from "vitest";
import {
  pickSplatUrls,
  splatSizeRank,
  uploadMediaAsset,
  worldAssets,
  worldScale,
  type MarbleWorld,
} from "./marble";

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

describe("worldAssets", () => {
  it("lists splats smallest first, then the meshes and images that exist", () => {
    const w = world({ full_res: "s3", "100k": "s1", "500k": "s2" });
    w.assets = {
      ...w.assets,
      mesh: { collider_mesh_url: "c", hq_mesh_url: null },
      imagery: { pano_url: "p" },
      thumbnail_url: "t",
    };
    expect(worldAssets(w)).toEqual([
      { kind: "splat", label: "splat 100k", url: "s1" },
      { kind: "splat", label: "splat 500k", url: "s2" },
      { kind: "splat", label: "splat full_res", url: "s3" },
      { kind: "collider", label: "collider mesh", url: "c" },
      { kind: "pano", label: "pano", url: "p" },
      { kind: "thumbnail", label: "thumbnail", url: "t" },
    ]);
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

describe("uploadMediaAsset", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("prepares the upload, PUTs the bytes with the required headers, returns the asset id", async () => {
    vi.stubEnv("WORLDLABS_API_KEY", "test-key");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            media_asset: { media_asset_id: "ma_123", file_name: "walk-720.mp4", kind: "video" },
            upload_info: {
              upload_url: "https://upload.example/signed",
              upload_method: "PUT",
              required_headers: { "x-goog-meta-a": "1" },
            },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response("", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const id = await uploadMediaAsset({
      fileName: "walk-720.mp4",
      kind: "video",
      contentType: "video/mp4",
      bytes: new Uint8Array([1, 2, 3]),
    });

    expect(id).toBe("ma_123");
    const [prepareUrl, prepareInit] = fetchMock.mock.calls[0];
    expect(prepareUrl).toBe("https://api.worldlabs.ai/marble/v1/media-assets:prepare_upload");
    expect(JSON.parse(prepareInit.body)).toEqual({
      file_name: "walk-720.mp4",
      kind: "video",
      extension: "mp4",
    });
    const [putUrl, putInit] = fetchMock.mock.calls[1];
    expect(putUrl).toBe("https://upload.example/signed");
    expect(putInit.method).toBe("PUT");
    expect(putInit.headers).toEqual({ "Content-Type": "video/mp4", "x-goog-meta-a": "1" });
  });
});
