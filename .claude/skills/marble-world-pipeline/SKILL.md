---
name: marble-world-pipeline
description: Generate whole-house 3D worlds with the World Labs Marble API, then store and version them - input preparation with ffmpeg, generate and poll, download assets into our storage, metric scale, publish, demo mode, fallbacks. Use for GH-3 (go/no-go test), GH-6 (hero homes) and GH-10 (pipeline).
when_to_use: The user mentions "World Labs", "Marble", "generate the 3D", "go/no-go test", "world version", "publish world", "splat", "spz", "collider mesh", "metric scale", "prepare the video", "the 3D looks wrong", "HY World".
---

# World Labs Marble pipeline

Client: `lib/marble.ts` (tested). CLI: `pnpm worlds` (scripts/generate-worlds.ts). Video prep: `pnpm video:prepare` (lib/media.ts, ffmpeg-static). API docs: https://docs.worldlabs.ai/api (checked 2026-10-17).

**Rule: generate once per version, copy every asset into our Supabase storage, and never call World Labs on a page view.** A generation takes about 6-8 minutes and 1,600 credits; `marble-1.1-plus` costs the same as `marble-1.1` (GH-3). Videos must be 30 s or shorter: longer ones are accepted, then fail after about 47 minutes (D-009).

## API in one screen

- Auth header: `WLT-Api-Key: <WORLDLABS_API_KEY>`. Base: `https://api.worldlabs.ai/marble/v1`.
- `POST /worlds:generate` with `{ model, display_name (max 64), world_prompt, seed?, tags?, permission? }`, returns an operation `{ operation_id, done, ... }`.
- Models: `marble-1.1-plus` (larger worlds, our default for whole houses), `marble-1.1` (default, cheaper), `marble-1.0`, `marble-1.0-draft`.
- `world_prompt` variants:
  - `{ type: "video", video_prompt: SourceRef, text_prompt? }`: mp4, webm, mov or avi.
  - `{ type: "multi-image", multi_image_prompt: [{ azimuth?, content: SourceRef }], reconstruct_images?, text_prompt? }`: up to 4 images, up to 8 with `reconstruct_images: true`.
  - `{ type: "image", image_prompt: SourceRef, is_pano?: "auto" | true | false }` and `{ type: "text", text_prompt }`.
- `SourceRef`: `{ source: "uri", uri }` (public URL, no cookies or login), `{ source: "media_asset", media_asset_id }` (`uploadMediaAsset()` in lib/marble.ts; the CLI does it for local files: `pnpm worlds generate --video walk-720.mp4 --wait`), or `{ source: "data_base64", data_base64, extension }`.
- Limits: videos up to **30 s** and 100 MB (Marble prompt guidelines); URL inputs up to 20 MB. `pnpm video:prepare` speeds a longer walkthrough up to 29 s and stays under 20 MB; `pnpm worlds generate` refuses local videos over 30 s.
- `GET /operations/{id}`: `done: false` means running; `done: true` with `error` means failed; otherwise `response.world_id`, plus `cost.total_credits`.
- `GET /worlds/{id}`: `assets.splats.spz_urls` (size label to URL, for example "100k", "500k", "full_res"), `assets.splats.semantics_metadata.metric_scale_factor` and `ground_plane_offset`, `assets.mesh.collider_mesh_url`, `hq_mesh_url`, `full_res_mesh_url`, `assets.imagery.pano_url`, `assets.caption`, `assets.thumbnail_url`.
- Errors: 401 bad key, 402 no credits, 400/422 bad request (often: the input URL is not public).

## Coordinates

Marble worlds use OpenCV axes (+y down, +z forward; docs.worldlabs.ai, export specs). Convert only with `lib/geometry/frame.ts`: `marbleToThree(metric_scale_factor, floorY)` flips Y and Z, scales to meters and lifts the floor to y = 0, with `floorY` measured from the collider by `floorHeight()`. World Labs' SPZ docs ground the splat with `metric.y -= ground_plane_offset` (meters, after scaling), so after the flip the floor is at y = -ground_plane_offset. GH-3 measured that within 3 cm on video worlds, but on a 4-photo world the offset marked a bed top, so keep measuring the floor from the collider (D-009). The collider is an uncompressed trimesh GLB (130-215k triangles, no node transforms) in the splat's raw frame; `colliderToThree()` (lib/geometry/collider.ts) reads it in Node, and `pnpm worlds inspect <world_id>` prints asset sizes, GLB extensions and the floor check.

## GH-3: go/no-go (done: D-009)

Path 1 won. The recipe for a home:

1. Film a 60-90 s walkthrough (filming rules: mobile-capture skill).
2. `pnpm video:prepare walk.mov` writes `walk-720.mp4`: short side 720, SDR (iPhone HDR is tone-mapped), sped up to 29 s.
3. `pnpm worlds generate --video walk-720.mp4 --name "Hero 1 v1" --prompt "A one-bedroom apartment: ..." --wait` uploads the file straight to World Labs (no public URL needed) and waits up to 60 minutes.
4. `pnpm worlds inspect <world_id>`: asset sizes, collider format, floor check. Open `marble_url` signed in to Marble with the API key's account (API worlds are private).

Fallback (Path 3): one Marble multi-image world per room (`--images` with 4 photos and `--azimuths`, 5.4 minutes in GH-3), placed together in the viewer. HY World (Path 2) was not needed. A walkthrough + fill-in clip joined into one video comes back as a new layout: a fill-in version is a new world with its own coordinates (GH-19).

## GH-10: the pipeline

1. `POST /api/worlds { listingId, captureIds }`: next `worlds.version`, status `generating`, store `operation_id`, log "World v2 generating for <listing>".
2. `GET /api/worlds/[id]/status` (the host page polls every 15 s): `getOperation`; when done, `getWorld`, then download each asset (`fetch` then `upload` to `media/worlds/{id}/...`): web splat (`pickSplatUrls().web`), HQ splat, collider mesh, HQ mesh, pano, thumbnail; save URLs from OUR storage, scale metadata, caption, cost; status `ready`; log an event.
3. `POST /api/worlds/[id]/publish`: set `listings.published_world_id`, status `published`, archive the previous published version, log an event.
4. `scripts/generate-worlds.ts --import <world_id>` (add it) imports worlds made by hand in GH-6 into storage and `worlds` rows.
5. `isDemoMode()`: `POST /api/worlds` returns the saved version and never calls World Labs.
6. `components/tour/WorldVersions.tsx` (host dashboard slot): versions with status, progress, thumbnail, Preview link `/tour/<listing>?version=<n>`, Publish button.

## Done when

The three GH-6 worlds are served from our storage, a page view makes zero requests to api.worldlabs.ai (check the Network tab), a new generation goes generating, ready, published from the dashboard, and every status change is in the feed.
