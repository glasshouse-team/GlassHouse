---
name: marble-world-pipeline
description: Generate whole-house 3D worlds with the World Labs Marble API, then store and version them - input preparation with ffmpeg, generate and poll, download assets into our storage, metric scale, publish, demo mode, fallbacks. Use for GH-3 (go/no-go test), GH-6 (hero homes) and GH-10 (pipeline).
when_to_use: "World Labs", "Marble", "generate the 3D", "go/no-go test", "world version", "publish world", "splat", "spz", "collider mesh", "metric scale", "prepare the video", "the 3D looks wrong", "HY World".
---

# World Labs Marble pipeline

Client: `lib/marble.ts` (tested). CLI: `pnpm worlds` (scripts/generate-worlds.ts). Video prep: `pnpm video:prepare` (lib/media.ts, ffmpeg-static). API docs: https://docs.worldlabs.ai/api (checked 2026-10-17).

**Rule: generate once per version, copy every asset into our Supabase storage, and never call World Labs on a page view.** A generation takes about 5 minutes; a standard world costs about $1.20-1.28 in credits, Plus more.

## API in one screen

- Auth header: `WLT-Api-Key: <WORLDLABS_API_KEY>`. Base: `https://api.worldlabs.ai/marble/v1`.
- `POST /worlds:generate` with `{ model, display_name (max 64), world_prompt, seed?, tags?, permission? }`, returns an operation `{ operation_id, done, ... }`.
- Models: `marble-1.1-plus` (larger worlds, our default for whole houses), `marble-1.1` (default, cheaper), `marble-1.0`, `marble-1.0-draft`.
- `world_prompt` variants:
  - `{ type: "video", video_prompt: SourceRef, text_prompt? }`: mp4, webm, mov or avi.
  - `{ type: "multi-image", multi_image_prompt: [{ azimuth?, content: SourceRef }], reconstruct_images?, text_prompt? }`: up to 4 images, up to 8 with `reconstruct_images: true`.
  - `{ type: "image", image_prompt: SourceRef, is_pano?: "auto" | true | false }` and `{ type: "text", text_prompt }`.
- `SourceRef`: `{ source: "uri", uri }` (public URL, no cookies or login), `{ source: "media_asset", media_asset_id }` (signed upload flow, see docs.worldlabs.ai/api), or `{ source: "data_base64", data_base64, extension }`.
- Size: URL inputs are documented up to 20 MB (videos up to 100 MB in another section). Stay under 20 MB with `pnpm video:prepare`; use the media-asset upload for anything bigger.
- `GET /operations/{id}`: `done: false` means running; `done: true` with `error` means failed; otherwise `response.world_id`, plus `cost.total_credits`.
- `GET /worlds/{id}`: `assets.splats.spz_urls` (size label to URL, for example "100k", "500k", "full_res"), `assets.splats.semantics_metadata.metric_scale_factor` and `ground_plane_offset`, `assets.mesh.collider_mesh_url`, `hq_mesh_url`, `full_res_mesh_url`, `assets.imagery.pano_url`, `assets.caption`, `assets.thumbnail_url`.
- Errors: 401 bad key, 402 no credits, 400/422 bad request (often: the input URL is not public).

## Coordinates

Meters = raw x `metric_scale_factor`, then subtract `ground_plane_offset` from y to put the floor at 0 (`worldScale(world)`). If the world appears upside down in three.js, rotate 180 degrees around X (`quaternion.set(1, 0, 0, 0)`, as in Spark's example).

## GH-3: go/no-go (hour 0-2)

1. Record a 1-2 minute walkthrough (filming rules: mobile-capture skill).
2. `pnpm video:prepare walk.mov` writes `walk-720.mp4` under 20 MB.
3. Upload to the public `media` bucket; open the URL in an incognito window.
4. `pnpm worlds generate --video <url> --name "go-no-go" --prompt "A two-bedroom apartment..." --wait`.
5. Open `marble_url`: rooms coherent, walls straight, doors visible, walkable room to room? Post the JSON the CLI prints in GH-3.
6. In parallel: B) 20-30 photos to Tencent HY World on Scenario; C) 2-4 photos of one room with `--images` and `--azimuths`. Also test joining two clips (`joinClipsArgs` in lib/media.ts) and generating from the joined file: GH-19 needs to know if walkthrough + fill-in works as one video.
7. Decide: Path 1 video to Marble 1.1 Plus (preferred), Path 2 photos to HY World, Path 3 one splat per room placed together in the viewer. Record it in docs/DECISIONS.md.

## GH-10: the pipeline

1. `POST /api/worlds { listingId, captureIds }`: next `worlds.version`, status `generating`, store `operation_id`, log "World v2 generating for <listing>".
2. `GET /api/worlds/[id]/status` (the host page polls every 15 s): `getOperation`; when done, `getWorld`, then download each asset (`fetch` then `upload` to `media/worlds/{id}/...`): web splat (`pickSplatUrls().web`), HQ splat, collider mesh, HQ mesh, pano, thumbnail; save URLs from OUR storage, scale metadata, caption, cost; status `ready`; log an event.
3. `POST /api/worlds/[id]/publish`: set `listings.published_world_id`, status `published`, archive the previous published version, log an event.
4. `scripts/generate-worlds.ts --import <world_id>` (add it) imports worlds made by hand in GH-6 into storage and `worlds` rows.
5. `isDemoMode()`: `POST /api/worlds` returns the saved version and never calls World Labs.
6. `components/tour/WorldVersions.tsx` (host dashboard slot): versions with status, progress, thumbnail, Preview link `/tour/<listing>?version=<n>`, Publish button.

## Done when

The three GH-6 worlds are served from our storage, a page view makes zero requests to api.worldlabs.ai (check the Network tab), a new generation goes generating, ready, published from the dashboard, and every status change is in the feed.
