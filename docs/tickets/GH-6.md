# GH-6: Film 2 hero homes and start their 3D generations (incl. gap demo versions)

> The ticket text below the line is a copy of [GH-6](https://hacktoberfest.atlassian.net/browse/GH-6) from Jira (2026-10-17); for scope and acceptance criteria, Jira wins. The sections above the line are repo facts Jira does not have (**In the starter**, **Build notes**, **Needs from people**), and `/start-ticket` reads them every time.

| Owner | Type | Priority | Hours | Depends on | Skills |
| --- | --- | --- | --- | --- | --- |
| Temuri | Task | Highest | 1-3 | GH-3 | `mobile-capture`, `marble-world-pipeline` |

Labels: 3d, capture, hours-1-3, must-have

## In the starter

- `pnpm video:prepare <raw>` and `pnpm worlds generate --video <url> --name "Hero 1 v1" --wait` (prints the operation and world ids to paste into the comment). Joining a walkthrough and a fill-in clip: `joinClipsArgs` in `lib/media.ts`.
- Upload to Supabase Storage by hand (dashboard) until GH-10 adds the pipeline.
- The `mobile-capture` skill has the filming checklist.

## Build notes

- Upload photos to `media/listings/{HERO_LISTINGS.heroN.id}/photos/NN-{room}.jpg` (NN = order, e.g. `03-kitchen.jpg`), resized to at most 1600 px with sharp, which also drops GPS data. The seed (GH-7) reads that folder.
- Note when you enter each room (seconds into the video). GH-10 stores it as the capture's `room_markers`; the floor plan and gap check use it as the room list.
- Hero 1 v2: concatenate the raw walkthrough and the fill-in clip (same orientation), then `pnpm video:prepare` once.
- Keep raw videos on a laptop or the shared drive (D-020). Upload only prepared mp4s to `media/captures/{listingId}/{captureId}/prepared.mp4`, a new uuid per clip, and post each capture id with its operation and world ids.

## Needs from people

- Owner consent (a screenshot in the ticket); filming both homes; house copy and manuals for GH-7.

---

## Goal

Get the two real homes the whole demo runs on, filmed well and generated early (each world takes about 5 minutes). Hero home 1 also gets a deliberately incomplete version and a "filled" version for the gap demo.

**Owner:** Temuri · **When:** hours 1–3 (start right after the GH-3 decision) · **Estimate:** 2h including travel · **Depends on:** GH-3 · **Blocks:** GH-7 (seed), GH-10/11 (3D), GH-18/19 (floor plan, gaps)

## Before filming

- [ ] Written or chat consent from each home owner (screenshot in a ticket comment).
- [ ] Remove personal items, photos of people, documents, screens with private content.
- [ ] Lights on, curtains open, all interior doors open, nobody in frame.

## Filming checklist (per home)

1. **Walkthrough video, 60–90 seconds,** following the GH-3 path:
   - Walk slowly with the phone at chest height.
   - Make a slow full turn in the middle of every room.
   - Keep it under 20 MB after the transcode (720p, about 2 Mbit/s).
2. **Room list** in the order you walked it, e.g. Entrance, Living room, Kitchen, Bedroom 1, Bathroom. Post it in a comment; it becomes the room checklist and the room labels for the floor plan.
3. **Photos, 15–25 per home:** every room from 2–3 angles, plus the view from the window and the bathroom. These seed the listing gallery and the X-ray.
4. **Hero home 1 only, for the gap demo:**
   - Version 1: skip one corner on purpose, e.g. the kitchen corner left of the fridge. Don't turn toward it.
   - A separate 10-second **fill-in clip** of exactly that corner.
   - Later (stretch, GH-23): move one chair or lamp and record a 30-second "check-in" clip.

## Generate

- Hero 1, version 1: walkthrough with the skipped corner.
- Hero 1, version 2: walkthrough + fill-in, using whichever joining method GH-3 showed works.
- Hero 2, version 1: full walkthrough.

Use `scripts/generate-worlds.ts`. Save every `operation_id` and `world_id` in a comment, because GH-10 imports them.

## Acceptance criteria

- [ ] Three worlds ready (Hero 1 v1, Hero 1 v2, Hero 2 v1) and viewable in Marble.
- [ ] Raw videos uploaded to `captures`, prepared mp4s and photos to `media` with room labels in the filenames (e.g. `kitchen-02.jpg`).
- [ ] Room lists and world ids posted as comments.
- [ ] Hero 1 v1 visibly has the blank corner; v2 doesn't.

## Hand-off

Temuri writes the listing copy and house manual for both hero homes, since he saw them: wifi, boiler, check-in steps, parking, pets, 5 facts the host agent can answer. He sends them to Beka for GH-7.

## Decision updates

- 2026-10-18 D-009: Photograph each hero home as one 8-photo ring per room spot (middle of the room, chest height, 0.5x lens, turning right about 45 degrees; big rooms get 2 spots) plus a photo of each doorway, then `pnpm worlds generate --images ... --azimuths 0,45,...,315 --reconstruct`. About 5 spots per home: 8,000 credits, 6-9 minutes in parallel. Hero 1 v2 is the kitchen spot re-shot with the corner covered (was: a 60-90 s walkthrough video, about 5 minutes a world). Jira: updated
