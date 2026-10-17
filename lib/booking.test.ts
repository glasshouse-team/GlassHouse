import { describe, expect, it } from "vitest";
import { DEMO_DEAL } from "@/seed/fixtures";
import { bookingProblem, defaultGuests, defaultStay } from "./booking";

const ok = {
  checkIn: DEMO_DEAL.checkIn,
  checkOut: DEMO_DEAL.checkOut,
  guests: 4,
  maxGuests: 4,
  blockedDates: [],
};

describe("bookingProblem", () => {
  it("accepts the demo stay", () => {
    expect(bookingProblem(ok)).toBeNull();
  });

  it("rejects zero-night, reversed and malformed stays", () => {
    expect(bookingProblem({ ...ok, checkOut: ok.checkIn })).toMatch(/at least one day/);
    expect(bookingProblem({ ...ok, checkIn: "2026-11-13", checkOut: "2026-11-09" })).toMatch(
      /at least one day/,
    );
    expect(bookingProblem({ ...ok, checkIn: "Nov 9" })).toMatch(/Invalid date/);
  });

  it("rejects too many or too few guests", () => {
    expect(bookingProblem({ ...ok, guests: 5 })).toBe("This home sleeps up to 4");
    expect(bookingProblem({ ...ok, guests: 0 })).toBe("Add at least one guest");
  });

  it("names the blocked nights, but not a blocked check-out day", () => {
    expect(bookingProblem({ ...ok, blockedDates: ["2026-11-11"] })).toBe(
      "Not available on 2026-11-11",
    );
    expect(bookingProblem({ ...ok, blockedDates: [DEMO_DEAL.checkOut] })).toBeNull();
  });
});

describe("defaultStay", () => {
  it("starts on the demo dates while they are ahead", () => {
    expect(defaultStay("2026-10-18")).toEqual({ checkIn: "2026-11-09", checkOut: "2026-11-13" });
  });

  it("falls back to four nights a week out once the demo dates have passed", () => {
    expect(defaultStay("2026-12-01")).toEqual({ checkIn: "2026-12-08", checkOut: "2026-12-12" });
  });
});

describe("defaultGuests", () => {
  it("uses the demo's 4 guests, capped by the home", () => {
    expect(defaultGuests(6)).toBe(4);
    expect(defaultGuests(2)).toBe(2);
  });
});
