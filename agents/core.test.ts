import { tool } from "ai";
import { MockLanguageModelV4, mockValues } from "ai/test";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

// A fake model: first step calls the `echo` tool, second step answers with text.
const { model } = vi.hoisted(() => ({ model: { current: undefined as unknown } }));
vi.mock("@/lib/claude", () => ({
  agentModel: () => model.current,
  bulkModel: () => model.current,
}));
vi.mock("@/lib/events", () => ({ logEvent: vi.fn(async () => {}) }));

import { logEvent } from "@/lib/events";
import { createAgent } from "./core";

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};

describe("createAgent", () => {
  it("runs tools and logs each call to the activity feed with the tool's summary", async () => {
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
    model.current = new MockLanguageModelV4({ doGenerate: async () => next() });

    const listingId = "11111111-1111-4111-8111-111111111111";
    const agent = createAgent({
      name: "host",
      system: "Test agent",
      listingId,
      tools: {
        echo: tool({
          description: "Echo text back",
          inputSchema: z.object({ text: z.string() }),
          execute: async ({ text }) => ({ summary: `Host agent echoed "${text}"`, text }),
        }),
      },
    });

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
});
