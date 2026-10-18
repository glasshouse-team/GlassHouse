import { describe, expect, it } from "vitest";
import { factLabel } from "./fact-label";

describe("factLabel", () => {
  it("names yes/no facts", () => {
    expect(factLabel("washer", true)).toBe("Washer");
    expect(factLabel("fireplace", false)).toBe("No fireplace seen");
  });

  it("counts beds and sleeping spots", () => {
    expect(factLabel("beds_counted", 1)).toBe("1 bed counted");
    expect(factLabel("beds_counted", 4)).toBe("4 beds counted");
    expect(factLabel("sleeping_spots", 3)).toBe("3 sleeping spots");
  });

  it("shows phrases after the title and humanizes unknown keys", () => {
    expect(factLabel("view_type", " courtyard ")).toBe("View: courtyard");
    expect(factLabel("air_conditioning", true)).toBe("Air conditioning");
    expect(factLabel("chairs_at_table", 4)).toBe("Chairs at table: 4");
  });
});
