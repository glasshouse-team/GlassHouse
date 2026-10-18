import { describe, expect, it } from "vitest";
import { initialHome, stepHome } from "./home-tabs";

describe("stepHome", () => {
  it("moves one home at a time and wraps around at both ends", () => {
    expect(stepHome(0, 1, 3)).toBe(1);
    expect(stepHome(2, 1, 3)).toBe(0);
    expect(stepHome(0, -1, 3)).toBe(2);
    expect(stepHome(0, 1, 0)).toBe(0);
  });
});

describe("initialHome", () => {
  const homes = [
    { id: "a1", slug: "hero-1" },
    { id: "b2", slug: "hero-2" },
  ];
  it("opens the home named in ?home= by slug or id", () => {
    expect(initialHome(homes, "hero-2")).toBe(1);
    expect(initialHome(homes, "b2")).toBe(1);
  });
  it("falls back to the first home", () => {
    expect(initialHome(homes, undefined)).toBe(0);
    expect(initialHome(homes, ["hero-2"])).toBe(0);
    expect(initialHome(homes, "nope")).toBe(0);
  });
});
