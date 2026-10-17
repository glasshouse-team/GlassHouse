# GH-2: Set up repo, Supabase, Vercel, API keys and CLAUDE.md

> The ticket text below the line is a copy of [GH-2](https://hacktoberfest.atlassian.net/browse/GH-2) from Jira (2026-10-17); for scope and acceptance criteria, Jira wins. The sections above the line are repo facts Jira does not have (**In the starter**, **Build notes**, **Needs from people**), and `/start-ticket` reads them every time.

| Owner | Type | Priority | Hours | Depends on | Skills |
| --- | --- | --- | --- | --- | --- |
| Beka | Task | Highest | 0-2 | nothing | `supabase-data` |

Labels: hours-0-2, must-have, setup

## In the starter

- Done, don't redo: the Next.js 16.4 scaffold with every dependency (pnpm lockfile), shadcn config (`components.json`), the folder layout, `.env.example`, `CLAUDE.md` with the full ownership map (docs/OWNERSHIP.md), the PR template, a CI workflow (typecheck, lint, test, build), CODEOWNERS placeholders, the Supabase CLI as a dev dependency (`pnpm supabase ...`) and `GET /api/health` to check which env vars are set.
- Left, by hand (docs/SETUP.md): GitHub repo and branch protection, Supabase project and `pnpm supabase link`, Anthropic key and spending cap, Vercel import and env vars, ngrok, sharing keys privately. The GH-5 migration creates both storage buckets and the Realtime entries.
- `@supabase/ssr` is not installed: there is no login (role switcher instead).

## Build notes

- The starter did the code part; what's left is accounts, keys, Vercel and Supabase (docs/SETUP.md). Done when `/api/health` shows every key as set on the Vercel URL and CI's `pnpm build` passes with no env vars.
- Vercel: keep Fluid compute on (needed for `maxDuration = 300`) and set the Functions region to `fra1`; create the Supabase project in `eu-central-1` (Frankfurt), close to both.
- Add env vars to Production and Preview. Changing `DEMO_MODE` needs a redeploy.
- The repo already exists (TemuriTsutskiridze/GlassHouse); put both GitHub usernames in `.github/CODEOWNERS`.

## Needs from people

- Private repo limits: GitHub branch protection on a private repo needs GitHub Pro, and Vercel Hobby blocks deploys of commits made by a collaborator (Beka). Make the repo public, or use Vercel Pro (trial).
- Supabase Free caps files at 50 MB (D-020): stay on Free with small files, or upgrade to Pro.
- At least $40 of Anthropic credits (lower tiers have tight rate limits), World Labs credits, the Supabase database password (`link` and `db:push` ask for it), an ngrok token.

---

## Goal

By hour 2, both developers can clone, run and deploy the app, and Claude Code knows the project rules.

**Owner:** Beka · **When:** hours 0–2 · **Estimate:** 1.5h · **Blocks:** every other ticket

## Steps

### 1. GitHub

1. Create a private repo named `glasshouse` and add Temuri as a collaborator.
2. Protect `main`: require a PR and block force-pushes.
3. Add a PR template with a "Closes GH-xx" line and a screenshot section.

### 2. Next.js scaffold

1. Run `pnpm create next-app glasshouse --ts --app --tailwind --eslint` (no `src/` folder), then `npx shadcn@latest init`.
2. Install: `zod @tanstack/react-query lucide-react sonner date-fns @supabase/supabase-js @supabase/ssr ai @ai-sdk/anthropic @ai-sdk/react`.
3. Create the empty top-level folders from the Epic's ownership map (`agents/`, `tools/`, `lib/`, `components/`, `scripts/`, `supabase/migrations/`) with a `.gitkeep` in each.

### 3. Supabase

1. Create a new project in an EU region and save the URL, anon key and service-role key.
2. Create two Storage buckets:
   - `media`, **public read**. World Labs must download input files without cookies or login.
   - `captures`, **private**, for raw and check-in videos.
3. Enable Realtime on `events`, `deal_messages`, `deals`, `worlds` and `gaps` right after the "Shared contracts" migration (GH-5) lands.
4. Install the Supabase CLI and link the project (`supabase link`).

### 4. Anthropic

Create an API key in the Anthropic Console, add $20–40 of prepaid credits and set a spending cap.

### 5. Vercel

Import the repo, add all env vars, and confirm the first production deploy works. Preview deploys per PR are on by default.

### 6. ngrok

Create an account and auth token. Phones only open the camera over HTTPS, so Temuri needs this for capture testing.

### 7. `.env.example`

Commit it; never commit `.env.local`.

```
ANTHROPIC_API_KEY=
WORLDLABS_API_KEY=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ELEVENLABS_API_KEY=            # optional
SCENARIO_API_KEY=              # optional backup 3D
MODEL_AGENT=claude-sonnet-5-5
MODEL_BULK=claude-haiku-5-5
MARBLE_MODEL=marble-1.1-plus
DEMO_MODE=false
```

### 8. `CLAUDE.md` in the repo root

Include:

- Stack summary and folder layout.
- **The ownership map from GH-1, copied in full**, plus the rule "never edit the other developer's folders".
- Code rules: prices in cents; every tool and human action calls `logEvent`; validate all LLM output with Zod; read model ids from env; never read or print `.env*`; enforce money rules in code, not in prompts.
- Branch naming `GH-<n>-<slug>`; small commits; run `pnpm lint && pnpm typecheck` before pushing.

## Acceptance criteria

- [ ] Both developers run `pnpm dev` locally with their own `.env.local`.
- [ ] The Vercel production URL loads; a test PR gets a preview URL.
- [ ] Both buckets exist, and a test file in `media` opens in an incognito window.
- [ ] `CLAUDE.md` is committed with the full ownership map.
- [ ] Keys are shared privately (a password manager or direct message), never in the repo or Jira.

## Who does what

- **Claude Code:** scaffold, folders, `CLAUDE.md` draft (paste the Epic description in), PR template.
- **Beka by hand:** create the accounts, buy credits, set caps, paste keys into Vercel and share them with Temuri.

## Out of scope

Database tables (GH-5), authentication (we use a role switcher), payments.

## Decision updates

- 2026-10-17 D-021: Supabase stays in `ap-southeast-2` (Sydney) and Vercel Functions run in `syd1` (was: Supabase in `eu-central-1` Frankfurt, Vercel `fra1`). Jira: updated
