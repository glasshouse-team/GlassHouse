/**
 * GH-16 (owner: Temuri). Runs the host agent on one question: answer from sources, decline
 * (prices, private settings) or forward to the host. No database writes; askHome saves.
 */
import type { StopCondition } from "ai";
import { createAgent } from "@/agents/core";
import type { HostContext } from "@/agents/context";
import { asData } from "@/agents/data";
import { loadPrompt } from "@/agents/load-prompt";
import { manualLines, type CheckedSource, type QaSources } from "./sources";
import { qaTools, qaToolsContext, type Asker, type QaTools } from "./tools";

/** X-ray facts below this confidence are not used as sources (same bar as the X-ray chips). */
const MIN_CONFIDENCE = 0.5;

export type QaOutcome =
  | { kind: "answered"; answer: string; sources: CheckedSource[] }
  | { kind: "declined"; answer: string }
  /** `fallback`: the agent made no usable tool call, so code forwarded the question. */
  | { kind: "forwarded"; fallback: boolean };

/** The data the agent may answer from: facts, house rules, manual. No policy, no prices. */
export function qaSources(context: HostContext): QaSources {
  return {
    facts: (context.facts?.facts ?? [])
      .filter((f) => f.confidence >= MIN_CONFIDENCE)
      .map(({ key, value, confidence }) => ({ key, value, confidence })),
    rules: { ...context.listing.house_rules },
    manual: manualLines(context.houseManual),
  };
}

/** The user message: sources and question as JSON data blocks, never instructions. */
export function qaUserMessage(sources: QaSources, question: string, asker: Asker): string {
  return [
    asData("listing_sources", {
      facts: sources.facts,
      house_rules: sources.rules,
      house_manual: sources.manual,
    }),
    asData("question", { asked_by: asker, text: question }),
    "Answer the question with answer_question, or call decline_question or forward_to_host.",
  ].join("\n\n");
}

interface ToolResultLike {
  toolName: string;
  output: unknown;
}

function isDone(result: ToolResultLike): boolean {
  const out = result.output as { ok?: boolean } | undefined;
  return out?.ok === true;
}

/** Stops as soon as one tool succeeded: an answer passed the source check, a decline or a forward. */
const doneTool: StopCondition<QaTools> = ({ steps }) =>
  (steps.at(-1)?.toolResults ?? []).some((r) => isDone(r as ToolResultLike));

/** Reads the outcome from the tool results: the last successful tool wins. */
export function outcomeFrom(results: ToolResultLike[]): QaOutcome {
  for (const result of [...results].reverse()) {
    if (!isDone(result)) continue;
    const out = result.output as Record<string, unknown>;
    if (result.toolName === "answer_question")
      return {
        kind: "answered",
        answer: String(out.answer),
        sources: out.sources as CheckedSource[],
      };
    if (result.toolName === "decline_question")
      return { kind: "declined", answer: String(out.answer) };
    if (result.toolName === "forward_to_host") return { kind: "forwarded", fallback: false };
  }
  return { kind: "forwarded", fallback: true };
}

export interface RunQaOptions {
  asker: Asker;
  hostName: string;
  dealId?: string;
}

export async function runHostQa(
  context: HostContext,
  question: string,
  options: RunQaOptions,
): Promise<QaOutcome> {
  const sources = qaSources(context);
  const agent = createAgent({
    name: "host",
    system: loadPrompt("host-qa", { listing_title: context.listing.title }),
    tools: qaTools,
    effort: "low",
    maxSteps: 4,
    stopWhen: doneTool,
    listingId: context.listing.id,
    dealId: options.dealId,
    toolsContext: qaToolsContext(sources, options.asker, options.hostName),
  });
  const result = await agent.generate({
    prompt: qaUserMessage(sources, question, options.asker),
  });
  return outcomeFrom(result.steps.flatMap((step) => step.toolResults as ToolResultLike[]));
}
