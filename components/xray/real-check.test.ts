import { describe, expect, it } from "vitest";
import { isRealCheck } from "./real-check";

const photos = new Set(["p1", "p2", "p3"]);
const fact = (...evidence: string[]) => ({ evidence });

describe("isRealCheck", () => {
  it("accepts a Verifier row whose evidence is all among the listing's photos", () => {
    expect(
      isRealCheck(
        { model: "claude-haiku-5-5", facts: [fact("p1"), fact("p2", "p3")], contradictions: [] },
        photos,
      ),
    ).toBe(true);
  });

  it("rejects the seed placeholder even when its evidence exists", () => {
    expect(isRealCheck({ model: "seed", facts: [fact("p1")], contradictions: [] }, photos)).toBe(
      false,
    );
  });

  it("rejects the seed's washer fact with no photos at all", () => {
    expect(isRealCheck({ model: "seed", facts: [fact()], contradictions: [] }, new Set())).toBe(
      false,
    );
  });

  it("rejects a row citing a photo the listing no longer has", () => {
    expect(
      isRealCheck(
        { model: "claude-haiku-5-5", facts: [fact("p1", "gone")], contradictions: [] },
        photos,
      ),
    ).toBe(false);
    expect(
      isRealCheck(
        { model: "claude-haiku-5-5", facts: [], contradictions: [{ evidence: ["gone"] }] },
        photos,
      ),
    ).toBe(false);
  });

  it("rejects a fact without evidence", () => {
    expect(
      isRealCheck({ model: "claude-haiku-5-5", facts: [fact()], contradictions: [] }, photos),
    ).toBe(false);
  });

  it("allows a contradiction without photos and a row with only missing photos", () => {
    expect(
      isRealCheck(
        { model: "claude-haiku-5-5", facts: [], contradictions: [{ evidence: [] }] },
        photos,
      ),
    ).toBe(true);
    expect(isRealCheck({ model: null, facts: [], contradictions: [] }, new Set())).toBe(true);
  });
});
