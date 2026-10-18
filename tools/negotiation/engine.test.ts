import { describe, expect, it } from "vitest";
import { DEMO_DEAL, DEMO_SCRIPT } from "@/seed/fixtures";
import {
  approvalPrompt,
  differenceFromList,
  moveSummary,
  REFUSAL_NOTES,
  suggestMove,
  type PastOffer,
} from "./engine";

const LIST = 52_000;

describe("suggestMove", () => {
  it("plays the demo script: $470, $495, $480, accept", () => {
    const offers: PastOffer[] = [];
    const moves = [];
    for (const step of DEMO_SCRIPT) {
      const move = suggestMove(step.actor, offers, LIST, DEMO_DEAL.guestTargetCents);
      moves.push({ actor: step.actor, type: move.kind, amountCents: move.amountCents });
      if (move.kind !== "accept") offers.push({ by: step.actor, amountCents: move.amountCents });
    }
    expect(moves).toEqual(
      DEMO_SCRIPT.map((s) => ({
        actor: s.actor,
        type: s.round === 1 ? "offer" : s.type,
        amountCents: s.amountCents,
      })),
    );
  });

  it("opens at 10% off the list when the guest set no target", () => {
    expect(suggestMove("guest_agent", [], LIST, null)).toEqual({
      kind: "offer",
      amountCents: 46_500,
    });
  });

  it("never opens above the list", () => {
    expect(suggestMove("guest_agent", [], LIST, 60_000).amountCents).toBe(LIST);
  });
});

describe("refusal notes", () => {
  it("carry no amounts, so neither side's limits reach the deal room", () => {
    for (const note of Object.values(REFUSAL_NOTES)) expect(note).not.toMatch(/\$|\d/);
  });
});

describe("feed lines", () => {
  it("name the actor, the amount and the difference from the list", () => {
    const stay = "Nov 9 to Nov 13";
    expect(moveSummary("guest_agent", { kind: "offer", amountCents: 47_000 }, LIST, stay)).toBe(
      "Guest agent offered $470 (-$50) for Nov 9 to Nov 13",
    );
    expect(moveSummary("host_agent", { kind: "counter", amountCents: 49_500 }, LIST, stay)).toBe(
      "Host agent countered at $495 (-$25)",
    );
    expect(moveSummary("host_agent", { kind: "accept", amountCents: 48_000 }, LIST, stay)).toBe(
      "Host agent accepted $480 (-$40) for Nov 9 to Nov 13",
    );
    expect(differenceFromList(LIST, LIST)).toBe("");
  });

  it("asks the host the demo question", () => {
    expect(approvalPrompt(48_000, LIST, "Nov 9 to Nov 13")).toBe(
      "Approve $480 for Nov 9 to Nov 13 (-$40, 7.7% off)?",
    );
  });
});
