#!/usr/bin/env node
/**
 * PostToolUse hook (Edit, Write, MultiEdit).
 * After Claude edits a file that holds a shared contract or a documented decision, adds a
 * reminder to use the record-decision skill if the edit changed a decision. Once per file
 * per session, never blocks, writes nothing in the repo (state lives in the OS temp dir).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { findRoot, globToRegExp } from "./ownership-guard.mjs";

/** Edits here usually mean a changed decision. Keep in line with docs/CONTRACTS.md. */
export const WATCHED = [
  "supabase/migrations/**",
  "lib/schemas/**",
  "lib/pricing.ts",
  "lib/validators.ts",
  "lib/events.ts",
  "lib/env.ts",
  "agents/core.ts",
  "agents/context.ts",
  "agents/prompts/**",
  "components/tour/TourContext.tsx",
  "tools/_withEvent.ts",
  "seed/fixtures.ts",
  "next.config.ts",
  "package.json",
  ".env.example",
  "docs/CONTRACTS.md",
  "docs/ARCHITECTURE.md",
  "docs/AGENT-DESIGN.md",
  "docs/DATABASE.md",
  "docs/PLAN.md",
  "docs/OWNERSHIP.md",
];

export function isWatched(relPath) {
  return WATCHED.some((pattern) => globToRegExp(pattern).test(relPath));
}

export function nudgeText(relPath) {
  return (
    `${relPath} holds a shared contract or a documented decision. If this edit changed ` +
    "behavior, an interface, a rule or a number that a ticket or doc describes (not just an " +
    "internal fix), use the record-decision skill before you finish: it logs the decision in " +
    "docs/DECISIONS.md, fixes the docs and proposes the Jira updates. Ignore this if the " +
    "change is internal or you are already recording it."
  );
}

/** True the first time a file is seen in this session. */
function firstTime(sessionId, relPath) {
  const dir = path.join(os.tmpdir(), "glasshouse-decision-nudge");
  const file = path.join(dir, `${String(sessionId).replace(/[^\w-]/g, "_")}.json`);
  let seen = [];
  try {
    if (existsSync(file)) seen = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    seen = [];
  }
  if (seen.includes(relPath)) return false;
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, JSON.stringify([...seen, relPath]));
  } catch {
    // No temp dir: remind every time rather than never.
  }
  return true;
}

function main() {
  let input = {};
  try {
    input = JSON.parse(readFileSync(0, "utf8") || "{}");
  } catch {
    process.exit(0);
  }
  const target = input.tool_input?.file_path ?? input.tool_input?.path;
  if (!target) process.exit(0);

  const abs = path.resolve(input.cwd ?? process.cwd(), target);
  const root = findRoot(abs) ?? process.env.CLAUDE_PROJECT_DIR;
  if (!root) process.exit(0);
  const rel = path.relative(root, abs).split(path.sep).join("/");
  if (!rel || rel.startsWith("..") || !isWatched(rel)) process.exit(0);
  if (!firstTime(input.session_id ?? "unknown", rel)) process.exit(0);

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: nudgeText(rel) },
    }),
  );
  process.exit(0);
}

if (process.argv[1]?.endsWith("decision-nudge.mjs")) {
  main();
}
