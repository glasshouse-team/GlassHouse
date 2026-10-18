import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { XrayResult } from "@/lib/schemas/verifier";
import { LIE_LISTING_SLUGS } from "@/seed/fixtures";
import { ExpectedSchema, scoreRun } from "./xray-score";

const expected = ExpectedSchema.parse(
  JSON.parse(readFileSync(path.join(__dirname, "fixtures", "xray-expected.json"), "utf8")),
);

const contradiction = (claim: string, finding: string) => ({
  claim,
  finding,
  evidence: ["p1"],
  severity: "high" as const,
});
const result = (overrides: Partial<XrayResult>): XrayResult => ({
  facts: [],
  contradictions: [],
  missing_photos: [],
  ...overrides,
});

describe("xray-expected.json", () => {
  it("lists a lie for both seeded lie listings", () => {
    for (const slug of Object.values(LIE_LISTING_SLUGS)) {
      expect(expected[slug]?.lies.length).toBeGreaterThan(0);
    }
  });
});

describe("scoreRun", () => {
  it("catches the sea view lie and counts other contradictions as invented", () => {
    const score = scoreRun(
      result({
        contradictions: [
          contradiction("Stunning sea view", "the balcony faces a courtyard"),
          contradiction("fast elevator", "no elevator in the photos"),
        ],
      }),
      expected[LIE_LISTING_SLUGS.seaView],
    );
    expect(score.caught).toEqual(["sea view"]);
    expect(score.missed).toEqual([]);
    expect(score.invented).toEqual(["fast elevator"]);
  });

  it("reports a missed lie and wrong facts", () => {
    const score = scoreRun(
      result({ facts: [{ key: "beds_counted", value: 6, evidence: ["p1"], confidence: 0.8 }] }),
      expected[LIE_LISTING_SLUGS.sleepsSix],
    );
    expect(score.missed).toEqual(["sleeps 6 with 4 beds"]);
    expect(score.wrongFacts).toEqual(["beds_counted: expected 4, got 6"]);
  });

  it("counts every contradiction on a truthful listing as invented", () => {
    const score = scoreRun(
      result({ contradictions: [contradiction("two monitors", "one monitor")] }),
      undefined,
    );
    expect(score.invented).toEqual(["two monitors"]);
    expect(score.caught).toEqual([]);
  });
});
