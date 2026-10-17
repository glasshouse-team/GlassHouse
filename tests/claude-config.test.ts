/**
 * Keeps the Claude Code setup loadable. If a skill's frontmatter stops parsing as YAML,
 * Claude Code falls back to the skill's heading and loses its description, so the skill is
 * no longer picked automatically. Also checks that the ticket map, the start-ticket table,
 * the hooks and the offline tickets agree with each other.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const CLAUDE = path.join(ROOT, ".claude");
const SKILLS = path.join(CLAUDE, "skills");
/** Claude Code truncates description + when_to_use in the skill listing after this. */
const LISTING_LIMIT = 1536;

const installed = existsSync(SKILLS);

function frontmatter(file: string): Record<string, unknown> {
  const text = readFileSync(file, "utf8");
  const match = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) throw new Error(`${path.relative(ROOT, file)} has no frontmatter`);
  const data: unknown = parse(match[1]);
  if (!data || typeof data !== "object") throw new Error(`${file}: frontmatter is not a map`);
  return data as Record<string, unknown>;
}

function markdownFiles(dir: string): string[] {
  return existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".md")) : [];
}

const skillNames = installed
  ? readdirSync(SKILLS).filter((d) => existsSync(path.join(SKILLS, d, "SKILL.md")))
  : [];

interface TicketMap {
  tickets: Record<string, { skills: string[] }>;
}

describe("Claude Code setup", () => {
  it("is installed", () => {
    expect(
      installed,
      ".claude/skills is missing: run the install command in claude-setup/README.md",
    ).toBe(true);
  });
});

describe.runIf(installed)("skills", () => {
  it.each(skillNames)("%s has valid frontmatter", (dir) => {
    const data = frontmatter(path.join(SKILLS, dir, "SKILL.md"));
    expect(data.name).toBe(dir);
    expect(typeof data.description).toBe("string");
    expect((data.description as string).length).toBeGreaterThan(40);
    for (const key of ["when_to_use", "argument-hint"]) {
      if (key in data) expect(typeof data[key], `${dir}: ${key}`).toBe("string");
    }
    const listed = `${data.description}${data.when_to_use ?? ""}`;
    expect(listed.length).toBeLessThanOrEqual(LISTING_LIMIT);
  });
});

describe.runIf(installed)("subagents and rules", () => {
  it.each(markdownFiles(path.join(CLAUDE, "agents")))("agent %s parses", (file) => {
    const data = frontmatter(path.join(CLAUDE, "agents", file));
    expect(typeof data.name).toBe("string");
    expect(typeof data.description).toBe("string");
  });

  it.each(markdownFiles(path.join(CLAUDE, "rules")))("rule %s has paths", (file) => {
    const data = frontmatter(path.join(CLAUDE, "rules", file));
    expect(Array.isArray(data.paths) && data.paths.length > 0).toBe(true);
    for (const p of data.paths as unknown[]) expect(typeof p).toBe("string");
  });
});

describe.runIf(installed)("hooks and ticket routing", () => {
  const settings = JSON.parse(readFileSync(path.join(CLAUDE, "settings.json"), "utf8"));
  const ticketMap: TicketMap = JSON.parse(
    readFileSync(path.join(CLAUDE, "ticket-map.json"), "utf8"),
  );

  it("points every hook at a script that exists", () => {
    const commands = JSON.stringify(settings.hooks).match(/\.claude\/hooks\/[\w.-]+\.mjs/g) ?? [];
    expect(commands.length).toBeGreaterThan(0);
    for (const script of commands) expect(existsSync(path.join(ROOT, script)), script).toBe(true);
  });

  it("only names skills that exist in the ticket map", () => {
    for (const [key, ticket] of Object.entries(ticketMap.tickets)) {
      for (const skill of ticket.skills) expect(skillNames, `${key} -> ${skill}`).toContain(skill);
    }
  });

  it("has an offline file for every ticket", () => {
    for (const key of Object.keys(ticketMap.tickets)) {
      expect(existsSync(path.join(ROOT, "docs", "tickets", `${key}.md`)), key).toBe(true);
    }
  });

  it("keeps the start-ticket table in line with the ticket map", () => {
    const table = readFileSync(path.join(SKILLS, "start-ticket", "SKILL.md"), "utf8")
      .split("\n")
      .filter((line) => /^\| GH-\d+ /.test(line));
    expect(table.length).toBeGreaterThan(20);
    for (const line of table) {
      const [, ticketCell, skillsCell] = line.split("|").map((c) => c.trim());
      const key = ticketCell.split(" ")[0];
      const listed = skillsCell
        .replace(/\(.*?\)/g, "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      expect(listed.sort(), key).toEqual([...(ticketMap.tickets[key]?.skills ?? [])].sort());
    }
  });
});
