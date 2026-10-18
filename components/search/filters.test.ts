import { describe, expect, it } from "vitest";
import { parseSearchFilters } from "./filters";

describe("parseSearchFilters", () => {
  it("reads a known city and a guest count", () => {
    expect(parseSearchFilters({ city: "Kazbegi", guests: "4" })).toEqual({
      city: "Kazbegi",
      guests: 4,
    });
  });

  it("ignores unknown cities, bad numbers and empty values", () => {
    expect(parseSearchFilters({ city: "Paris", guests: "lots" })).toEqual({});
    expect(parseSearchFilters({ city: "", guests: "" })).toEqual({});
    expect(parseSearchFilters({ guests: "0" })).toEqual({});
  });

  it("takes the first value of repeated params", () => {
    expect(parseSearchFilters({ city: ["Batumi", "Tbilisi"] })).toEqual({ city: "Batumi" });
  });
});
