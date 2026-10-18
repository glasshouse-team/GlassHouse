# GH-3: World Labs account + whole-house 3D go/no-go test

> The ticket text below the line is a copy of [GH-3](https://hacktoberfest.atlassian.net/browse/GH-3) from Jira (2026-10-17); for scope and acceptance criteria, Jira wins. The sections above the line are repo facts Jira does not have (**In the starter**, **Build notes**, **Needs from people**), and `/start-ticket` reads them every time.

| Owner | Type | Priority | Hours | Depends on | Skills |
| --- | --- | --- | --- | --- | --- |
| Temuri | Task | Highest | 0-2 | nothing | `marble-world-pipeline`, `mobile-capture` |

Labels: 3d, hours-0-2, must-have, setup

## In the starter

- `lib/marble.ts`: generate, poll and fetch worlds, readable errors for 400/401/402/422, web and HQ splat picking, scale factor and ground offset. Tested.
- `lib/media.ts`: ffmpeg arguments for prepare, frame extraction and clip joining, with a bitrate budget that keeps files under 20 MB. Tested.
- `pnpm video:prepare walk.mov` writes `walk-720.mp4` (720p H.264, no audio, under 20 MB).
- `pnpm worlds generate --video <public-url> --name "go-no-go" --wait`, then `pnpm worlds get <world_id>` prints the splat sizes and URLs, collider mesh, scale factor and ground offset for the decision comment. Photos: `--images <url1,url2,...> --azimuths 0,90,180,270`.
- Left: account and credits, filming, a public upload, the backup paths, the decision comment, and D-009 in docs/DECISIONS.md.

## Build notes

- `pnpm worlds generate --video walk-720.mp4 --wait` now uploads local files straight to World Labs (media assets): the go/no-go test needs no public URL and no Supabase.
- Record per world: splat sizes (is `full_res` over 50 MB?), the collider's `extensionsUsed` (Draco needs extra parsing in Node), and the floor from `marbleToThree` + `floorHeight` compared with `ground_plane_offset` (D-016). Put the results in D-009.
- Fill-in join test: concatenate the raw clips first, then prepare once. Two prepared clips together exceed 20 MB, and `-c copy` needs the same size and orientation.
- `lib/marble.ts` and the CLI already exist; extend them. Optional: `pnpm worlds inspect <world_id>` that HEADs each asset for its size and reads the collider GLB's JSON chunk (extensions, POSITION min/max).

## Needs from people

- World Labs credits; filming; the verdict and screenshots; one tape-measured room width to check the metric scale.

---

## Goal

By hour 2, decide which input path gives a usable **whole-house** 3D world. Everything 3D depends on this decision.

**Owner:** Temuri · **When:** hours 0–2 · **Estimate:** 1.5h (mostly waiting on generations) · **Blocks:** GH-6, GH-10, GH-11

## Steps

### 1. Account

Create a World Labs Platform account at platform.worldlabs.ai and an API key. Buy API credits (about $30–60 total) and set a cap. A standard world costs about $1.20–1.28; `marble-1.1-plus` costs more.

### 2. Record the test walkthrough (1–2 minutes)

Film any real home:

- Lights on, all doors open.
- Walk slowly, phone at chest height.
- In the middle of each room, turn one slow full circle.

### 3. Prepare the video

It must be under **20 MB**, the limit for media sent by URL:

```
ffmpeg -i walk.mov -vf scale=-2:720 -r 30 -an -c:v libx264 -preset veryfast -b:v 2M walk-720.mp4
```

### 4. Upload

Put it in Supabase `media` (public) or any public URL. The URL must open in an incognito window with no login.

### 5. Generate

```
POST https://api.worldlabs.ai/marble/v1/worlds:generate
Header: WLT-Api-Key: <key>
{
  "display_name": "go-no-go house",
  "model": "marble-1.1-plus",
  "world_prompt": {
    "type": "video",
    "video_prompt": { "source": "uri", "uri": "<public mp4 url>" },
    "text_prompt": "A two-bedroom apartment with a living room, kitchen and bathroom"
  }
}
```

Poll `GET /marble/v1/operations/{operation_id}` every 15 s (about 5 minutes), then `GET /marble/v1/worlds/{world_id}`.

### 6. Judge the result

Open `world_marble_url`. Are rooms coherent, walls straight, doors visible, and is it walkable from room to room? Write down:

- The keys in `assets.splats.spz_urls` (sizes).
- `assets.mesh.collider_mesh_url` and its file format.
- `semantics_metadata.metric_scale_factor` and `ground_plane_offset`.

### 7. Run two backup tests in parallel while you wait

- **B:** 20–30 photos of the same home sent to Tencent HY World on Scenario (multi-view to splat).
- **C:** 2–8 photos of one room sent to Marble `multi-image`, with an `azimuth` per photo.

### 8. Test fill-in joining

Join two clips with `ffmpeg -f concat` and generate again. This tells GH-19 whether "walkthrough + fill-in clips" works as one video.

## Decision: post it as a comment by hour 2

- **Path 1 (preferred):** whole-house video → Marble 1.1 Plus.
- **Path 2:** many photos → HY World.
- **Path 3 (fallback):** one splat per room, placed together in one scene in the viewer.

Attach screenshots and the asset list.

## Acceptance criteria

- [ ] At least one world is generated and viewed.
- [ ] A decision comment with screenshots, asset URLs, scale factor and mesh format.
- [ ] The working request/poll code is saved as the start of `lib/marble.ts` and `scripts/generate-worlds.ts`, so GH-10 builds on it.
- [ ] Remaining credits noted in the comment.

## Owns

`lib/marble.ts`, `scripts/generate-worlds.ts`

## Notes for Claude Code

Ask it to write a tiny TypeScript script: generate → poll → fetch world → print assets. Keep the key in `.env.local` as `WORLDLABS_API_KEY`.

## Decision updates

- 2026-10-18 D-009: Per-spot tour chosen: one `marble-1.1-plus` world per room spot from its 8-photo ring (0.5x lens, turning right about 45 degrees, `--reconstruct`); our doorway arrows link the spots. Whole-house worlds from video or 8 photos mixed rooms, and a ring world blurs about 1 m from its spot. The test apartment's 5 spot worlds and their links are in the decision comment (was: Path 1, 2 or 3 open). Jira: updated
