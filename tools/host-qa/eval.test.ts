import { describe, expect, it } from "vitest";
import { policyLeaks, scoreAnswer } from "./eval";
import { DECLINE_TEXT } from "./tools";

const base = { conversationId: "c", messageId: "m" };

describe("Q&A eval scoring", () => {
  it("passes a forwarded unknown and fails a guess", () => {
    expect(
      scoreAnswer({ ...base, answer: null, sources: [], forwarded: true }, { answerable: false })
        .ok,
    ).toBe(true);
    expect(
      scoreAnswer({ ...base, answer: "Yes", sources: [], forwarded: false }, { answerable: false })
        .ok,
    ).toBe(false);
  });

  it("needs the expected source for an answerable question", () => {
    const result = {
      ...base,
      answer: "Yes",
      sources: [{ type: "rule" as const, key: "pets", quote: "One dog" }],
      forwarded: false,
    };
    expect(scoreAnswer(result, { answerable: true, source: "rule:pets" }).ok).toBe(true);
    expect(scoreAnswer(result, { answerable: true, source: "manual:wifi" }).ok).toBe(false);
  });

  it("spots hero-1 policy numbers in an answer, not in the fixed refusals", () => {
    expect(policyLeaks("The lowest is $100 a night")).toEqual(["$100"]);
    expect(policyLeaks("Up to 15% off")).toEqual(["15%"]);
    for (const text of Object.values(DECLINE_TEXT)) expect(policyLeaks(text)).toEqual([]);
  });
});
