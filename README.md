# Glasshouse

Airbnb rebuilt as if AI was there from day one. Three agents search, check and negotiate for people, and every home comes with a walkable 3D model and a floor plan built from the host's own footage. Blank spots are flagged, never invented.

- **Hackathon:** Track 01 "Make it better", 24 hours
- **Team:** Temuri Tsutskiridze (Dev A: 3D, capture, floor plan, Verifier) and Beka Maisuradze (Dev B: app, agents, negotiation, data)
- **Jira:** project GH on hacktoberfest.atlassian.net, Epic GH-1 ([board](https://hacktoberfest.atlassian.net/jira/software/projects/GH/boards/2))

## Quick start

Requirements: Node 22+ and pnpm (`corepack enable pnpm`), git. Optional: the GitHub CLI `gh`.

```bash
pnpm install                  # also downloads ffmpeg and the Supabase CLI binaries
cp .env.example .env.local    # then fill in the keys (docs/SETUP.md)
pnpm dev                      # http://localhost:3000
pnpm check                    # typecheck + lint + 41 unit tests
```

The home page is a developer index: every route is a placeholder that names the ticket and owner that builds it. `/api/health` shows which keys are configured.

## What is already built

| Piece                                                                                        | Where                                                     | Ticket             |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ------------------ |
| Next.js 16 app with every page and API route stubbed                                         | `app/`                                                    | GH-2, GH-8         |
| Draft database schema with RLS, tested on Postgres 18                                        | `supabase/migrations/0001_core.sql`                       | GH-5               |
| Shared types (Zod)                                                                           | `lib/schemas/`                                            | GH-5               |
| Price math `computeQuote` and offer rules `validateOffer`, with the "$50 less" demo as tests | `lib/pricing.ts`, `lib/validators.ts`, `seed/fixtures.ts` | GH-8, GH-13, GH-15 |
| Agent factory on AI SDK v7 with automatic feed logging (tested with a mock model)            | `agents/core.ts`                                          | GH-13              |
| Activity feed logger                                                                         | `lib/events.ts`, `tools/_withEvent.ts`                    | GH-12              |
| World Labs client + CLI (`pnpm worlds`)                                                      | `lib/marble.ts`, `scripts/generate-worlds.ts`             | GH-3, GH-10        |
| Walkthrough video prep (`pnpm video:prepare`)                                                | `lib/media.ts`, `scripts/prepare-video.ts`                | GH-3, GH-6         |
| Mesh slicing for the floor plan                                                              | `lib/geometry/slice.ts`                                   | GH-18              |
| Slot stubs and the `useTour()` contract                                                      | `components/`                                             | GH-5               |
| Draft agent prompts                                                                          | `agents/prompts/`                                         | GH-9, GH-13, GH-16 |
| CI, PR template, CODEOWNERS template                                                         | `.github/`                                                | GH-2               |

## Working with Claude Code

This repo is set up so Claude Code picks the right instructions for each ticket on its own.

1. Tell it who you are: copy `.claude/settings.local.example.json` to `.claude/settings.local.json` and set `GLASSHOUSE_DEV` to `temuri` or `beka`. This file is git-ignored.
2. Connect Jira (once): run `claude`, then `/mcp`, choose `atlassian`, log in. The server is in `.mcp.json`.
3. Start a ticket: `/start-ticket GH-11`. It reads the ticket (Jira, or `docs/tickets/` offline), checks you own it, creates the branch and loads the skills for it. Finish with `/finish-ticket`.

What is in `.claude/`:

| Part                                | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `skills/`                           | 16 skills: `start-ticket` and `finish-ticket` route every ticket; `record-decision` logs a changed decision and updates the affected Jira tickets; 13 domain skills (reverse-engineer-airbnb, shared-contracts, supabase-data, ui-pages, marble-world-pipeline, splat-tour-viewer, floor-plan-geometry, verifier-vision, agent-builder, negotiation-engine, realtime-activity-feed, mobile-capture, demo-readiness) load automatically when the work matches |
| `rules/`                            | Short rules that load when Claude touches matching files (contracts, money, 3D, agents, API routes)                                                                                                                                                                                                                                                                                                                                                          |
| `agents/pr-reviewer.md`             | A subagent that reviews a branch for ownership, contracts, money rules and secrets before the PR                                                                                                                                                                                                                                                                                                                                                             |
| `hooks/`                            | `session-context`: tells Claude who you are and which ticket your branch is. `ownership-guard`: asks before Claude edits the other developer's files or team-wide files. `decision-nudge`: after an edit to a contract or decision file, reminds Claude to run `record-decision` if a decision changed                                                                                                                                                       |
| `ownership.json`, `ticket-map.json` | Data for the hooks and skills                                                                                                                                                                                                                                                                                                                                                                                                                                |

## Docs

| Doc                                            | For                                                               |
| ---------------------------------------------- | ----------------------------------------------------------------- |
| [docs/PLAN.md](docs/PLAN.md)                   | The whole plan: problem, agents, features, tiers, timeline, risks |
| [docs/tickets/INDEX.md](docs/tickets/INDEX.md) | All 27 tickets with owners, dependencies and skills               |
| [docs/SETUP.md](docs/SETUP.md)                 | Accounts, keys, Supabase, Vercel, ngrok, Claude Code              |
| [docs/WORKFLOW.md](docs/WORKFLOW.md)           | How two developers work without collisions                        |
| [docs/OWNERSHIP.md](docs/OWNERSHIP.md)         | Who owns which folder                                             |
| [docs/CONTRACTS.md](docs/CONTRACTS.md)         | The shared interfaces frozen at hour 4                            |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)   | System diagram, request flow, API routes, storage                 |
| [docs/AGENT-DESIGN.md](docs/AGENT-DESIGN.md)   | Agents, tools, guardrails, the negotiation protocol               |
| [docs/DATABASE.md](docs/DATABASE.md)           | Tables, security model, storage, Realtime                         |
| [docs/DEMO.md](docs/DEMO.md)                   | 3-minute demo script, stage setup, judge Q&A                      |
| [docs/DECISIONS.md](docs/DECISIONS.md)         | Decision log                                                      |
| [docs/teardown.md](docs/teardown.md)           | Airbnb teardown (filled in GH-4)                                  |

## Scripts

| Command                                                                     | What it does                                                             |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `pnpm dev` / `pnpm build` / `pnpm start`                                    | Next.js                                                                  |
| `pnpm check`                                                                | typecheck, lint and tests                                                |
| `pnpm db:push` / `pnpm db:types`                                            | Apply migrations / regenerate DB types (needs `pnpm supabase link` once) |
| `pnpm video:prepare <in.mov> [out.mp4]`                                     | 720p, 30 fps, no audio, under 20 MB for World Labs                       |
| `pnpm worlds generate --video <url> --wait`                                 | Generate a 3D world; also `status`, `wait`, `get`                        |
| `pnpm seed`, `pnpm demo:reset`, `pnpm xray`, `pnpm gaps`, `pnpm floorplans` | Stubs until their tickets are built                                      |
