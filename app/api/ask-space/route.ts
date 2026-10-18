import {
  createAgentUIStreamResponse,
  createUIMessageStream,
  createUIMessageStreamResponse,
} from "ai";
import { createAgent } from "@/agents/core";
import { asData } from "@/agents/data";
import { loadPrompt } from "@/agents/load-prompt";
import { loadSpace } from "@/lib/data/space";
import { logEvent } from "@/lib/events";
import { errorResponse, jsonError, parseJson } from "@/lib/http";
import { getViewer } from "@/lib/viewer";
import { SPACE_LOG_INPUTS, spaceCard, spaceTools } from "@/tools/guest/space";
import { agentMessages, AskSpaceBodySchema, lastQuestion, NOT_READY_MESSAGE } from "./chat";

export const maxDuration = 60;

/** A one-message answer in the same UI stream format, without calling a model. */
function textReply(text: string): Response {
  const stream = createUIMessageStream({
    execute: ({ writer }) => {
      writer.write({ type: "start" });
      writer.write({ type: "text-start", id: "reply" });
      writer.write({ type: "text-delta", id: "reply", delta: text });
      writer.write({ type: "text-end", id: "reply" });
      writer.write({ type: "finish" });
    },
  });
  return createUIMessageStreamResponse({ stream });
}

/**
 * POST /api/ask-space: Ask the space (GH-20, Beka). The guest agent answers a question asked
 * inside the 3D tour and returns camera actions (fly_to, look_toward, highlight_room, show_fact)
 * that the panel runs through useTour(). Streams AI SDK UI messages for useChat.
 * Context: the X-ray facts, the anchors of every spot of the viewed version and its AI-filled
 * gaps. Code checks every anchor, room and fact the agent uses and adds the honesty note.
 */
export async function POST(request: Request) {
  try {
    const body = await parseJson(request, AskSpaceBodySchema);
    const question = lastQuestion(body.messages);
    if (!question) return jsonError(400, "invalid_input", "Ask a question about this home.");

    const lookup = await loadSpace(body);
    if (lookup.status === "no_listing")
      return jsonError(404, "not_found", "This home isn't on Glasshouse.");
    if (lookup.status === "no_3d") return textReply(NOT_READY_MESSAGE);
    const { space } = lookup;

    const viewer = await getViewer();
    await logEvent({
      actor_type: "human",
      actor_name: viewer.name,
      action: "space.asked",
      // The question stays out of the public feed: a guest may type a budget into it.
      summary: `${viewer.name} asked the guest agent about the 3D tour`,
      listing_id: space.listingId,
      payload: { version: space.version },
    });

    const agent = createAgent({
      name: "guest",
      system: loadPrompt("guest-space", {
        guest_name: viewer.name,
        listing_title: space.listingTitle,
      }),
      tools: spaceTools(space, viewer.name),
      listingId: space.listingId,
      effort: "low",
      maxSteps: 4,
      logInputs: SPACE_LOG_INPUTS,
    });

    const prompt = [asData("home", spaceCard(space)), asData("guest question", question)].join(
      "\n\n",
    );
    return await createAgentUIStreamResponse({
      agent,
      uiMessages: agentMessages(body.messages, prompt),
      abortSignal: request.signal,
      sendReasoning: false,
      onError: (error) => {
        console.error("[ask-space]", error);
        return "The guest agent couldn't answer that. Try again in a moment.";
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
