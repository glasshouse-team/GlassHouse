---
name: start-ticket
description: Start or resume work on a Glasshouse Jira ticket (GH-1 to GH-27). Reads the ticket from Jira or docs/tickets, checks owner and dependencies, creates the GH-<n> branch, and loads the domain skills for that ticket. Use before writing any code for a ticket.
when_to_use: The user says "start GH-11", "work on GH-9", "pick up the floor plan ticket", "continue GH-15", "what's my next ticket", or pastes a hacktoberfest.atlassian.net/browse/GH-... link.
argument-hint: "[GH-number]"
---

# Start a ticket

Requested: $ARGUMENTS

## 1. Find the ticket

- Normalize the key: "11", "gh11", "GH-11" all mean GH-11. If no key was given, read `.claude/ticket-map.json`, list the open tickets owned by this session's developer in build order (by `hours`), and ask which one.
- Read the ticket from Jira first, with the Atlassian MCP tool `getJiraIssue` (site hacktoberfest.atlassian.net, cloudId in `.claude/ticket-map.json`). If the Atlassian server is not connected (`/mcp` shows it), or the key is not in Jira yet (`"inJira": false`), use the copy of the ticket text in `docs/tickets/GH-<n>.md`. For scope and acceptance criteria, Jira wins.
- **Always read `docs/tickets/GH-<n>.md` too**, even when Jira is connected. Its sections **In the starter** (what already exists), **Build notes** (interfaces, file paths, platform limits, test approach), **Needs from people** and **Decision updates** are repo facts Jira does not have; they win on paths, interfaces, numbers and dates.
- Note the goal, assignee, status, "Depends on", "Owns" folders and acceptance criteria.
- Check docs/DECISIONS.md for rows that name GH-<n>. A decision there overrides older ticket text (a `pending` Jira cell means Jira still has the old wording).
- If **Needs from people** lists something that may not be done yet (keys, photos, a GH-3 decision, real copy), ask the user about it before planning; build against fixtures or stubs where it is missing.

## 2. Check it is this developer's ticket

The session context names the developer (GLASSHOUSE_DEV). If the ticket's owner is the other developer, stop and ask: "GH-<n> is <owner>'s ticket. Work on it anyway?" Continue only on a clear yes.

## 3. Check dependencies

For each ticket in "Depends on", check its Jira status (or ask the user). If a blocker is not done, name it and say what can be built now against the contract stubs (docs/CONTRACTS.md). Do not edit the blocker's files.

## 4. Branch

New ticket branches start from the latest `main` on GitHub (`origin/main`), never from whatever is checked out. Run `git fetch origin` (skip it if `git remote` prints nothing), then look for the ticket's branch, local or on GitHub: `git branch -a --list "*GH-<n>-*"`.

- **Already on it** (resuming): stay, uncommitted changes and all. If `git log --oneline HEAD..origin/main` lists commits, say how many and offer to merge `origin/main` in.
- **It exists, but this folder is on another branch:** `git status` must be clean (otherwise ask what to do with the changes), then `git switch GH-<n>-<slug>` (for a branch that is only on GitHub, this makes the local copy). If git says the branch is used by another worktree, stop: the user continues in that folder.
- **No branch yet:** `git status` must be clean (otherwise ask), then `git switch --no-track -c GH-<n>-<short-slug> origin/main` (with no remote, branch from `main`). This works even when local `main` is behind or checked out in another worktree.
- Don't `git switch main` or pull into it here: in a second worktree, git refuses because `main` is checked out in the first. One branch per ticket; never commit to main.
- Ask before moving the Jira ticket to In Progress: it is a write to the shared board.

## 5. Load the domain skills

Invoke every skill listed for the ticket before planning. The full map is in `.claude/ticket-map.json`:

| Ticket                      | Skills                                      |
| --------------------------- | ------------------------------------------- |
| GH-2 setup                  | supabase-data (plus docs/SETUP.md)          |
| GH-3 3D go/no-go            | marble-world-pipeline, mobile-capture       |
| GH-4 Airbnb teardown        | reverse-engineer-airbnb                     |
| GH-5 shared contracts       | shared-contracts, supabase-data             |
| GH-6 film hero homes        | mobile-capture, marble-world-pipeline       |
| GH-7 seed data              | supabase-data                               |
| GH-8 core pages             | ui-pages, reverse-engineer-airbnb           |
| GH-9 listing X-ray          | verifier-vision                             |
| GH-10 3D pipeline           | marble-world-pipeline                       |
| GH-11 3D tour viewer        | splat-tour-viewer                           |
| GH-12 activity feed         | realtime-activity-feed                      |
| GH-13 agent foundation      | agent-builder, negotiation-engine           |
| GH-14 trip brief search     | agent-builder, ui-pages                     |
| GH-15 negotiation           | negotiation-engine, agent-builder, ui-pages |
| GH-16 host Q&A              | agent-builder                               |
| GH-17 MVP checkpoint        | demo-readiness                              |
| GH-18 floor plan            | floor-plan-geometry, verifier-vision        |
| GH-19 gap check             | verifier-vision, splat-tour-viewer          |
| GH-20 Ask the space         | agent-builder, splat-tour-viewer            |
| GH-21 honesty overlay       | splat-tour-viewer, ui-pages                 |
| GH-22 guided capture        | mobile-capture                              |
| GH-23 check-in verification | verifier-vision, mobile-capture, ui-pages   |
| GH-24 spatial reviews       | verifier-vision, splat-tour-viewer          |
| GH-25 host narration        | agent-builder, mobile-capture               |
| GH-26 demo mode, reset, QA  | demo-readiness, supabase-data               |
| GH-27 pitch                 | demo-readiness                              |

## 6. Plan

- List the files to create or change. All must be in this developer's folders (docs/OWNERSHIP.md) or shared. A change needed in the other developer's folder, or in a contract file, is a request: draft it as a note for them (see the shared-contracts skill) instead of editing.
- Build on what the ticket file's **In the starter** section lists; do not rewrite it. Follow its **Build notes**: they settle the interfaces and limits the ticket text leaves open.
- Order the work: Zod schemas and types, then pure logic with tests, then API routes, then UI, then feed events.
- For tickets estimated over 2 hours, show the plan in at most 10 lines and wait for an OK.

## 7. Work loop

- Small steps. After each: `pnpm typecheck` and the relevant tests (`pnpm test <file>`).
- Commit often with messages like `GH-<n>: add collider raycasts`.
- Check the work in a browser (`pnpm dev`) when it has UI, and on a phone over HTTPS when it uses the camera or 3D.
- When the acceptance criteria look done, use the finish-ticket skill.
