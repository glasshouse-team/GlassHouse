# Tickets

Jira project **GH** on hacktoberfest.atlassian.net ([board](https://hacktoberfest.atlassian.net/jira/software/projects/GH/boards/2)), Epic GH-1. One file per ticket in this folder:

- **All 27 tickets are in Jira.** Each file holds a copy of the Jira text (Jira wins on scope and acceptance criteria) plus repo facts Jira does not have.
- **Build notes** settle the interfaces, file paths, platform limits and test approach the ticket text leaves open. **Needs from people** lists what Claude cannot do itself.
- **In the starter** says what this repo already provides for the ticket. Build on it; don't rewrite it.

Where the repo differs from ticket text, docs/DECISIONS.md says so: AI SDK v7 (D-003), RLS on (D-006), demo dates Mon Nov 9 to Fri Nov 13, 2026 (D-007), service fee after the discount (D-010), automatic tool logging (D-011), and D-012 to D-020 from the ticket review (uploads, anchors, browser-only 3D work, coordinates, 4 demo guests, askHome input, refusals, raw videos). Host pages are `app/host/...` (tickets sometimes write `app/(host)/...`). When the team changes a decision, `/record-decision` adds it there, appends a "Decision updates" line to the affected files here and updates Jira.

Start a ticket in Claude Code with `/start-ticket GH-<n>`; it loads the skills listed below.

## All tickets

| Key | Ticket | Owner | Tier | Hours | Depends on | Skills | In the starter | Jira |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [GH-1](GH-1.md) | Glasshouse: AI-native Airbnb rebuild (Epic) | Temuri | Epic | 0-24 |  | start-ticket | The whole repo: docs, skills, hooks, contracts, starter code | [open](https://hacktoberfest.atlassian.net/browse/GH-1) |
| [GH-2](GH-2.md) | Set up repo, Supabase, Vercel, API keys and CLAUDE.md | Beka | Must | 0-2 |  | supabase-data | Scaffold, all deps, CLAUDE.md, .env.example, PR template, CI. Left: accounts and keys | [open](https://hacktoberfest.atlassian.net/browse/GH-2) |
| [GH-3](GH-3.md) | World Labs account + whole-house 3D go/no-go test | Temuri | Must | 0-2 |  | marble-world-pipeline, mobile-capture | `lib/marble.ts`, `lib/media.ts` (tested), `pnpm worlds`, `pnpm video:prepare` | [open](https://hacktoberfest.atlassian.net/browse/GH-3) |
| [GH-4](GH-4.md) | Reverse-engineer Airbnb: journeys, screen inventory, brand kit, seed spec | Beka | Must | 1-2 | GH-2 | reverse-engineer-airbnb | `docs/teardown.md` template, brand tokens in `app/globals.css` | [open](https://hacktoberfest.atlassian.net/browse/GH-4) |
| [GH-5](GH-5.md) | Shared contracts: DB schema, Zod types, logEvent, page slots, tour API, agent core | Beka | Must | 2-4 | GH-2, GH-4 | shared-contracts, supabase-data | Full draft: migration (tested), Zod schemas, logEvent, createAgent, 8 slot stubs, useTour type. Left: review, apply, freeze | [open](https://hacktoberfest.atlassian.net/browse/GH-5) |
| [GH-6](GH-6.md) | Film 2 hero homes and start their 3D generations | Temuri | Must | 1-3 | GH-3 | mobile-capture, marble-world-pipeline | `pnpm video:prepare`, `pnpm worlds generate --wait` | [open](https://hacktoberfest.atlassian.net/browse/GH-6) |
| [GH-7](GH-7.md) | Seed data: ~12 listings, reviews, house rules, host policies, demo fixtures | Beka | Must | 3-5 | GH-4, GH-5 | supabase-data | `seed/fixtures.ts` (hero price, policy, demo deal); `scripts/seed.ts` stub | [open](https://hacktoberfest.atlassian.net/browse/GH-7) |
| [GH-8](GH-8.md) | Core pages: search, listing page with slots, booking box + computeQuote, host dashboard, role switcher | Beka | Must | 4-8 | GH-4, GH-5, GH-7 | ui-pages, reverse-engineer-airbnb | Placeholder pages with slots rendered; `computeQuote` + tests. Left: real UI, role switcher, booking box | [open](https://hacktoberfest.atlassian.net/browse/GH-8) |
| [GH-9](GH-9.md) | F1 Listing X-ray (Verifier): facts, contradictions and missing photos | Temuri | Must | 3-5 | GH-5, GH-7 | verifier-vision | XrayResult schema, prompt draft, route/script/panel stubs | [open](https://hacktoberfest.atlassian.net/browse/GH-9) |
| [GH-10](GH-10.md) | F3a 3D pipeline: generate, poll, store assets, versions, publish, demo mode | Temuri | Must | 5-8 | GH-3, GH-5, GH-6 | marble-world-pipeline | Marble client + ffmpeg helpers (tested), CLI, World schema, route stubs. Left: routes, storage, `--import`, versions UI | [open](https://hacktoberfest.atlassian.net/browse/GH-10) |
| [GH-11](GH-11.md) | F3b 3D tour viewer: walking, collisions, Jump to room, anchor mode, useTour() API | Temuri | Must | 7-11 | GH-5, GH-10 | splat-tour-viewer | `useTour()` contract type, route and launcher stubs, 3D deps installed | [open](https://hacktoberfest.atlassian.net/browse/GH-11) |
| [GH-12](GH-12.md) | F4 Activity feed: live log of every agent and human action | Beka | Must | 5-6 | GH-5 | realtime-activity-feed | `logEvent`, `withEvent`, auto-logging in createAgent; feed stub | [open](https://hacktoberfest.atlassian.net/browse/GH-12) |
| [GH-13](GH-13.md) | Agent foundation: AI SDK setup, createAgent, private context builders, money validators | Beka | Must | 5-7 | GH-5, GH-12 | agent-builder, negotiation-engine | `createAgent` + test, `validateOffer` + tests, model helpers, prompt drafts. Left: context builders | [open](https://hacktoberfest.atlassian.net/browse/GH-13) |
| [GH-14](GH-14.md) | F2 Trip brief search: guest agent ranks and explains a shortlist | Beka | Must | 7-9 | GH-8, GH-9, GH-13 | agent-builder, ui-pages | TripBrief schema, `/api/search` stub, guest prompt draft | [open](https://hacktoberfest.atlassian.net/browse/GH-14) |
| [GH-15](GH-15.md) | F5 Negotiation and deal room: agents negotiate within code-enforced rules; host approves | Beka | Must | 9-13 | GH-7, GH-8, GH-12, GH-13 | negotiation-engine, agent-builder, ui-pages | Validators, `acceptanceOutcome`, demo fixture, deal schemas, route and page stubs | [open](https://hacktoberfest.atlassian.net/browse/GH-15) |
| [GH-16](GH-16.md) | F5b Host agent Q&A: Ask this home with sourced answers | Temuri | Must | 11-13 | GH-7, GH-9, GH-13 | agent-builder | host-qa prompt draft, `/api/qa` stub, both slot stubs | [open](https://hacktoberfest.atlassian.net/browse/GH-16) |
| [GH-17](GH-17.md) | MVP checkpoint (hour 13): end-to-end demo run, backup video, cut decisions | Temuri | Milestone | 13 | GH-8, GH-9, GH-10, GH-11, GH-12, GH-14, GH-15, GH-16 | demo-readiness | `demo-readiness` skill, `/api/health`, docs/DEMO.md | [open](https://hacktoberfest.atlassian.net/browse/GH-17) |
| [GH-18](GH-18.md) | F7 Floor plan v1 from the 3D mesh (v2 stretch) | Temuri | Should | 13-16 | GH-10, GH-11 | floor-plan-geometry, verifier-vision | `lib/geometry/slice.ts` + tests, FloorPlan schema, route/script/card stubs, geometry deps | [open](https://hacktoberfest.atlassian.net/browse/GH-18) |
| [GH-19](GH-19.md) | F6 Gap check v1: blank spots, host notes, pins, fill-in version | Temuri | Should | 15-18 | GH-10, GH-11, GH-18 | verifier-vision, splat-tour-viewer | Gap schemas, gaps prompt draft, rig/route/script/GapTasks stubs, clip-join helpers | [open](https://hacktoberfest.atlassian.net/browse/GH-19) |
| [GH-20](GH-20.md) | F8 Ask the space: guest agent answers and flies the 3D camera | Beka | Should | 13-15 | GH-9, GH-11, GH-13 | agent-builder, splat-tour-viewer | `/api/ask-space` stub, `components/tour-ext/`, `useTour()` type | [open](https://hacktoberfest.atlassian.net/browse/GH-20) |
| [GH-21](GH-21.md) | F9 Honesty overlay + coverage score | Beka | Should | 15-17 | GH-11, GH-19 | splat-tour-viewer, ui-pages | `coverage_score` column, `--honesty` color token | [open](https://hacktoberfest.atlassian.net/browse/GH-21) |
| [GH-22](GH-22.md) | F10 Guided walkthrough capture in the phone browser (stretch) | Temuri | Stretch | after 18 | GH-10 | mobile-capture | Capture page stub, capture schemas, `/api/captures` stub, launcher stub | [open](https://hacktoberfest.atlassian.net/browse/GH-22) |
| [GH-23](GH-23.md) | F11 Check-in verification (stretch) | Beka | Stretch | after 18 | GH-9, GH-10 | verifier-vision, mobile-capture, ui-pages | Trip page stub, `/api/checkin` stub, `checkins` table | [open](https://hacktoberfest.atlassian.net/browse/GH-23) |
| [GH-24](GH-24.md) | F12 Spatial reviews pinned in 3D (nice-to-have) | Temuri | Nice | spare | GH-7, GH-11, GH-19 | verifier-vision, splat-tour-viewer | `review_claims` table, `split-reviews.ts` stub | [open](https://hacktoberfest.atlassian.net/browse/GH-24) |
| [GH-25](GH-25.md) | F13 Host narration to listing draft (nice-to-have) | Beka | Nice | spare | GH-9, GH-13 | agent-builder, mobile-capture | `/api/listing-draft` stub | [open](https://hacktoberfest.atlassian.net/browse/GH-25) |
| [GH-26](GH-26.md) | Demo mode, reset script and QA checklist | Beka | Demo | 18-20 | GH-17 | demo-readiness, supabase-data | `DEMO_MODE`, `/demo/check` and `reset-demo.ts` stubs, `/api/health` | [open](https://hacktoberfest.atlassian.net/browse/GH-26) |
| [GH-27](GH-27.md) | Pitch, demo script, slides and rehearsals | Temuri | Demo | 18-24 | GH-17 | demo-readiness | docs/DEMO.md (script, judge Q&A), `docs/pitch/` | [open](https://hacktoberfest.atlassian.net/browse/GH-27) |

## Build order per developer

- **Temuri:** GH-3 → GH-6 → (review GH-5) → GH-9 → GH-10 → GH-11 → GH-16 → GH-17 → GH-18 → GH-19 → GH-27 (stretch: GH-22, GH-24).
- **Beka:** GH-2 → GH-4 → GH-5 → GH-7 → GH-8 → GH-12 → GH-13 → GH-14 → GH-15 → GH-20 → GH-21 → GH-26 (stretch: GH-23, GH-25).

Cut order if behind at hour 13: GH-21, then GH-20, then GH-19. The floor plan v1 (GH-18) stays.
