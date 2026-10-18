import { z } from "zod";
import { errorResponse, jsonError, parseJson } from "@/lib/http";
import { getViewer } from "@/lib/viewer";
import { approve, decline, DealActionError } from "@/tools/negotiation/actions";

const BodySchema = z.object({ decision: z.enum(["approve", "decline"]) });

/**
 * POST /api/deals/[id]/approve: the host approves or declines a price the agents agreed below
 * auto-accept. Approve books it with the discount line (computeQuote). Owner: Beka (GH-15).
 */
export async function POST(request: Request, ctx: RouteContext<"/api/deals/[id]/approve">) {
  try {
    const { id } = await ctx.params;
    const { decision } = await parseJson(request, BodySchema);
    const viewer = await getViewer();
    if (decision === "approve") {
      const reservationId = await approve(id, viewer);
      return Response.json({ status: "approved", reservationId });
    }
    await decline(id, viewer);
    return Response.json({ status: "declined" });
  } catch (error) {
    if (error instanceof DealActionError) return jsonError(error.status, error.code, error.message);
    return errorResponse(error);
  }
}
