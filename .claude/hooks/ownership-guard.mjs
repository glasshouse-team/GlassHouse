#!/usr/bin/env node
/**
 * PreToolUse hook (Edit, Write, MultiEdit, NotebookEdit).
 * Asks for a human OK before Claude edits a file owned by the other developer, or a
 * team-wide file listed in askAlways. Rules live in .claude/ownership.json.
 *
 * Who is "me": GLASSHOUSE_DEV (temuri | beka), from the environment or from the "env"
 * block of .claude/settings.local.json. If it is not set, only askAlways applies.
 * Exit 0 with no output = no decision (the normal permission flow continues).
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

/** Glob to RegExp: * stays inside one folder, ** crosses folders, ? is one character. */
export function globToRegExp(glob) {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        i++;
        if (glob[i + 1] === "/") {
          i++;
          re += "(?:.*/)?";
        } else {
          re += ".*";
        }
      } else {
        re += "[^/]*";
      }
    } else if (c === "?") {
      re += "[^/]";
    } else {
      re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${re}$`);
}

/** Nearest folder above `file` that has .claude/ownership.json (works inside git worktrees). */
export function findRoot(file) {
  let dir = path.dirname(file);
  for (;;) {
    if (existsSync(path.join(dir, ".claude", "ownership.json"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export function currentDev(root) {
  const fromEnv = process.env.GLASSHOUSE_DEV?.trim().toLowerCase();
  if (fromEnv) return fromEnv;
  const local = readJson(path.join(root, ".claude", "settings.local.json"));
  return local?.env?.GLASSHOUSE_DEV?.trim().toLowerCase() || null;
}

/** Returns { decision, reason } or null for "no decision". */
export function decideForFile(root, relPath, dev) {
  const config = readJson(path.join(root, ".claude", "ownership.json"));
  if (!config) return null;
  const matches = (pattern) => globToRegExp(pattern).test(relPath);

  const always = (config.askAlways ?? []).find((rule) => matches(rule.pattern));
  if (always) return { decision: "ask", reason: `${relPath}: ${always.reason}` };

  if (!dev || !config.developers?.[dev]) return null;
  if ((config.shared ?? []).some(matches)) return null;

  const rule = (config.rules ?? []).find((r) => matches(r.pattern));
  if (!rule || rule.owner === dev) return null;

  const owner = config.developers[rule.owner];
  const me = config.developers[dev];
  const firstName = owner.name.split(" ")[0];
  const ticket = rule.ticket ? ` (ticket ${rule.ticket})` : "";
  return {
    decision: config.onForeignEdit === "deny" ? "deny" : "ask",
    reason:
      `${relPath} belongs to ${owner.name}, ${owner.role}${ticket}, per docs/OWNERSHIP.md. ` +
      `This session works as ${me.name}. Approve only if you and ${firstName} agreed; ` +
      `otherwise leave a note for ${firstName} instead of editing.`,
  };
}

function main() {
  let input = {};
  try {
    input = JSON.parse(readFileSync(0, "utf8") || "{}");
  } catch {
    process.exit(0);
  }
  const toolInput = input.tool_input ?? {};
  const target = toolInput.file_path ?? toolInput.notebook_path ?? toolInput.path;
  if (!target) process.exit(0);

  const abs = path.resolve(input.cwd ?? process.cwd(), target);
  const root = findRoot(abs) ?? process.env.CLAUDE_PROJECT_DIR;
  if (!root) process.exit(0);
  const rel = path.relative(root, abs).split(path.sep).join("/");
  if (!rel || rel.startsWith("..")) process.exit(0);

  const result = decideForFile(root, rel, currentDev(root));
  if (result) {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: result.decision,
          permissionDecisionReason: result.reason,
        },
      }),
    );
  }
  process.exit(0);
}

if (
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("ownership-guard.mjs")
) {
  main();
}
