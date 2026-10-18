/**
 * GH-16 (owner: Temuri). The sources "Ask this home" may cite, and the code check of every
 * citation. Pure: no database, no model. Chip text lives in components/ask-home/source-label.ts.
 *
 * - fact:   a key in `listing_facts.facts` (the Verifier's X-ray, GH-9)
 * - rule:   a key in `listings.house_rules`
 * - manual: one line of `listings.house_manual`. "Label: text" lines are keyed by their label
 *           ("Wifi: ..." is `manual:wifi`); lines under a "## Heading" are keyed
 *           "<heading> <n>" ("host answers 1"), so host replies saved there are citable.
 */
import { z } from "zod";

export const AnswerSourceSchema = z.object({
  type: z.enum(["fact", "rule", "manual"]),
  key: z.string().min(1).max(120),
  quote: z.string().max(500).optional(),
});
export type AnswerSourceInput = z.infer<typeof AnswerSourceSchema>;

export interface CheckedSource {
  type: "fact" | "rule" | "manual";
  key: string;
  /** The real words from the source (code fills it, so a chip never shows invented text). */
  quote: string;
}

export interface QaFact {
  key: string;
  value: string | number | boolean;
  confidence: number;
}

export interface ManualLine {
  key: string;
  text: string;
}

/** Everything the Q&A agent may answer from. Never holds a price policy (D-025). */
export interface QaSources {
  facts: QaFact[];
  rules: Record<string, unknown>;
  manual: ManualLine[];
}

/** Heading of the manual part the learning loop writes to (GH-16 build notes). */
export const HOST_ANSWERS_HEADING = "## Host answers";

const LABEL = /^([A-Za-z][\w &/'-]{0,39}):\s+(\S.*)$/;

function norm(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

/** One entry per non-empty manual line, with a unique key. */
export function manualLines(manual: string): ManualLine[] {
  const lines: ManualLine[] = [];
  const used = new Map<string, number>();
  let section: string | null = null;
  let inSection = 0;
  const unique = (key: string) => {
    const n = (used.get(key) ?? 0) + 1;
    used.set(key, n);
    return n === 1 ? key : `${key} ${n}`;
  };
  for (const raw of manual.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const heading = /^#{1,6}\s+(.+)$/.exec(line);
    if (heading) {
      section = norm(heading[1]);
      inSection = 0;
      continue;
    }
    const text = line.replace(/^[-*]\s+/, "");
    if (section) {
      inSection += 1;
      lines.push({ key: unique(`${section} ${inSection}`), text });
      continue;
    }
    const label = LABEL.exec(text);
    lines.push({ key: unique(label ? norm(label[1]) : "manual"), text });
  }
  return lines;
}

/** The value of a house rule as people read it: `false` → "not allowed". */
export function ruleText(value: unknown): string {
  if (value === true) return "allowed";
  if (value === false) return "not allowed";
  if (typeof value === "string" || typeof value === "number") return String(value);
  return JSON.stringify(value);
}

function pick(quote: string | undefined, whole: string): string {
  return quote && norm(whole).includes(norm(quote)) && norm(quote).length > 0
    ? quote.trim()
    : whole;
}

export type CheckResult = { ok: true; sources: CheckedSource[] } | { ok: false; reason: string };

/**
 * Checks every cited source against the listing's real data. An answer with no source, or
 * with any source that does not exist, is refused, so the agent must fix it or forward.
 */
export function checkSources(cited: AnswerSourceInput[], data: QaSources): CheckResult {
  if (cited.length === 0) return { ok: false, reason: "An answer needs at least one source." };
  const checked: CheckedSource[] = [];
  const problems: string[] = [];
  for (const source of cited) {
    const key = source.key.trim();
    if (source.type === "fact") {
      const fact = data.facts.find((f) => norm(f.key) === norm(key));
      if (!fact) problems.push(`No listing fact "${key}".`);
      else checked.push({ type: "fact", key: fact.key, quote: String(fact.value) });
    } else if (source.type === "rule") {
      const ruleKey = Object.keys(data.rules).find((k) => norm(k) === norm(key));
      const value = ruleKey === undefined ? undefined : data.rules[ruleKey];
      if (ruleKey === undefined || value === undefined || value === null)
        problems.push(`No house rule "${key}".`);
      else checked.push({ type: "rule", key: ruleKey, quote: pick(source.quote, ruleText(value)) });
    } else {
      const byKey = data.manual.find((l) => l.key === norm(key));
      const byQuote =
        source.quote && norm(source.quote).length >= 8
          ? data.manual.find((l) => norm(l.text).includes(norm(source.quote!)))
          : undefined;
      const line = byKey ?? byQuote;
      if (!line) problems.push(`No house manual line "${key}".`);
      else checked.push({ type: "manual", key: line.key, quote: pick(source.quote, line.text) });
    }
  }
  if (problems.length > 0)
    return { ok: false, reason: `${problems.join(" ")} Cite only keys from listing_sources.` };
  const seen = new Set<string>();
  const sources = checked.filter((s) => {
    const id = `${s.type}:${s.key}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  return { ok: true, sources };
}

const ONE_LINE = (text: string, max: number) => text.replace(/\s+/g, " ").trim().slice(0, max);

/**
 * Appends a host reply to the "## Host answers" part of the manual (the learning loop).
 * Guest and host text is flattened to one line, so it cannot add headings or fake lines.
 */
export function appendHostAnswer(manual: string, question: string, answer: string): string {
  const line = `- Q: ${ONE_LINE(question, 200)} A: ${ONE_LINE(answer, 400)}`;
  const body = manual.replace(/\s+$/, "");
  const lines = body.split(/\r?\n/).map((l) => l.trim());
  // Idempotent: a retried host reply does not add the same answer twice.
  if (lines.includes(line)) return manual;
  if (lines.includes(HOST_ANSWERS_HEADING)) return `${body}\n${line}\n`;
  return `${body ? `${body}\n\n` : ""}${HOST_ANSWERS_HEADING}\n${line}\n`;
}
