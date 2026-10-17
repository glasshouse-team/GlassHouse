# Working as two developers

The goal is simple: you never edit the same file, and `main` always works.

## The rules

1. **Own your folders.** docs/OWNERSHIP.md. Need something in the other person's folder? Ask them, or leave a note on their ticket. The ownership hook asks before Claude edits their files.
2. **Contracts are frozen at hour 4** (GH-5). After that, only additive changes with a heads-up; anything else needs both of you. docs/CONTRACTS.md.
3. **One branch per ticket:** `GH-<n>-<slug>`. Commits: `GH-<n>: <what changed>`.
4. **`main` always deploys.** Merge through a PR; the other developer gives it a 5-minute look (`pr-reviewer` subagent helps). CI runs typecheck, lint, tests and build.
5. **Merge at least every 2 hours.** Small PRs merge cleanly; big ones don't.
6. **Dependencies:** `pnpm add` in a commit of its own, merged quickly, announced. Pull, then `pnpm install`.
7. **Migrations:** new files only (`000N_<name>.sql`). Tell the other developer, who runs `pnpm db:types` after pulling.

## Claude Code habits

- Start every ticket with `/start-ticket GH-<n>`; end with `/finish-ticket`.
- Two sessions per developer at most, each in its own git worktree, on different tickets or folders:
  ```bash
  git worktree add ../glasshouse-gh18 -b GH-18-floor-plan
  cp .env.local .claude/settings.local.json ../glasshouse-gh18/   # keep the same dev identity
  cd ../glasshouse-gh18 && pnpm install && claude
  ```
- While one session works, review the other's diff.
- Big features (3D pipeline, floor plan, negotiation loop): ask for a plan first (plan mode) and accept it before code is written.
- Paste real errors and screenshots into Claude instead of describing them.
- Use Opus for the floor-plan algorithm and hard bugs; Sonnet for routine work.

## Definition of Done (every ticket)

- [ ] Merged and deployed
- [ ] Works on a laptop and a phone
- [ ] Its actions show in the activity feed
- [ ] No console errors
- [ ] A 20-second screen recording attached to the Jira ticket

## Gates

| When       | Gate                                                               |
| ---------- | ------------------------------------------------------------------ |
| Hour 2     | 3D path decided (GH-3); repo, Supabase, Vercel working (GH-2)      |
| Hour 4     | Contracts merged and frozen (GH-5)                                 |
| Hour 13    | MVP checkpoint: full demo run, backup video, cut decisions (GH-17) |
| Hour 18    | Feature freeze: only fixes after this                              |
| Hour 22-24 | Three rehearsals, final backup video                               |

## Talking to each other

- Blocked on the other developer: say which ticket and what you need, then build against the stub.
- Changed a contract or added a migration: one message with what changed and what they need to run.
- Changed a decision (logic, architecture, a rule or number in a ticket): `/record-decision <what changed>`. It adds the row to docs/DECISIONS.md, fixes the docs, comments on and corrects the affected Jira tickets after one yes, and drafts the heads-up message. `/record-decision sync` pushes any rows still marked `pending`.
- Sleep in turns (Temuri 18:00-20:00, Beka 20:00-22:00 in build hours).
