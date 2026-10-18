import { describe, expect, it } from "vitest";
import { deleteBlocker } from "./home-delete";

const free = { isSeed: false, liveDeals: 0, upcomingStays: 0 };

describe("deleteBlocker", () => {
  it("lets a host delete a home nobody depends on", () => {
    expect(deleteBlocker(free)).toBeNull();
  });

  it("keeps the seeded demo homes", () => {
    expect(deleteBlocker({ ...free, isSeed: true })?.code).toBe("demo_home");
  });

  it("refuses while guests have upcoming stays, then while deals are live", () => {
    expect(deleteBlocker({ ...free, upcomingStays: 1 })).toEqual({
      code: "has_bookings",
      message: "This home has 1 upcoming stay. It can be deleted after it ends.",
    });
    expect(deleteBlocker({ ...free, upcomingStays: 2, liveDeals: 1 })?.message).toBe(
      "This home has 2 upcoming stays. It can be deleted after they end.",
    );
    expect(deleteBlocker({ ...free, liveDeals: 1 })?.code).toBe("live_deals");
  });
});
