# Setup

Do the "hour 0" part first: 3D generation and everything else depend on it.

## 1. This repository (Temuri, now)

The starter is on Temuri's Desktop. If it still has a `claude-setup/` folder, install that first (claude-setup/README.md): it holds `.claude/`, `.github/` and `.mcp.json`, which remote tools may not write directly. Then make it the shared repo:

```bash
cd ~/Desktop/glasshouse
git init -b main
git add -A
git commit -m "GH-2: Glasshouse starter"
# create an empty private repo "glasshouse" on GitHub (no README), then:
git remote add origin git@github.com:<you>/glasshouse.git
git push -u origin main
```

Add Beka as a collaborator, protect `main` (require a pull request, block force pushes), then fill in `.github/CODEOWNERS` with your GitHub usernames.

## 2. Local tools (each developer)

- Node 22 or newer (`node -v`). With nvm: `nvm install 22 && nvm use 22`.
- pnpm: `corepack enable pnpm` (the repo pins pnpm 10.28 in package.json).
- `pnpm install`. It also downloads the ffmpeg and Supabase CLI binaries for your machine.
- Optional: GitHub CLI (`brew install gh`, then `gh auth login`) so Claude Code can open PRs.
- Claude Code: `claude` in the repo folder. Accept the trust prompt; approve the `atlassian` MCP server.

## 3. Accounts and keys (hour 0-1)

| Item                 | Who            | What to do                                                    | Cost (est.) |
| -------------------- | -------------- | ------------------------------------------------------------- | ----------- |
| GitHub repo          | Temuri or Beka | Step 1 above                                                  | Free        |
| Anthropic            | Beka           | console.anthropic.com: API key, prepaid credits, spending cap | $20-40      |
| World Labs           | Temuri         | platform.worldlabs.ai: API key, buy API credits, cap          | $30-60      |
| Supabase             | Beka           | New project in an EU region; keys from Project Settings > API | Free        |
| Vercel               | Beka           | Import the GitHub repo; add all env vars; first deploy        | Free        |
| ngrok                | Beka           | Account + auth token (`ngrok config add-authtoken ...`)       | Free        |
| Scenario (backup 3D) | Temuri         | Only if the go/no-go test needs HY World                      | $10-30      |
| ElevenLabs           | Beka           | Only for Georgian narration (GH-25)                           | Free tier   |

Put keys in `.env.local` (copy `.env.example`) and in Vercel. Share them privately (password manager or direct message), never in git, Jira or chat with Claude. Check with `pnpm dev` and http://localhost:3000/api/health.

## 4. Supabase

1. `pnpm supabase login`, then `pnpm supabase link --project-ref <ref>` (the ref is in the project URL).
2. After the GH-5 review: `pnpm db:push`, then `pnpm db:types`.
3. Check in the dashboard: buckets `media` (public) and `captures` (private) exist; Database > Replication shows `events`, `deal_messages`, `deals`, `worlds`, `gaps`, `messages` in `supabase_realtime`.
4. Upload a test file to `media` and open its public URL in an incognito window. World Labs must be able to fetch it the same way.

## 5. Phones (HTTPS)

Phones open the camera only over HTTPS. Use a Vercel preview URL, or locally `pnpm dev`, then `ngrok http 3000` and open the https URL on the phone. On iPhone, the compass needs a tap on "Allow camera and motion".

## 6. Claude Code (each developer)

1. `cp .claude/settings.local.example.json .claude/settings.local.json` and set `GLASSHOUSE_DEV` to `temuri` or `beka`. (Temuri's copy is already set.) This file is git-ignored.
2. Start `claude` in the repo. The first message of the session says who it works for and which ticket your branch is.
3. Jira: run `/mcp`, choose `atlassian`, log in with your Atlassian account (site hacktoberfest.atlassian.net). Without it, Claude reads the offline copies in `docs/tickets/`.
4. Work: `/start-ticket GH-<n>` ... `/finish-ticket`.
5. Two parallel sessions: a second git worktree made from `origin/main`, with `.env.local` and `.claude/settings.local.json` copied into it. The commands are in docs/WORKFLOW.md.

## Troubleshooting

| Symptom                              | Fix                                                                              |
| ------------------------------------ | -------------------------------------------------------------------------------- |
| `Missing environment variables: ...` | Fill `.env.local`; restart `pnpm dev`                                            |
| `pnpm worlds` returns 400            | The input URL is not public; open it in an incognito window                      |
| `pnpm worlds` returns 402            | Buy World Labs API credits                                                       |
| Phone camera is black                | Not HTTPS; use ngrok or Vercel                                                   |
| Realtime does nothing                | Table missing from the `supabase_realtime` publication, or no public read policy |
| `ffmpeg-static has no binary`        | Run `pnpm install` on that machine (binaries are per platform)                   |
| Claude Code doesn't know who you are | `.claude/settings.local.json` missing or `GLASSHOUSE_DEV` not set                |
