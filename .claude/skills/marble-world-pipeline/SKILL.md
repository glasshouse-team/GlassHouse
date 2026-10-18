---
name: marble-world-pipeline
description: Generate per-spot 3D worlds (one per room spot) with the World Labs Marble API, then store and version them - input preparation with ffmpeg, generate and poll, download assets into our storage, metric scale, publish, demo mode, fallbacks. Use for GH-3 (go/no-go test), GH-6 (hero homes) and GH-10 (pipeline).
when_to_use: The user mentions "World Labs", "Marble", "generate the 3D", "go/no-go test", "world version", "publish world", "splat", "spz", "collider mesh", "metric scale", "prepare the video", "the 3D looks wrong", "HY World".
---

# World Labs Marble pipeline

Client: `lib/marble.ts` (tested). CLI: `pnpm worlds` (scripts/generate-worlds.ts). Video prep: `pnpm video:prepare` (lib/media.ts, ffmpeg-static). API docs: https://docs.worldlabs.ai/api (checked 2026-10-17).

**Rule: generate once per version, copy every asset into our Supabase storage, and never call World Labs on a page view.** A generation takes about 6-9 minutes and 1,600 credits; `marble-1.1-plus` costs the same as `marble-1.1` (GH-3). Videos must be 30 s or shorter: longer ones are accepted, then fail after about 47 minutes.

## API in one screen

- Auth header: `WLT-Api-Key: <WORLDLABS_API_KEY>`. Base: `https://api.worldlabs.ai/marble/v1`.
- `POST /worlds:generate` with `{ model, display_name (max 64), world_prompt, seed?, tags?, permission? }`, returns an operation `{ operation_id, done, ... }`.
- Models: `marble-1.1-plus` (dynamic world sizing; our default, same 1,600 credits as `marble-1.1` in GH-3), `marble-1.1` (the API default), `marble-1.0`, `marble-1.0-draft`.
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

## GH-3: go/no-go (done: D-009, per-spot tour)

One world per room spot, linked by our doorway arrows, like Zillow. Whole-house worlds from a video or from 8 photos mixed rooms (a toilet by the kitchen, a fridge in the hall), and every Marble world blurs about 1 m from where its photos were taken, even with photos from 2 spots. The recipe:

1. Per spot, 8 photos from the middle of the room: chest height, 0.5x lens, turning right about 45 degrees each (mobile-capture skill). iPhone HEIC: convert with `sips -s format jpeg`, then bake the EXIF rotation (sharp `.rotate()`), because World Labs may ignore it.
2. `pnpm worlds generate --images <8 jpgs in turning order> --azimuths 0,45,90,135,180,225,270,315 --reconstruct --prompt "The <room> of a real apartment, seen from its middle. Keep everything exactly as the photos show; do not add objects, doors or windows that are not in them." --wait`. A 9-photo ring: drop the most redundant shot and keep 40-degree steps for the rest.
3. `pnpm worlds inspect <world_id>`: asset sizes, collider, floor check. In bedrooms `ground_plane_offset` marks the bed top; trust `floorHeight`.
4. The spot graph: for each doorway, the spot it leads to and its azimuth (the direction of the ring photo it is centred in). After `marbleToThree`, azimuth az points along (sin az, 0, -cos az). A Sonnet step can label this from the photos.

Layout prompts help only a little: with `--no-recaption` (prompt as written) a whole-house world kept the right rooms around the hall but still pulled in objects from other rooms; with World Labs' own rewrite it merged rooms.

## GH-10: the pipeline

Per spot (D-009): one generation and one `worlds` row per spot, plus the spot's doorway links (`worlds.spot`, `spot_label`, `links` from migration 0002; `captures.kind` `ring`).

1. `POST /api/worlds { listingId, captureIds }`: today (D-038) it checks the captures and logs `world.generation_requested`, and a person runs `pnpm worlds generate` from it. The web pipeline will: next `worlds.version`, status `generating`, store `operation_id`, log "World v2 generating for <listing>".
2. `GET /api/worlds/[id]/status` (the host page polls every 15 s): `getOperation`; when done, `getWorld`, then download each asset (`fetch` then `upload` to `media/worlds/{id}/...`): web splat (`pickSplatUrls().web`), HQ splat, collider mesh, HQ mesh, pano, thumbnail; save URLs from OUR storage, scale metadata, caption, cost; status `ready`; log an event.
3. `POST /api/worlds/[id]/publish`: set `listings.published_world_id`, status `published`, archive the previous published version, log an event.
4. `pnpm worlds --import hero-2` (lib/marble-worlds.ts `importVersion`, `publishVersion`) imports the GH-6 spot worlds listed in docs/hero-worlds.json into storage and `worlds` rows and publishes the newest version; a spot reused by another version shares the first row's files (D-031). `pnpm worlds import <world_id> --listing <id> --version <n> --spot <key>` imports one; `pnpm worlds verify hero-2` checks URLs and collider floors.
5. `isDemoMode()`: `POST /api/worlds` returns `{ status: "demo" }` (the saved version stays) and never calls World Labs.
6. `components/tour/WorldVersions.tsx` (host dashboard slot): versions with status, progress, thumbnail, Preview link `/tour/<listing>?version=<n>`, Publish button.

## Done when

The GH-6 spot worlds are served from our storage, a page view makes zero requests to api.worldlabs.ai (check the Network tab), a new generation goes generating, ready, published from the dashboard, and every status change is in the feed.
