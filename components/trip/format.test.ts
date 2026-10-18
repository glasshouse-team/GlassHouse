import { describe, expect, it } from "vitest";
import { tripPriceLines } from "./format";

describe("tripPriceLines", () => {
  it("shows the saved numbers of the reservation row", () => {
    const lines = tripPriceLines({
      check_in: "2026-11-09",
      check_out: "2026-11-13",
      nightly_total_cents: 50000,
      cleaning_cents: 3000,
      discount_cents: 5000,
      service_fee_cents: 4800,
      total_cents: 52800,
    });
    expect(lines).toEqual([
      { label: "4 nights", amount: "$500" },
      { label: "Cleaning fee", amount: "$30" },
      { label: "Agreed discount", amount: "-$50" },
      { label: "Service fee", amount: "$48" },
      { label: "Total", amount: "$528", total: true },
    ]);
  });

  it("leaves out a zero cleaning fee and discount", () => {
    const lines = tripPriceLines({
      check_in: "2026-12-01",
      check_out: "2026-12-02",
      nightly_total_cents: 9000,
      cleaning_cents: 0,
      discount_cents: 0,
      service_fee_cents: 900,
      total_cents: 9900,
    });
    expect(lines.map((l) => l.label)).toEqual(["1 night", "Service fee", "Total"]);
  });
});
