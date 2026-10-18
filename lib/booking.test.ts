import { describe, expect, it } from "vitest";
import { DEMO_DEAL } from "@/seed/fixtures";
import { bookingProblem, defaultGuests, defaultStay, stayRangeLabel } from "./booking";

const ok = {
  checkIn: DEMO_DEAL.checkIn,
  checkOut: DEMO_DEAL.checkOut,
  guests: 4,
  maxGuests: 4,
  blockedDates: [],
  today: "2026-10-18",
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

  it("rejects a check-in before today, but not today", () => {
    expect(bookingProblem({ ...ok, today: "2026-11-10" })).toBe("Check-in can't be in the past");
    expect(bookingProblem({ ...ok, today: DEMO_DEAL.checkIn })).toBeNull();
  });

  it("rejects too many or too few guests", () => {
    expect(bookingProblem({ ...ok, guests: 5 })).toBe("This home sleeps up to 4");
    expect(bookingProblem({ ...ok, guests: 0 })).toBe("Add at least one guest");
  });

  it("names the blocked nights, but not a blocked check-out day", () => {
    expect(bookingProblem({ ...ok, blockedDates: ["2026-11-11", "2026-11-12"] })).toBe(
      "Not available on Nov 11, Nov 12",
    );
    expect(bookingProblem({ ...ok, blockedDates: [DEMO_DEAL.checkOut] })).toBeNull();
  });
});

describe("defaultStay", () => {
  it("starts on the demo dates while they are ahead", () => {
    expect(defaultStay("2026-10-18", DEMO_DEAL)).toEqual({
      checkIn: "2026-11-09",
      checkOut: "2026-11-13",
    });
  });

  it("falls back to four nights a week out once the demo dates have passed", () => {
    expect(defaultStay("2026-12-01", DEMO_DEAL)).toEqual({
      checkIn: "2026-12-08",
      checkOut: "2026-12-12",
    });
  });
});

describe("defaultGuests", () => {
  it("uses the demo's 4 guests, capped by the home", () => {
    expect(defaultGuests(6, DEMO_DEAL.guests)).toBe(4);
    expect(defaultGuests(2, DEMO_DEAL.guests)).toBe(2);
  });
});

describe("stayRangeLabel", () => {
  it("reads like a person would say it", () => {
    expect(stayRangeLabel("2026-11-09", "2026-11-13")).toBe("Nov 9 to Nov 13");
  });
});
