import { describe, expect, it } from "vitest";
import { answerText, shownResults, takeNewActions, type PartLike } from "./ask-space";

const DESK = "11111111-1111-4111-8111-111111111111";

const flyPart: PartLike = {
  type: "tool-fly_to",
  toolCallId: "c1",
  state: "output-available",
  output: {
    ok: true,
    summary: "Guest agent showed Nino the desk",
    action: { type: "fly_to", anchorId: DESK },
    shown: "the desk (Living room)",
    honestyNote: "That area is partly AI-filled; the host hasn't filmed it yet.",
  },
};

describe("shownResults", () => {
  it("keeps finished, valid tool results with their honesty note", () => {
    expect(shownResults([{ type: "text" }, flyPart])).toEqual([
      {
        toolCallId: "c1",
        action: { type: "fly_to", anchorId: DESK },
        shown: "the desk (Living room)",
        honestyNote: "That area is partly AI-filled; the host hasn't filmed it yet.",
      },
    ]);
  });

  it("skips refusals, unfinished calls and unknown actions", () => {
    expect(
      shownResults([
        { ...flyPart, output: { ok: false, summary: "x", error: "No anchor" } },
        { ...flyPart, state: "input-available" },
        { ...flyPart, output: { ok: true, action: { type: "teleport" }, shown: "x" } },
        { ...flyPart, type: "dynamic-tool" },
      ]),
    ).toEqual([]);
  });
});

describe("takeNewActions", () => {
  it("returns each action once per toolCallId, in order, from assistant messages only", () => {
    const look: PartLike = {
      ...flyPart,
      toolCallId: "c2",
      output: { ok: true, action: { type: "look_toward", anchorId: DESK }, shown: "the desk" },
    };
    const done = new Set<string>();
    const messages = [
      { role: "user", parts: [flyPart] },
      { role: "assistant", parts: [flyPart, look] },
    ];
    expect(takeNewActions(messages, done)).toEqual([
      { type: "fly_to", anchorId: DESK },
      { type: "look_toward", anchorId: DESK },
    ]);
    expect(takeNewActions(messages, done)).toEqual([]);
  });
});

describe("answerText", () => {
  it("keeps only the answer written after the last tool call", () => {
    expect(
      answerText([
        { type: "text", text: "I'll show the living room one first." },
        flyPart,
        { type: "text", text: "Yes, there's a TV in the living room." },
      ]),
    ).toBe("Yes, there's a TV in the living room.");
  });

  it("falls back to all the text when no tool ran or nothing followed it", () => {
    expect(answerText([{ type: "text", text: "I can't see a jacuzzi in this home." }])).toBe(
      "I can't see a jacuzzi in this home.",
    );
    expect(answerText([{ type: "text", text: "Here it is." }, flyPart])).toBe("Here it is.");
  });
});

describe("answerText with dynamic tools", () => {
  it("treats a dynamic-tool part as a tool call", () => {
    expect(
      answerText([
        { type: "text", text: "Let me look." },
        { type: "dynamic-tool", toolCallId: "d1" },
        { type: "text", text: "The desk is in the living room." },
      ]),
    ).toBe("The desk is in the living room.");
  });
});
