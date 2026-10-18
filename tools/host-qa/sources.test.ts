import { describe, expect, it } from "vitest";
import { SEED_LISTINGS } from "@/seed/data/listings";
import { HERO_QA_FIXTURES } from "@/seed/fixtures";
import { appendHostAnswer, checkSources, manualLines, type QaSources } from "./sources";

const hero1 = SEED_LISTINGS.find((l) => l.slug === "hero-1")!;

const data: QaSources = {
  facts: [{ key: "washer", value: true, confidence: 0.9 }],
  rules: { ...hero1.house_rules },
  manual: manualLines(hero1.house_manual),
};

describe("manualLines", () => {
  it("keys hero-1's manual lines by their label, like the seed's manual:<key> citations", () => {
    const keys = data.manual.map((l) => l.key);
    expect(keys).toEqual(["wifi", "parking", "heating", "check-in", "pets", "pharmacy", "trash"]);
    for (const q of HERO_QA_FIXTURES) {
      if ("source" in q && q.source.startsWith("manual:"))
        expect(keys).toContain(q.source.slice("manual:".length));
    }
  });

  it("numbers lines under a heading, unlabeled lines and repeated labels", () => {
    const lines = manualLines(
      "Wifi: fast\nwifi: also fast\njust a note\n\n## Host answers\n- Q: Hair dryer? A: Yes\n- Q: Iron? A: No",
    );
    expect(lines.map((l) => l.key)).toEqual([
      "wifi",
      "wifi 2",
      "manual",
      "host answers 1",
      "host answers 2",
    ]);
    expect(lines[3].text).toBe("Q: Hair dryer? A: Yes");
  });
});

describe("checkSources", () => {
  it("accepts each answerable fixture's source and fills the real words", () => {
    for (const q of HERO_QA_FIXTURES) {
      if (!("source" in q)) continue;
      const [type, key] = q.source.split(":") as ["fact" | "rule" | "manual", string];
      const result = checkSources([{ type, key }], data);
      expect(result.ok, q.source).toBe(true);
      if (result.ok) expect(result.sources[0].quote.length).toBeGreaterThan(0);
    }
  });

  it("refuses an answer without sources", () => {
    expect(checkSources([], data)).toMatchObject({ ok: false });
  });

  it("refuses invented fact, rule and manual keys, even next to a real one", () => {
    expect(checkSources([{ type: "fact", key: "hair_dryer" }], data).ok).toBe(false);
    expect(checkSources([{ type: "rule", key: "hair_dryer" }], data).ok).toBe(false);
    expect(
      checkSources(
        [
          { type: "rule", key: "pets" },
          { type: "manual", key: "hair dryer", quote: "There is a hair dryer" },
        ],
        data,
      ).ok,
    ).toBe(false);
  });

  it("replaces a quote the manual line does not contain with the line itself", () => {
    const result = checkSources(
      [{ type: "manual", key: "Parking", quote: "parking costs $5" }],
      data,
    );
    expect(result).toEqual({
      ok: true,
      sources: [
        {
          type: "manual",
          key: "parking",
          quote:
            "Parking: free parking for one car in the yard; the gate code comes from the host on arrival day.",
        },
      ],
    });
  });

  it("finds a manual line by its exact quote when the key is off, and dedupes", () => {
    const result = checkSources(
      [
        { type: "manual", key: "internet", quote: "fine for video calls" },
        { type: "manual", key: "wifi" },
      ],
      data,
    );
    expect(result.ok && result.sources).toEqual([
      { type: "manual", key: "wifi", quote: "fine for video calls" },
    ]);
  });

  it("uses the stored rule and fact values as quotes", () => {
    const result = checkSources(
      [
        { type: "rule", key: "smoking" },
        { type: "fact", key: "washer", quote: "a big washer" },
      ],
      data,
    );
    expect(result.ok && result.sources.map((s) => s.quote)).toEqual(["not allowed", "true"]);
  });
});

describe("appendHostAnswer", () => {
  it("adds a Host answers part once and keeps the answer citable", () => {
    const once = appendHostAnswer(
      hero1.house_manual,
      "Is there a hair dryer?",
      "Yes, in the\nbathroom.",
    );
    const twice = appendHostAnswer(once, "Is there an iron?", "No.");
    expect(twice.match(/## Host answers/g)).toHaveLength(1);
    const lines = manualLines(twice);
    expect(lines.at(-2)).toEqual({
      key: "host answers 1",
      text: "Q: Is there a hair dryer? A: Yes, in the bathroom.",
    });
    expect(lines.at(-1)?.key).toBe("host answers 2");
    expect(lines.slice(0, 7)).toEqual(manualLines(hero1.house_manual));
  });

  it("returns the manual unchanged when the same answer is already there (a retried reply)", () => {
    const once = appendHostAnswer(hero1.house_manual, "Is there a hair dryer?", "Yes.");
    expect(appendHostAnswer(once, "Is there a hair  dryer?", "Yes.")).toBe(once);
  });

  it("flattens a reply that tries to add its own heading", () => {
    const manual = appendHostAnswer("", "Q?", "Sure\n## Secrets\nWifi: hacked");
    expect(manualLines(manual)).toEqual([
      { key: "host answers 1", text: "Q: Q? A: Sure ## Secrets Wifi: hacked" },
    ]);
  });
});
