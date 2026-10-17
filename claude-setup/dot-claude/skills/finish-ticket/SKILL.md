---
name: finish-ticket
description: Finish a Glasshouse ticket. Checks the acceptance criteria and Definition of Done, runs pnpm check, gets a pr-reviewer review, then (after asking) pushes, opens the PR and updates Jira. Use when a ticket's work looks complete.
when_to_use: The user says "GH-11 is done", "wrap up this ticket", "open a PR", "ready for review", "finish GH-9", "ship it".
argument-hint: "[GH-number]"
---

# Finish a ticket

Ticket: $ARGUMENTS (if empty, take it from the branch name `GH-<n>-...`).

## 1. Acceptance criteria

Re-read the criteria from Jira (`getJiraIssue`) or docs/tickets/GH-<n>.md. For each one, state how it was verified (test name, command output, page checked). Anything that needs a person (phone test, recording, the other developer's review) becomes a "by hand" step with exact instructions.

## 2. Checks

- `pnpm check` (typecheck, lint, tests). Fix failures before going on.
- `pnpm build` when pages, routes or config changed.
- `git status`: nothing important left uncommitted.

## 3. Review

Delegate to the `pr-reviewer` subagent ("Review branch GH-<n>-..."). Fix what it reports as FAIL. Report the rest to the user.

Ownership: `git diff --name-only main...HEAD` (or `origin/main`). Any file owned by the other developer, or any contract file (docs/CONTRACTS.md), must be named in the PR description with "agreed with <name>".

## 4. Decisions

Compare the diff with the ticket text and docs/CONTRACTS.md. If the branch changed a decision (a contract, a rule or number, a flow, the scope) that docs/DECISIONS.md does not have yet, run the `record-decision` skill now, so the code, the docs and Jira agree before the PR. Name the D-numbers in the PR description.

## 5. Definition of Done (from the Epic)

- [ ] Merged into main and deployed (Vercel)
- [ ] Works on a laptop and a phone
- [ ] Its actions appear in the activity feed
- [ ] No console errors
- [ ] A 20-second screen recording attached to the Jira ticket

Tell the user which of these are still open and what to do for each.

## 6. Push and pull request (ask first)

Ask: "Push GH-<n>-... and open a pull request?" On yes:

- `git push -u origin <branch>`
- With the GitHub CLI: `gh pr create --title "GH-<n>: <summary>" --body-file <file>` using .github/pull_request_template.md, filled in: "Closes GH-<n>", what changed, how to test, the checklist.
- Without `gh`: print the title and body so the user can paste them on GitHub.

## 7. Jira (ask first)

Writes to the shared board need a yes. Then: add a comment to GH-<n> with the PR link, what was verified and the manual steps left; move it to the review or done column (list the transitions first, use the one the user picks).

## 8. Unblock the other developer

Look up tickets in `.claude/ticket-map.json` whose `depends` include GH-<n> and that belong to the other developer. Tell the user who can start now, and draft a one-line message for them if a contract changed.
