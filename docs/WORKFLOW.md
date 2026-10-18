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
- Two sessions per developer at most, each in its own git worktree, on different tickets or folders. Make the second one from the latest `main` on GitHub, not from your current branch:
  ```bash
  git fetch origin
  git worktree add --no-track -b GH-18-floor-plan ../glasshouse-gh18 origin/main
  cp .env.local ../glasshouse-gh18/
  cp .claude/settings.local.json ../glasshouse-gh18/.claude/   # same developer identity
  cd ../glasshouse-gh18 && pnpm install && claude
  ```
  `/start-ticket GH-18` there finds the branch and stays on it. After the PR merges: `git worktree remove ../glasshouse-gh18`.
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

## Autopilot (D-029)

`/loop /autopilot` in each developer's Claude Code runs the project without waiting on people.

- **Reviews and merges:** each Claude reviews and approves the other's PRs. When `ap gate` passes (CI green and peer-approved), the author's Claude labels the PR `ready-to-merge` and puts "Merge PR #n" on Needs a human; a person clicks Merge (D-030). The Claude then runs the follow-up (`db:push`, Jira, handoff), moves its Jira tickets and starts the next one.
- **Talking:** the two Claudes talk on the pinned **🤖 Agent channel** issue.
- **While working:** a background watcher hands new messages and review requests to a side subagent in its own worktree, so the main ticket keeps moving. Each side pulls `main` whenever the other merges.
- **People:** you get only what a Claude cannot do, as boxes on the pinned **🙋 Needs a human** issue: footage and photos of a real home, World Labs credits, a real-phone run of camera features, and PRs that edit an applied migration or the agents' own rules (CLAUDE.md, settings, hooks, the autopilot skill). The Claudes source stock photos themselves, run `pnpm db:push` after a migration merges, and test every page in a browser at laptop and phone size, recording the 20-second clip for Jira. Tick a box when it's done. You can also write plain comments on the channel; both Claudes read them.

Skill and rules: `.claude/skills/autopilot/SKILL.md`. Helper: `node .claude/skills/autopilot/autopilot.mjs` (`whoami`, `setup`, `inbox`, `post`, `reviews`, `mine`, `gate`, `next`, `human`, `watch`).

### Turning it on (each developer, once)

The PR that added autopilot already made edits 1 and 2. A person merges it, because a Claude cannot widen its own permissions. Each developer then does 3 and 4. For reference:

1. **CLAUDE.md, "Every ticket", rule 4.** Replace it with:
   `4. Ask before any write to Jira or GitHub (status changes, comments, pushes, PRs), except under /autopilot, which writes and merges under the rules in .claude/skills/autopilot/SKILL.md (D-029).`
2. **`.claude/settings.json`, `permissions`.** Add these, so the loop is not stopped by prompts.
   - To `allow`: `"Bash(git fetch)"`, `"Bash(git fetch *)"`, `"Bash(git switch *)"`, `"Bash(git add *)"`, `"Bash(git commit *)"`, `"Bash(git merge *)"`, `"Bash(git worktree *)"`, `"Bash(git push -u origin GH-*)"`, `"Bash(node .claude/skills/autopilot/autopilot.mjs *)"`, `"Bash(gh pr *)"`, `"Bash(gh run *)"`, `"Bash(gh issue view *)"`, `"Bash(gh issue list *)"`, `"mcp__atlassian__getJiraIssue"`, `"mcp__atlassian__searchJiraIssuesUsingJql"`, `"mcp__atlassian__addOrEditJiraIssueComment"`, `"mcp__atlassian__transitionJiraIssue"`, `"mcp__atlassian__editJiraIssue"`, `"mcp__atlassian__executeRead"`.
   - To `deny`: `"Bash(git push --force*)"`, `"Bash(git push -f*)"`, `"Bash(git push * --force*)"`, `"Bash(git push origin main*)"`, `"Bash(git push origin HEAD:main*)"`, `"Bash(git push * main)"`, `"Bash(gh pr merge * --admin*)"`.
3. **Log in:** `gh auth status` should show your own GitHub account (Beka: `beqa200`), and `/mcp` should show atlassian connected.
4. **Start it:** pull `main`, open Claude Code in the repo, and run `/loop /autopilot`. The first tick runs `ap setup`, which is safe to repeat.

**To pause:** `/autopilot stop`, or press Esc. **To keep one PR from merging:** add the `autopilot-hold` label.
