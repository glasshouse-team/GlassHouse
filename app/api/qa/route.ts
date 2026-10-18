import { z } from "zod";
import { errorResponse, jsonError, parseJson } from "@/lib/http";
import { getViewer } from "@/lib/viewer";
import { askHome } from "@/tools/host-qa/askHome";

/** One host-agent turn takes a few seconds; leave room for a slow model. */
export const maxDuration = 60;

const BodySchema = z.object({
  listingId: z.uuid(),
  question: z.string().trim().min(2).max(500),
  conversationId: z.uuid().optional(),
});

/**
 * POST /api/qa: the host agent answers a guest's question from facts, house rules and the
 * manual, with sources, or forwards it to the host (GH-16, Temuri). Returns the
 * AskHomeResult as JSON (D-031); the thread also updates live through Realtime on `messages`.
 */
export async function POST(request: Request) {
  try {
    const body = await parseJson(request, BodySchema);
    const viewer = await getViewer();
    const result = await askHome({
      ...body,
      askedBy: "guest",
      guestId: viewer.role === "guest" ? viewer.profileId : undefined,
    });
    return Response.json(result);
  } catch (error) {
    if (error instanceof Error && /^Listing .* not found$/.test(error.message))
      return jsonError(404, "not_found", "This home does not exist.");
    return errorResponse(error);
  }
}
