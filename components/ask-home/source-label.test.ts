import { describe, expect, it } from "vitest";
import { sourceLabel } from "./source-label";

describe("sourceLabel", () => {
  it("writes readable chips for rules, facts and manual lines", () => {
    expect(sourceLabel({ type: "rule", key: "pets", quote: "One dog under 15 kg" })).toBe(
      "House rules: Pets: One dog under 15 kg",
    );
    expect(sourceLabel({ type: "rule", key: "check_in_after", quote: "15:00" })).toBe(
      "House rules: Check-in after: 15:00",
    );
    expect(sourceLabel({ type: "fact", key: "washer", quote: "true" })).toBe(
      "Seen in photos: Washer",
    );
    expect(sourceLabel({ type: "fact", key: "beds_counted", quote: "2" })).toBe(
      "Seen in photos: 2 beds counted",
    );
    expect(sourceLabel({ type: "manual", key: "wifi", quote: "fine for video calls" })).toBe(
      "House manual: fine for video calls",
    );
  });

  it("shortens long manual lines", () => {
    const label = sourceLabel({ type: "manual", key: "x", quote: "word ".repeat(40) });
    expect(label.length).toBeLessThanOrEqual("House manual: ".length + 90);
    expect(label.endsWith("…")).toBe(true);
  });
});
