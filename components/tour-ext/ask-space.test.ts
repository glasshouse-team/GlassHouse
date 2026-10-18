import { describe, expect, it } from "vitest";
import { shownResults, takeNewActions, type PartLike } from "./ask-space";

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
