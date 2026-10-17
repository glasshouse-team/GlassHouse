# Folder ownership

Each folder has one owner, so the two developers never edit the same files. **Rule: never edit a path the other developer owns.** If you need a change there, leave a note on their ticket or open a PR and ask them to review it. The machine-readable version is `.claude/ownership.json` (used by the ownership hook); keep both in sync.

- **Temuri (Dev A):** 3D, capture, floor plan, Verifier, host Q&A.
- **Beka (Dev B):** app shell and pages, agents core, negotiation, data, feed.

| Area             | Temuri                                                                                                               | Beka                                                                                                                                                      |
| ---------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pages            | `app/(guest)/tour/`, `app/host/capture/`, `app/tools/rig/`                                                           | All other pages: layout, home, `app/(guest)/search`, `listing`, `deal`, `trip`, `app/host/dashboard`, `app/feed`, `app/demo`                              |
| API routes       | `api/worlds/`, `api/xray/`, `api/captures/`, `api/qa/`                                                               | `api/search/`, `api/deals/`, `api/ask-space/`, `api/checkin/`, `api/listing-draft/`, `api/health/`                                                        |
| Components       | `tour/`, `floorplan/`, `capture/`, `xray/`, `ask-home/`, `gaps/`                                                     | `ui/`, `search/`, `listing/`, `deal/`, `feed/`, `trip/`, `host/`, `tour-ext/` (add-ons on the tour, via `useTour()` only)                                 |
| lib              | `marble.ts`, `media.ts`, `geometry/`, `schemas/world.ts`, `schemas/verifier.ts`                                      | `supabase.ts`, `events.ts`, `pricing.ts`, `validators.ts`, `claude.ts`, `env.ts`, `http.ts`, `errors.ts`, `utils.ts`, `schemas/core.ts`, `data/`          |
| Agents and tools | `agents/verifier*`, `agents/prompts/verifier-*.md`, `agents/prompts/host-qa.md`, `tools/verifier/`, `tools/host-qa/` | `agents/core.ts`, `agents/context.ts`, `agents/load-prompt.ts`, other prompts, `tools/guest/`, `tools/negotiation/`, `tools/host/`, `tools/_withEvent.ts` |
| Scripts          | `generate-worlds.ts`, `prepare-video.ts`, `run-xray.ts`, `run-gaps.ts`, `build-floorplans.ts`, `split-reviews.ts`    | `seed.ts`, `reset-demo.ts`, `seed/`                                                                                                                       |
| Database         | May add new migration files                                                                                          | Owns `0001_core.sql` (contract)                                                                                                                           |
| Repo config      |                                                                                                                      | `.github/`, `vitest.config.mts`, `eslint.config.mjs`, `components.json`                                                                                   |

**Shared (either developer):** `docs/`, `README.md`, `.claude/skills/`, `.claude/rules/`, `.claude/agents/`, `.claude/ticket-map.json`, new files in `supabase/migrations/`, `public/`, `.env.example`.

**Team-wide (tell the other developer; the hook always asks):** `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `next.config.ts`, `tsconfig.json`, `CLAUDE.md`, `.claude/ownership.json`, `.claude/settings.json`, `.claude/hooks/`, `.mcp.json`, `.github/workflows/`, and `supabase/migrations/0001_core.sql` once it is applied.

Host pages live in `app/host/...` so URLs start with `/host`. Some Jira tickets write `app/(host)/...`; it is the same folder.
