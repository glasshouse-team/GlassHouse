import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/events", () => ({ logEvent: vi.fn(async () => {}) }));

import { logEvent } from "@/lib/events";
import { withEvent } from "./_withEvent";

const LISTING = "00000000-0000-4000-8000-0000000000b1";

function booking(
  fn: (nights: number) => Promise<string>,
  summarize = (id: string) => `Booked ${id}`,
) {
  return withEvent<[number], string>(
    {
      action: "reservation.created",
      actorName: "Nino (guest)",
      actorType: "human",
      summarize,
      scope: () => ({ listingId: LISTING }),
      payload: (id, nights) => ({ reservationId: id, nights }),
    },
    fn,
  );
}

beforeEach(() => vi.mocked(logEvent).mockClear());

describe("withEvent", () => {
  it("logs one event with the summary, scope and payload, and returns the result", async () => {
    expect(await booking(async () => "r-1")(4)).toBe("r-1");
    expect(logEvent).toHaveBeenCalledTimes(1);
    expect(vi.mocked(logEvent).mock.calls[0][0]).toMatchObject({
      actor_type: "human",
      actor_name: "Nino (guest)",
      action: "reservation.created",
      summary: "Booked r-1",
      listing_id: LISTING,
      payload: { reservationId: "r-1", nights: 4 },
    });
  });

  it("logs <action>.failed and rethrows when the work fails", async () => {
    const run = booking(async () => {
      throw new Error("insert failed");
    });
    await expect(run(4)).rejects.toThrow("insert failed");
    expect(vi.mocked(logEvent).mock.calls[0][0]).toMatchObject({
      action: "reservation.created.failed",
      payload: { error: "insert failed" },
    });
  });

  it("keeps a finished result when the summary throws", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const run = booking(
      async () => "r-2",
      () => {
        throw new Error("bad summary");
      },
    );
    expect(await run(4)).toBe("r-2");
    expect(vi.mocked(logEvent).mock.calls[0][0]).toMatchObject({
      action: "reservation.created",
      summary: "Nino (guest): reservation.created",
    });
  });
});
