---
name: record-decision
description: Record a changed logic or architecture decision and sync it to Jira. Logs it in docs/DECISIONS.md, fixes the docs, skills and offline ticket copies that now say the wrong thing, then (after one yes) comments on and corrects every affected Jira ticket and drafts a heads-up for the other developer. Use whenever the team changes how something works, not just how it is coded.
when_to_use: The user says "let's change", "we decided", "instead of X use Y", "switch to", "drop", "new rule", "change the schema / flow / price rule / API / model / stack", "this ticket is wrong now", "update Jira", "sync decisions". Also when you changed a contract, migration, schema, money rule, agent flow, dependency or anything a ticket describes differently, or when the decision-nudge hook reminds you.
argument-hint: "[what changed | sync]"
---

# Record a decision and update Jira

Input: $ARGUMENTS. If it is `sync`, skip to "Sync mode". If it is empty, take the decision from the conversation.

## 1. Is it a decision?

Yes if it changes behavior, an interface or contract (docs/CONTRACTS.md), the data model, a flow, a number or rule (prices, limits, dates), the stack or a dependency, the scope, the ownership, or anything a ticket's text or acceptance criteria describe. Not a decision: a bug fix that makes the code match the ticket, a refactor inside one file, styling. If unsure, ask: "This changes what GH-<n> says. Record it as a decision?"

## 2. Collect the facts

- **Before → now**, in one line each. **Why**, in one line.
- **By:** the session's developer (session context). If it changes the other developer's files, a contract or a team-wide file, it needs both (docs/WORKFLOW.md rule 2): write "Temuri, needs Beka's OK" (or the reverse) until the other one agrees, and say so in Jira.
- **Date:** `date +%F`.
- **Affected tickets**, from all of these:
  - the current branch (`git branch --show-current`, `GH-<n>-...`);
  - `Grep` over `docs/tickets/*.md` for the old behavior: its keywords, numbers, file paths, function names;
  - `.claude/ticket-map.json`: tickets whose `depends` include the current ticket;
  - Jira, when the Atlassian server is connected: `searchJiraIssuesUsingJql` with `project = GH AND text ~ "<keyword>"`.
- **Owners:** note each affected ticket's owner. Tickets with `"inJira": false` in the ticket map only get the offline copy updated.

## 3. Update the repo (no confirmation needed; they are shared docs)

1. **docs/DECISIONS.md:** add a row with the next number (highest D-number + 1). Decision = the new behavior, with "(was: ...)" for the old one. Last column `Jira`: `GH-15, GH-8: pending`. A reversal is a new row ("Replaces D-007"), never an edit of the old one.
2. **Docs, skills and rules that state the old behavior:** docs/CONTRACTS.md, ARCHITECTURE.md, AGENT-DESIGN.md, DATABASE.md, DEMO.md, PLAN.md, `.claude/skills/*/SKILL.md`, `.claude/rules/*.md`, CLAUDE.md (team-wide: the hook will ask). Search for the old wording and fix every place, or future sessions will follow the old rule.
3. **Offline ticket copies** `docs/tickets/GH-<n>.md`: do not rewrite the snapshot. Add (or extend) a section at the end:
   ```
   ## Decision updates
   - 2026-10-18 D-013: <now> (was: <before>). Jira: pending
   ```
4. `.claude/ticket-map.json` only if an owner, dependency or skill list changed.

Code changes are the ticket's own work, not part of this skill.

## 4. Draft the Jira updates

For every affected ticket that is in Jira (cloudId and site in `.claude/ticket-map.json`):

- **Comment (always),** via `addOrEditJiraIssueComment` (no `commentId`, markdown):
  ```
  **Decision D-013** (2026-10-18, Temuri + Beka)
  **Before:** ...
  **Now:** ...
  **Why:** ...
  **For this ticket:** <the step, file, number or acceptance criterion that changes>
  Logged in docs/DECISIONS.md.
  ```
  For a proposal that still needs the other developer, start with "**Proposed, needs <name>'s OK.**"
- **Description fix (only when the ticket text now misleads):** read it with `getJiraIssue` (`responseContentFormat: "markdown"`; if the result comes back as HTML, edit in HTML with `contentFormat: "html"`). Change only the wrong sentences, add "_(changed by D-013)_" after each, keep everything else exactly as it was. Write with `editJiraIssue`, `fields.description`.
- **Label:** add `decision-change` in the same `editJiraIssue` call. Labels are replaced, not appended: send the current labels plus the new one.
- Never change status, assignee or priority, and never delete comments.

If a tool name differs on this server, use its `discover` tool to find the operation.

## 5. Ask once, then write

Show one list: each ticket key with its comment text and, if any, the description before/after lines. Ask: "Post these Jira updates? (all / pick / no)". Writes to the shared board happen only after this yes. Then:

- write the selected updates;
- in docs/DECISIONS.md change `pending` to `updated <date>` for the tickets written;
- in each offline copy change `Jira: pending` to `Jira: updated`.

Jira not connected: leave `pending`, print the drafts so they can be pasted, and say "Run /mcp, log in to atlassian, then /record-decision sync".

## 6. Tell the other developer

If an affected ticket or file belongs to the other developer, draft one message to send them: "Heads-up: D-013, <now>. Affects your GH-<n>: <what to do>. Jira and docs updated; pull main." Include `pnpm db:types` or `pnpm install` if a migration or dependency changed.

## Sync mode (`/record-decision sync`)

Read docs/DECISIONS.md. For every row whose Jira cell says `pending`, do steps 4 and 5 for those tickets, using the row's text as before / now / why. The starter ships with pending rows (D-003, D-006, D-007, D-010, D-011, D-012): the first sync brings Jira in line with the repo.

## Never

- Post to Jira without the yes in step 5.
- Put keys, `.env` values or personal data in Jira.
- Edit a decision row after the fact, except its `Jira` cell.
