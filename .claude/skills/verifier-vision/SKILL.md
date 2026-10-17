---
name: verifier-vision
description: Build the neutral Verifier's vision checks with Claude - listing X-ray (facts and contradictions from photos), 3D gap check, room naming on the top-down plan, check-in comparison and review-claim splitting. Covers image prep, structured output, evidence rules and evaluation. Use for GH-9, GH-18 room labels, GH-19, GH-23 and GH-24.
when_to_use: The user mentions "X-ray", "verifier", "check the photos", "contradictions", "sea view lie", "gap check", "find blank spots", "AI-filled areas", "name the rooms", "check-in report", "compare arrival video", "split reviews into claims", "vision prompt", "the model invents facts".
---

# Verifier vision

The Verifier works for neither side. It has no access to host policies or guest budgets. It reports only what images show, with evidence and a confidence. That neutrality is the answer to "why would anyone trust this?".

Schemas: `lib/schemas/verifier.ts` (XrayResult, GapCheckResult, RoomLabels). Prompts: `agents/prompts/verifier-xray.md`, `verifier-gaps.md` (load with `loadPrompt`). Models: `bulkModel()` (Haiku 5.5) for bulk passes, `agentModel()` (Sonnet 5.5) for hard multi-image reasoning.

## Calling Claude with images (AI SDK v7)

```ts
import { generateText, Output } from "ai";
import sharp from "sharp";

const jpeg = await sharp(input)
  .resize({ width: 1024, height: 1024, fit: "inside" })
  .jpeg({ quality: 80 })
  .toBuffer();
const { output } = await generateText({
  model: bulkModel(),
  output: Output.object({ schema: XrayResultSchema }),
  system: loadPrompt("verifier-xray", {
    title,
    description,
    amenities,
    fact_keys: KNOWN_FACT_KEYS.join(", "),
  }),
  messages: [
    {
      role: "user",
      content: [
        { type: "text", text: "photo_01 (living room):" },
        { type: "file", mediaType: "image/jpeg", data: jpeg },
        // ...one text label + one image per photo
      ],
    },
  ],
});
```

- Label every image with a stable id in a text part right before it ("photo_04", "v3", "frame_07"); evidence cites those ids.
- Resize to 1024 px on the long side; JPEG quality 80. Max about 20 images per call; batch more.
- Keep output schemas simple (no .refine or .transform). Check extra rules in code after parsing: evidence ids exist, confidence in 0..1, no duplicate keys.
- Log one event per run with `withEvent` or `logEvent` ("Verifier checked 18 photos: 1 contradiction found"), and write `model` and cost notes.

## GH-9 Listing X-ray

Input: description, amenities, house rules, up to 20 photos. Output to `listing_facts`. A contradiction needs a specific claim in the text ("sea view", "sleeps 6") that the photos do not support; "not shown" alone goes in `missing_photos`. Run Haiku on all listings; run Sonnet on the two hero homes and keep the better one. Must catch both seeded lies in 3 of 3 runs and invent none on the hero homes.

## GH-19 Gap check

Input per viewpoint: six 512 px views (v0..v5, 60 degrees apart, from the rig page) plus the 4 nearest real frames of the same room. Output `GapCheckResultSchema`: per view `issue` (none, blank, smeared, stretched, invented, dark), a host-actionable description, a normalized bbox, severity 1-3; plus visible objects with boxes. Then in code: ray from the viewpoint through the bbox center into the collider BVH gives the 3D position; merge gaps within 1 m; `coverage_score` = views with issue "none" / all views. Objects become anchors for Ask the space. Target: the skipped kitchen corner on Hero 1 v1 found within about 1 m; at most 3 false gaps on Hero 2.

## GH-18 Room names

One top-down render plus the room list and one frame per room; output `RoomLabelsSchema` with pixel positions. Code converts pixels to meters.

## GH-23 Check-in comparison (Beka)

About 12 frames from the arrival video. Match each to a room, compare with that room's listing photos and world screenshots; report `matches`, `differences { room, listed, seen, evidence_frame, severity }`, `missing_items`. Only visible facts, no guesses about cleanliness. Define the schema in `lib/schemas/checkin.ts` (Beka's file; verifier.ts is Temuri's).

## GH-24 Review claims

Haiku splits each review into claims `{ claim, sentiment, room or object }`, then code matches each to the nearest anchor by room and name.

## Evaluating a prompt

1. Fix a small test set (the 2 lies, 2 hero homes, 2 normal listings) and expected results in a JSON file under `scripts/fixtures/` or `tools/verifier/fixtures/`.
2. Run 3 times; count hits, misses and invented findings.
3. Change one thing at a time (prompt wording, model, image size). Keep the version that wins.
