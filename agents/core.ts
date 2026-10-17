/**
 * CONTRACT FILE (GH-5 / GH-13, owner: Beka).
 * One factory for every agent. AI SDK v7 docs: node_modules/ai/docs/03-agents.
 *
 * Every tool call is logged to the activity feed automatically. To control the feed
 * line, return `{ summary: "Host agent countered at $495", ...rest }` from the tool.
 */
import {
  isStepCount,
  ToolLoopAgent,
  type OnToolExecutionEndCallback,
  type ToolLoopAgentSettings,
  type ToolSet,
} from "ai";
import { agentModel, bulkModel } from "@/lib/claude";
import { logEvent } from "@/lib/events";
import type { AgentName } from "@/lib/schemas/core";

export const AGENT_DISPLAY_NAME: Record<AgentName, string> = {
  guest: "Guest agent",
  host: "Host agent",
  verifier: "Verifier",
};

export interface CreateAgentOptions<TOOLS extends ToolSet> {
  name: AgentName;
  /** System prompt (passed to ToolLoopAgent as `instructions`). Load it with loadPrompt(). */
  system: string;
  tools: TOOLS;
  /** "agent" = Sonnet 5.5 (default), "bulk" = Haiku 5.5. */
  model?: "agent" | "bulk";
  /** Stop after this many steps (default 8). */
  maxSteps?: number;
  /** Attached to every logged event so feeds can filter by listing or deal. */
  listingId?: string;
  dealId?: string;
  /**
   * Server-only values for tools that declare a `contextSchema` (AI SDK v7 `toolsContext`),
   * e.g. the host policy for make_offer. Never visible to the model.
   */
  toolsContext?: Record<string, unknown>;
}

type Settings<TOOLS extends ToolSet> = ToolLoopAgentSettings<never, TOOLS>;

function summaryFrom(output: unknown): string | null {
  if (output && typeof output === "object" && "summary" in output) {
    const summary = (output as { summary: unknown }).summary;
    if (typeof summary === "string" && summary.trim()) return summary;
  }
  return null;
}

export function createAgent<TOOLS extends ToolSet>(options: CreateAgentOptions<TOOLS>) {
  const display = AGENT_DISPLAY_NAME[options.name];

  const onToolExecutionEnd: OnToolExecutionEndCallback<ToolSet> = async ({
    toolCall,
    toolOutput,
    toolExecutionMs,
  }) => {
    const ok = toolOutput.type === "tool-result";
    const summary = ok
      ? (summaryFrom(toolOutput.output) ?? `${display} used ${toolCall.toolName}`)
      : `${display}: ${toolCall.toolName} was refused or failed`;
    await logEvent({
      actor_type: "agent",
      actor_name: display,
      agent: options.name,
      action: `tool.${toolCall.toolName}`,
      summary,
      listing_id: options.listingId,
      deal_id: options.dealId,
      payload: { input: toolCall.input, ok, ms: toolExecutionMs },
    });
  };

  // Cast: TypeScript cannot resolve the toolsContext conditional type for a generic TOOLS.
  const settings = {
    model: options.model === "bulk" ? bulkModel() : agentModel(),
    instructions: options.system,
    tools: options.tools,
    stopWhen: isStepCount(options.maxSteps ?? 8),
    onToolExecutionEnd,
    ...(options.toolsContext ? { toolsContext: options.toolsContext } : {}),
  } as unknown as Settings<TOOLS>;

  return new ToolLoopAgent<never, TOOLS>(settings);
}
