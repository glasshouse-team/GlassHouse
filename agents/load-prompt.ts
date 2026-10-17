/**
 * Loads a system prompt from agents/prompts/<name>.md and fills {{placeholders}} (owner: Beka).
 * next.config.ts ships agents/prompts with every API route (outputFileTracingIncludes).
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const cache = new Map<string, string>();

export function loadPrompt(name: string, vars: Record<string, string | number> = {}): string {
  let template = cache.get(name);
  if (template === undefined) {
    template = readFileSync(path.join(process.cwd(), "agents", "prompts", `${name}.md`), "utf8");
    cache.set(name, template);
  }
  const filled = template.replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
    key in vars ? String(vars[key]) : match,
  );
  const missing = [...filled.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);
  if (missing.length > 0) {
    throw new Error(`Prompt "${name}" is missing values for: ${[...new Set(missing)].join(", ")}`);
  }
  return filled;
}
