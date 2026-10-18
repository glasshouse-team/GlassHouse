import { isStepCount, tool } from "ai";
import { MockLanguageModelV4, mockValues } from "ai/test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

// A fake model: first step calls the `echo` tool, second step answers with text.
const { model } = vi.hoisted(() => ({ model: { current: undefined as unknown } }));
vi.mock("@/lib/claude", () => ({
  agentModel: () => model.current,
  bulkModel: () => model.current,
}));
vi.mock("@/lib/events", () => ({ logEvent: vi.fn(async () => {}) }));

import { logEvent } from "@/lib/events";
import { createAgent, loggableInput } from "./core";

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};

/** Step 1 calls `echo`, step 2 answers "done". */
function twoStepModel() {
  const next = mockValues(
    {
      content: [
        {
          type: "tool-call" as const,
          toolCallId: "c1",
          toolName: "echo",
          input: JSON.stringify({ text: "hi" }),
        },
      ],
      finishReason: { unified: "tool-calls" as const, raw: undefined },
      usage,
      warnings: [],
    },
    {
      content: [{ type: "text" as const, text: "done" }],
      finishReason: { unified: "stop" as const, raw: undefined },
      usage,
      warnings: [],
    },
  );
  const mock = new MockLanguageModelV4({ doGenerate: async () => next() });
  model.current = mock;
  return mock;
}

const echo = tool({
  description: "Echo text back",
  inputSchema: z.object({ text: z.string() }),
  execute: async ({ text }) => ({ summary: `Host agent echoed "${text}"`, text }),
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createAgent", () => {
  it("runs tools and logs each call to the activity feed with the tool's summary", async () => {
    twoStepModel();
    const listingId = "11111111-1111-4111-8111-111111111111";
    const agent = createAgent({ name: "host", system: "Test agent", listingId, tools: { echo } });

    const result = await agent.generate({ prompt: "Say hi" });

    expect(result.text).toBe("done");
    expect(logEvent).toHaveBeenCalledTimes(1);
    expect(logEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        actor_type: "agent",
        actor_name: "Host agent",
        agent: "host",
        action: "tool.echo",
        summary: 'Host agent echoed "hi"',
        listing_id: listingId,
      }),
    );
  });

  it("keeps tool inputs out of the public feed unless their fields are listed (D-024)", async () => {
    twoStepModel();
    await createAgent({ name: "host", system: "Test agent", tools: { echo } }).generate({
      prompt: "Say hi",
    });
    expect(vi.mocked(logEvent).mock.calls[0][0].payload).toMatchObject({ input: undefined });

    vi.mocked(logEvent).mockClear();
    twoStepModel();
    await createAgent({
      name: "host",
      system: "Test agent",
      tools: { echo },
      logInputs: { echo: ["text", "missing"] },
    }).generate({ prompt: "Say hi" });
    expect(vi.mocked(logEvent).mock.calls[0][0].payload).toMatchObject({ input: { text: "hi" } });
  });

  it("loggableInput keeps only listed own fields of an object input", () => {
    expect(loggableInput({ a: 1, b: 2 }, ["a"])).toEqual({ a: 1 });
    expect(loggableInput({ a: 1 }, [])).toBeUndefined();
    expect(loggableInput("text", ["a"])).toBeUndefined();
    expect(loggableInput(null, ["a"])).toBeUndefined();
    expect(loggableInput({ a: 1 }, ["constructor", "toString"])).toEqual({});
  });

  it("stops on a custom rule and passes effort to Claude", async () => {
    const mock = twoStepModel();
    const agent = createAgent({
      name: "guest",
      system: "Test agent",
      tools: { echo },
      stopWhen: isStepCount(1),
      effort: "low",
    });

    await agent.generate({ prompt: "Say hi" });

    expect(mock.doGenerateCalls).toHaveLength(1);
    expect(mock.doGenerateCalls[0].providerOptions).toMatchObject({ anthropic: { effort: "low" } });
  });

  it("can turn thinking off for fast answers on the bulk model", async () => {
    const mock = twoStepModel();
    await createAgent({
      name: "guest",
      system: "Test agent",
      tools: { echo },
      model: "bulk",
      thinking: "off",
      effort: "low",
    }).generate({ prompt: "Say hi" });
    expect(mock.doGenerateCalls[0].providerOptions).toMatchObject({
      anthropic: { effort: "low", thinking: { type: "disabled" } },
    });
    expect(logEvent).toHaveBeenCalledTimes(1);
  });
});
