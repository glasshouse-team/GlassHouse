/**
 * Scores X-ray runs against tools/verifier/fixtures/xray-expected.json (GH-9, `pnpm xray`).
 * Pure: no model or database calls.
 */
import { z } from "zod";
import type { XrayResult } from "@/lib/schemas/verifier";

const ExpectedListing = z.object({
  lies: z.array(z.object({ name: z.string(), match: z.array(z.string()).min(1) })).default([]),
  facts: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
});
export const ExpectedSchema = z.record(z.string(), z.unknown()).transform((all) =>
  Object.fromEntries(
    Object.entries(all)
      .filter(([slug]) => !slug.startsWith("$"))
      .map(([slug, value]) => [slug, ExpectedListing.parse(value)]),
  ),
);
export type Expected = z.output<typeof ExpectedSchema>;

export interface RunScore {
  caught: string[];
  missed: string[];
  /** Contradictions that match no expected lie. */
  invented: string[];
  /** Expected facts missing or with another value: "beds_counted: expected 4, got 6". */
  wrongFacts: string[];
}

export function scoreRun(result: XrayResult, expected: Expected[string] | undefined): RunScore {
  const lies = expected?.lies ?? [];
  const texts = result.contradictions.map((c) => `${c.claim} ${c.finding}`.toLowerCase());
  // Whole words only: "sea" must not match "seat" or "season".
  const escape = (m: string) => m.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const hits = (match: string[], text: string) =>
    match.some((m) => new RegExp(`\\b${escape(m)}\\b`).test(text));

  const caught = lies.filter((lie) => texts.some((t) => hits(lie.match, t))).map((l) => l.name);
  const invented = result.contradictions
    .filter((_, i) => !lies.some((lie) => hits(lie.match, texts[i])))
    .map((c) => c.claim);
  const wrongFacts = Object.entries(expected?.facts ?? {}).flatMap(([key, want]) => {
    const got = result.facts.find((f) => f.key === key)?.value;
    return got === want ? [] : [`${key}: expected ${want}, got ${got ?? "nothing"}`];
  });
  return {
    caught,
    missed: lies.map((l) => l.name).filter((name) => !caught.includes(name)),
    invented,
    wrongFacts,
  };
}
