# GH-1: Glasshouse: AI-native Airbnb rebuild (Hackathon Track 01 "Make it better")

> The ticket text below the line is a copy of [GH-1](https://hacktoberfest.atlassian.net/browse/GH-1) from Jira (2026-10-17); for scope and acceptance criteria, Jira wins. The sections above the line are repo facts Jira does not have (**In the starter**, **Build notes**, **Needs from people**), and `/start-ticket` reads them every time.

| Owner | Type | Priority | Hours | Depends on | Skills |
| --- | --- | --- | --- | --- | --- |
| Temuri | Epic | Highest | 0-24 | nothing | `start-ticket` |

Labels: hackathon, track-01

## In the starter

- Everything in this repository: `CLAUDE.md`, `docs/`, `.claude/` (skills, hooks, rules, the `pr-reviewer` subagent), the shared contracts and the starter code. Start with docs/PLAN.md and this folder's INDEX.md.
- Differences from the text below: the AI SDK is v7 (docs/DECISIONS.md D-003). Ownership is refined in docs/OWNERSHIP.md (Temuri owns the Verifier and host-qa prompts; team-wide config files need both developers). Host pages live in `app/host/` (the text writes `app/(host)/`).

## Build notes

- Project-wide rules from the ticket review: every browser upload goes through `createSignedUpload` (D-013), every 3D coordinate through `lib/geometry/frame.ts` (D-016), and WebGL work (top-down render, screenshots) runs in the browser rig page (D-015).
- Pages that only read the database need `await connection()` or Next prerenders them at build time. Long routes set `export const maxDuration = 300` (Vercel Hobby's maximum).
- Don't count on ffmpeg inside Vercel functions: prepare videos on a laptop (`pnpm video:prepare`) and take frames in the browser.

## Needs from people

- Decide: Supabase Free (50 MB per file) or Pro, and a public GitHub repo or paid plans (details in GH-2).

---

## Glasshouse: Airbnb rebuilt as if AI was there from day one

**One line:** Three agents (Guest, Host, Verifier) search, check and negotiate for people, and every home comes with a walkable 3D model and a floor plan built from the host's own footage. Blank spots are flagged, never invented.

**Team:** Temuri Tsutskiridze (Dev A) and Beka Maisuradze (Dev B), 24 hours, each running Claude Code.
**Repo:** one GitHub repository, `glasshouse` (single Next.js app). No separate backend or 3D repos.
**Full plan:** Claude doc "Glasshouse — Hackathon Project Plan" (ask Temuri for the link and access).

---

### 1. Problem

- Guests can't trust listing photos and can't picture the layout from a gallery.
- Price negotiation happens by hand in chat.
- Hosts answer the same questions again and again and reshoot photos without knowing what is missing.
- Airbnb itself added conversational AI search, review summaries and AI listing comparisons in 2026, so "AI search" alone is not our edge.

### 2. Solution: three agents plus an honest 3D home

| Agent | Works for | What it does |
| --- | --- | --- |
| Guest agent | The guest | Turns a trip brief into a ranked shortlist with reasons, asks the host questions, flies the 3D camera, negotiates within the guest's private budget |
| Host agent | The host | Answers guest questions from facts, rules and the house manual; counters offers within the host's rules; asks the host for missing footage |
| Verifier | Nobody (neutral) | Checks listings for contradictions (X-ray), finds blank spots in the 3D, names rooms for the floor plan, compares check-in footage with the listing |

Every agent action is written to a live **activity feed**, so everyone can see who did what (a Track 01 requirement).

### 3. How it maps to judging

1. **A clear problem:** "You can't trust or picture a home before you book it."
2. **A creative solution:** a 3D home with an honesty overlay and a floor plan, plus agents that negotiate within rules enforced by code.
3. **It really solves the problem:** the Verifier closes the loop by checking listings and, at check-in, comparing what the guest sees with what was listed.

Not judged: business model, pricing, global expansion. Spend no time on them.

### 4. Stack (decided)

- **App:** Next.js (App Router) + TypeScript, Tailwind + shadcn/ui, TanStack Query, Zod
- **Data:** Supabase (Postgres, Storage, Realtime)
- **Agents:** Vercel AI SDK v6 (`ToolLoopAgent`) + `@ai-sdk/anthropic`
  - `claude-sonnet-5-5` for agents and vision
  - `claude-haiku-5-5` for bulk checks
- **3D generation:** World Labs Marble API (`marble-1.1-plus` for the whole house); backup is Tencent HY World on Scenario
- **3D rendering:** three.js + React Three Fiber + drei + Spark (`@sparkjsdev/spark`)
- **Geometry:** three-mesh-bvh, d3-contour, polygon-clipping, simplify-js
- **Media:** MediaRecorder, getUserMedia, ffmpeg (`ffmpeg-static`)
- **Hosting:** Vercel (app), Supabase cloud (data), ngrok (HTTPS on phones during development)

### 5. Ownership: who owns which folders

**Rule: never edit a folder the other person owns.** If you need a change there, comment on their ticket or open a PR and ask them to review it.

| Area | Temuri (Dev A) | Beka (Dev B) |
| --- | --- | --- |
| Pages | `app/(guest)/tour/`, `app/(host)/capture/`, `app/tools/rig/` | All other pages: search, listing, deal, trip, host dashboard, layout, role switcher |
| API routes | `api/worlds/`, `api/xray/`, `api/captures/`, `api/qa/` | `api/search/`, `api/deals/`, `api/ask-space/`, `api/checkin/`, `api/listing-draft/` |
| Components | `tour/`, `floorplan/`, `capture/`, `xray/`, `ask-home/`, `gaps/` | `ui/`, `search/`, `listing/`, `deal/`, `feed/`, `tour-ext/` (add-ons on top of the tour) |
| lib | `marble.ts`, `media.ts`, `geometry/`, `schemas/world.ts`, `schemas/verifier.ts` | `supabase.ts`, `events.ts`, `pricing.ts`, `validators.ts`, `schemas/core.ts`, `claude.ts` |
| Agents and tools | `agents/verifier.ts`, `tools/verifier/`, `tools/host-qa/` | `agents/core.ts`, `agents/guest.ts`, `agents/host.ts`, `agents/context.ts`, `agents/prompts/`, `tools/guest/`, `tools/negotiation/` |
| Scripts | `generate-worlds.ts`, `run-xray.ts`, `run-gaps.ts`, `build-floorplans.ts` | `seed.ts`, `reset-demo.ts` |
| Database | May add new migration files only | Owns `0001_core.sql`; nobody edits old migrations |
| Repo root | | `CLAUDE.md`, `package.json` baseline, `.env.example`, configs |

**Contracts between the two halves** are defined in the "Shared contracts" ticket and frozen at hour 4:

- **Page slots:** Beka's listing page and host dashboard render Temuri's components.
- **Tour API:** `useTour()` from `components/tour/TourContext.tsx`.
- **Events:** `logEvent()`.
- **Agent core:** `createAgent()`, `buildHostContext()`.
- **Database schema and Zod types.**

### 6. Working agreement

1. `main` always deploys (Vercel). Never push broken code to `main`.
2. One branch per ticket, named after its key, e.g. `GH-18-floor-plan`. Open a PR; the other dev gives it a 5-minute review.
3. Merge at least every 2 hours. Each dev runs two Claude Code sessions in separate git worktrees.
4. Code rules:
   - Prices are stored in cents.
   - Every agent tool and human action calls `logEvent`.
   - All LLM output is validated with Zod.
   - Model ids come from env vars.
   - Money rules are enforced in code, never only in prompts.
5. `package.json` changes go in small separate commits; rebase before merging.
6. Every ticket's **Definition of Done:**
   - Merged and deployed.
   - Works on a laptop and a phone.
   - Its actions show in the activity feed.
   - No console errors.
   - A 20-second screen recording is attached to the ticket.

### 7. Build order and gates

- **Hours 0–4:** setup, 3D go/no-go test, Airbnb teardown, shared contracts, hero-home filming.
- **Must-have by hour 13 (MVP checkpoint):** X-ray, 3D pipeline + viewer, seed data, core pages, activity feed, agent foundation, trip brief search, negotiation, host Q&A.
- **Should-have, hours 13–18:** floor plan v1, gap check v1, Ask the space, honesty overlay.
- **Hour 18:** feature freeze.
- **Stretch or slide only:** guided capture, check-in verification, spatial reviews, host narration.
- **Hours 18–22:** polish, sleep in turns.
- **Hours 22–24:** rehearse three times.

### 8. Demo story (3 minutes)

1. Trip brief → shortlist with cited reasons.
2. The X-ray catches a fake "sea view".
3. Walk the 3D home with the floor plan minimap.
4. "Where would I work?" → the camera flies to the desk.
5. "Show what's real" overlay.
6. "Can I pay $50 less?" → the agents negotiate live ($470 → $495 → $480).
7. The host taps Approve.
8. Host side: the gap note "Kitchen corner is blank", then the fill-in version with a higher coverage score.

## Decision updates

- 2026-10-18 D-009: The 3D is a per-spot tour: one Marble world per room spot from an 8-photo ring; visitors look around from each spot and our doorway arrows switch rooms, like Zillow (was: a walkable whole-house 3D model). Jira: pending
