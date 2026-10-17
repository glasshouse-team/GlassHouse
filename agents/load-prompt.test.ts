import { describe, expect, it } from "vitest";
import { loadPrompt } from "./load-prompt";

describe("loadPrompt", () => {
  it("fills placeholders from agents/prompts/*.md", () => {
    const text = loadPrompt("guest", { guest_name: "Nino", target: "$470", max: "$500" });
    expect(text).toContain("guest agent for Nino");
    expect(text).toContain("Maximum total: $500");
    expect(text).not.toMatch(/\{\{\w+\}\}/);
  });

  it("refuses to return a prompt with unfilled placeholders", () => {
    expect(() => loadPrompt("guest", { guest_name: "Nino" })).toThrow(/target, max/);
  });
});
