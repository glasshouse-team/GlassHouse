#!/usr/bin/env node
/**
 * SessionStart hook. Tells Claude, as plain facts:
 * - which developer this session works for (GLASSHOUSE_DEV),
 * - which ticket the current git branch belongs to, its owner and its skills.
 * Data: .claude/ownership.json and .claude/ticket-map.json.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

let input = {};
try {
  input = JSON.parse(readFileSync(0, "utf8") || "{}");
} catch {
  input = {};
}

const root = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
const cwd = input.cwd || root;
const ownership = readJson(path.join(root, ".claude", "ownership.json"));
const ticketMap = readJson(path.join(root, ".claude", "ticket-map.json"));
const tickets = ticketMap?.tickets ?? {};

const local = readJson(path.join(root, ".claude", "settings.local.json"));
const dev = (process.env.GLASSHOUSE_DEV || local?.env?.GLASSHOUSE_DEV || "").trim().toLowerCase();
const person = ownership?.developers?.[dev];

const lines = [
  "Glasshouse project (hackathon Track 01). Plan: docs/PLAN.md. Tickets: docs/tickets/INDEX.md.",
];

if (person) {
  lines.push(
    `This session works for ${person.name} (${person.role}), GLASSHOUSE_DEV=${dev}. Folder ownership is in docs/OWNERSHIP.md; edits to the other developer's folders ask for approval.`,
  );
} else {
  lines.push(
    "GLASSHOUSE_DEV is not set, so Claude does not know which developer it works for and the ownership guard only checks team-wide files. It is set in .claude/settings.local.json (copy .claude/settings.local.example.json).",
  );
}

let branch = null;
try {
  branch = execFileSync("git", ["branch", "--show-current"], {
    cwd,
    stdio: ["ignore", "pipe", "ignore"],
  })
    .toString()
    .trim();
} catch {
  lines.push("This folder is not a git repository yet. docs/SETUP.md step 1 creates it.");
}

if (branch) {
  const key = branch.match(/GH-(\d+)/i)?.[1];
  const ticket = key ? tickets[`GH-${key}`] : null;
  if (ticket) {
    lines.push(
      `Current branch ${branch} belongs to GH-${key}: "${ticket.title}". Owner: ${ticket.owner}. Tier: ${ticket.tier}. Ticket file: docs/tickets/GH-${key}.md. Skills for it: ${ticket.skills.join(", ")}.`,
    );
    if (person && ticket.owner.toLowerCase() !== dev) {
      lines.push(`GH-${key} is assigned to ${ticket.owner}, not to ${person.name}.`);
    }
  } else {
    lines.push(
      `Current branch: ${branch}. It has no ticket key. Work on a ticket starts with the start-ticket skill, which creates a GH-<n>-<slug> branch.`,
    );
  }
}

process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: lines.join("\n") },
  }),
);
