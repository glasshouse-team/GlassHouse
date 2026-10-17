# GH-9: F1 Listing X-ray (Verifier): facts, contradictions and missing photos

> Offline copy of [GH-9](https://hacktoberfest.atlassian.net/browse/GH-9), taken 2026-10-17. Read the live ticket when the Atlassian MCP server is connected: Jira wins on scope and acceptance criteria. "In the starter" below wins on repo facts (paths, versions, dates).

| Owner | Type | Priority | Hours | Depends on | Skills |
| --- | --- | --- | --- | --- | --- |
| Temuri | Story | High | 3-5 | GH-5, GH-7 | `verifier-vision` |

Labels: ai, hours-3-5, must-have, verifier

## In the starter

- `XrayResultSchema` and `KNOWN_FACT_KEYS` in `lib/schemas/verifier.ts`; prompt draft `agents/prompts/verifier-xray.md`; stubs for `POST /api/xray/[listingId]`, `scripts/run-xray.ts` (`pnpm xray`) and `components/xray/XrayPanel.tsx`. `sharp` is installed. Use `withEvent` (tools/_withEvent.ts) for the feed line.
- Left: `tools/verifier/xray.ts`, the route, the script and the panel.

---

## Goal

The neutral Verifier reads each listing's photos and text, extracts facts with evidence, and flags contradictions ("says sea view; no photo shows the sea"). This is the first proof that "listings lie and we catch it", and it feeds search ranking (GH-14) and the host agent (GH-16).

**Owner:** Temuri (run it while the hero worlds generate) · **When:** hours 3–5 · **Estimate:** 2h · **Depends on:** GH-5, GH-7 · **Blocks:** GH-14 (search uses facts), GH-16

## Build

### 1. `scripts/run-xray.ts` and `POST /api/xray/[listingId]` (same core function in `tools/verifier/xray.ts`)

- Load the listing, its description, amenities, house rules and up to 20 photos.
- Resize photos to 1024 px on the long side (`sharp`) and send them as images with ids (`photo_01`…).
- Model: `MODEL_BULK` (Haiku 5.5) for all listings. Also run `MODEL_AGENT` (Sonnet 5.5) on the 2 hero homes and keep whichever is more accurate.
- Use structured output validated with the Zod schema in `lib/schemas/verifier.ts`:

```ts
XrayResult = {
  facts: { key: 'beds_counted' | 'sleeping_spots' | 'has_desk' | 'desk_near_window' | 'stairs' |
           'step_free_entrance' | 'kitchen_equipment' | 'outdoor_space' | 'view_type' |
           'natural_light' | 'washer' | 'tv' | 'workspace' | 'parking_visible' | string;
           value: string | number | boolean; evidence: string[]; confidence: number }[];
  contradictions: { claim: string; finding: string; evidence: string[];
                    severity: 'low' | 'medium' | 'high' }[];
  missing_photos: string[]   // e.g. ['bathroom', 'view from bedroom']
}
```

- Upsert into `listing_facts`.
- `logEvent`: actor Verifier, summary e.g. "Verifier checked 18 photos: 1 contradiction found".

### 2. Verifier system prompt (`agents/prompts/verifier-xray.md`, Temuri owns)

"You work for neither guest nor host. Report only what the images show. Every fact cites photo ids. If unsure, use low confidence or leave it out. A contradiction requires a specific claim in the text that the photos do not support or that they contradict."

### 3. UI `components/xray/XrayPanel.tsx` (replaces the stub)

- Green "Seen in photos" chips for key facts; hovering a chip shows the evidence thumbnails.
- Amber cards for contradictions with photo thumbnails.
- A "Not shown in photos" list.
- A small "Checked by Verifier · <time>" footer.

## Acceptance criteria

- [ ] All seed listings have `listing_facts` rows.
- [ ] The "sea view" lie and the "sleeps 6 with 4 beds" lie are both caught in **3 of 3** runs.
- [ ] No contradictions are invented on the hero homes (check by eye).
- [ ] The panel renders on phone and laptop, and the event appears in the feed.
- [ ] Cost note in a comment: total tokens and cost for one full run.

## Owns

`scripts/run-xray.ts`, `app/api/xray/`, `tools/verifier/xray.ts`, `components/xray/`, `lib/schemas/verifier.ts`, `agents/prompts/verifier-xray.md`
