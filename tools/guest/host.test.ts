import { describe, expect, it, vi } from "vitest";
import type { AskHomeResult } from "@/tools/host-qa/askHome";
import { askHostTool, type AskHostSide } from "./host";

const LISTING = "11111111-1111-4111-8111-111111111111";
const DEAL = "22222222-2222-4222-8222-222222222222";
const answer: AskHomeResult = {
  conversationId: "c",
  messageId: "m",
  answer: "Yes, there is free parking in the yard.",
  sources: [{ type: "fact", key: "parking" }],
  forwarded: false,
};

function setup(extra: Partial<AskHostSide> = {}) {
  const side: AskHostSide = {
    listingId: LISTING,
    dealId: DEAL,
    privateAmountsCents: [47_000, 50_000],
    asked: { done: false },
    ask: vi.fn(async () => answer),
    ...extra,
  };
  const t = askHostTool(side) as unknown as {
    execute: (input: unknown, options: unknown) => Promise<Record<string, unknown>>;
  };
  return {
    side,
    run: (question: string) => t.execute({ question }, { toolCallId: "t", messages: [] }),
  };
}

describe("ask_host", () => {
  it("asks askHome as the guest agent, with the deal, and returns the cited answer", async () => {
    const { side, run } = setup();
    expect(await run("Is there parking for one car?")).toEqual({
      ok: true,
      summary: "Host agent answered the guest agent's question",
      answer: answer.answer,
      sources: answer.sources,
      forwarded: false,
    });
    expect(side.ask).toHaveBeenCalledWith({
      listingId: LISTING,
      question: "Is there parking for one car?",
      askedBy: "guest_agent",
      guestId: undefined,
      dealId: DEAL,
    });
  });

  it("never sends a question about money or the guest's limits", async () => {
    const { side, run } = setup();
    for (const q of [
      "Would you take $480?",
      "Can we do 500 for the stay",
      "What's your best price?",
    ])
      expect(await run(q)).toMatchObject({ ok: false, code: "money_question" });
    expect(side.ask).not.toHaveBeenCalled();
    expect(side.asked.done).toBe(false);
  });

  it("asks once per run", async () => {
    const { side, run } = setup();
    await run("Is there a crib?");
    expect(await run("And a high chair?")).toMatchObject({ ok: false, code: "already_asked" });
    expect(side.ask).toHaveBeenCalledTimes(1);
  });

  it("says when the host agent forwarded it, and survives a failure", async () => {
    expect(
      await setup({
        ask: vi.fn(async () => ({ ...answer, answer: null, sources: [], forwarded: true })),
      }).run("Can we check in at 11pm?"),
    ).toMatchObject({
      ok: true,
      forwarded: true,
      summary: "Host agent passed the guest agent's question to the host",
    });
    expect(
      await setup({ ask: vi.fn(async () => Promise.reject(new Error("down"))) }).run(
        "Is there a crib?",
      ),
    ).toMatchObject({ ok: false, code: "unavailable" });
  });
});
