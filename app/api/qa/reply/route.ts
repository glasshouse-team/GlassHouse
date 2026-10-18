import { errorResponse, jsonError, parseJson } from "@/lib/http";
import { getViewer } from "@/lib/viewer";
import { hostReply, HostReplyInputSchema, QaReplyError } from "@/tools/host-qa/reply";

/**
 * POST /api/qa/reply { messageId, answer, saveToManual }: the host answers a forwarded
 * question (GH-16, Temuri). Only the listing's host may reply; with `saveToManual` the Q&A
 * joins the house manual so the host agent can answer it next time.
 */
export async function POST(request: Request) {
  try {
    const body = await parseJson(request, HostReplyInputSchema);
    const viewer = await getViewer();
    if (viewer.role !== "host")
      return jsonError(403, "not_host", "Switch to the host view to reply.");
    return Response.json(await hostReply(body, viewer.profileId));
  } catch (error) {
    if (error instanceof QaReplyError) return jsonError(error.status, "qa_reply", error.message);
    return errorResponse(error);
  }
}
