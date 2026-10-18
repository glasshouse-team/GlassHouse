/**
 * CONTRACT FILE (GH-5 / GH-13, owner: Beka).
 * One factory for every agent. AI SDK v7 docs: node_modules/ai/docs/03-agents.
 *
 * Every tool call is logged to the activity feed automatically. To control the feed
 * line, return `{ summary: "Host agent countered at $495", ...rest }` from the tool.
 * Events are public, so tool inputs are logged only for the fields listed in `logInputs`
 * (D-024): an input could carry a host floor or a guest maximum.
 *
 * Sonnet 5.5 ignores `temperature` and downgrades a forced `toolChoice` to "auto" (the
 * provider logs a warning), so check in code that the expected tool was called and retry.
 */
import {
  isStepCount,
  ToolLoopAgent,
  type OnToolExecutionEndCallback,
  type OutputInterface,
  type StopCondition,
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

export interface CreateAgentOptions<TOOLS extends ToolSet, OUTPUT extends OutputInterface = never> {
  name: AgentName;
  /** System prompt (passed to ToolLoopAgent as `instructions`). Load it with loadPrompt(). */
  system: string;
  tools: TOOLS;
  /** "agent" = Sonnet 5.5 (default), "bulk" = Haiku 5.5. */
  model?: "agent" | "bulk";
  /** Hard cap on steps (default 8). Always applies, also next to `stopWhen`. */
  maxSteps?: number;
  /**
   * Extra stop rule, e.g. stop once a money tool returned `{ ok: true }` (GH-15). The agent
   * stops at whichever comes first: this rule or `maxSteps`.
   */
  stopWhen?: StopCondition<TOOLS> | StopCondition<TOOLS>[];
  /** Structured final answer, e.g. `Output.object({ schema })` (GH-14 shortlist). */
  output?: OUTPUT;
  /** Claude effort: "low" for quick ranking or chat turns, "high" for hard checks. */
  effort?: "low" | "medium" | "high";
  /** Attached to every logged event so feeds can filter by listing or deal. */
  listingId?: string;
  dealId?: string;
  /**
   * Server-only values for tools that declare a `contextSchema` (AI SDK v7 `toolsContext`),
   * keyed by tool name, e.g. `{ make_offer: { policy } }`. Never visible to the model.
   */
  toolsContext?: Record<string, unknown>;
  /**
   * Input fields per tool that may go into the public feed payload, e.g.
   * `{ search_listings: ["city", "guests"] }`. Tools not listed log no input (D-024).
   */
  logInputs?: { [K in keyof TOOLS]?: string[] };
}

/** The AI SDK's default runtime context type (not exported by "ai" itself). */
type AgentContext = NonNullable<ToolLoopAgentSettings["runtimeContext"]>;
type Settings<TOOLS extends ToolSet, OUTPUT extends OutputInterface> = ToolLoopAgentSettings<
  never,
  TOOLS,
  AgentContext,
  OUTPUT
>;

/** Only the listed fields of a tool input, or undefined when none may be logged. */
export function loggableInput(input: unknown, fields: string[] | undefined) {
  if (!fields?.length || !input || typeof input !== "object") return undefined;
  const source = input as Record<string, unknown>;
  return Object.fromEntries(
    fields.filter((f) => Object.hasOwn(source, f)).map((f) => [f, source[f]]),
  );
}

function summaryFrom(output: unknown): string | null {
  if (output && typeof output === "object" && "summary" in output) {
    const summary = (output as { summary: unknown }).summary;
    if (typeof summary === "string" && summary.trim()) return summary;
  }
  return null;
}

export function createAgent<TOOLS extends ToolSet, OUTPUT extends OutputInterface = never>(
  options: CreateAgentOptions<TOOLS, OUTPUT>,
) {
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
      payload: {
        ok,
        ms: toolExecutionMs,
        input: loggableInput(toolCall.input, options.logInputs?.[toolCall.toolName]),
      },
    });
  };

  const extraStops = options.stopWhen
    ? Array.isArray(options.stopWhen)
      ? options.stopWhen
      : [options.stopWhen]
    : [];

  // Cast: TypeScript cannot resolve the toolsContext conditional type for a generic TOOLS.
  const settings = {
    model: options.model === "bulk" ? bulkModel() : agentModel(),
    instructions: options.system,
    tools: options.tools,
    stopWhen: [...extraStops, isStepCount(options.maxSteps ?? 8)],
    onToolExecutionEnd,
    ...(options.output ? { output: options.output } : {}),
    ...(options.effort ? { providerOptions: { anthropic: { effort: options.effort } } } : {}),
    ...(options.toolsContext ? { toolsContext: options.toolsContext } : {}),
  } as unknown as Settings<TOOLS, OUTPUT>;

  return new ToolLoopAgent<never, TOOLS, AgentContext, OUTPUT>(settings);
}
