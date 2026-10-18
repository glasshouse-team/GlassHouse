import { after } from "next/server";
import { getDeal } from "@/lib/data/deals";
import { errorResponse, jsonError } from "@/lib/http";
import { isRunning, runOnce } from "@/tools/negotiation/lock";

export const maxDuration = 300;

/**
 * POST /api/deals/[id]/run: (re)starts the agents' turns on an open deal. Returns 202 at once;
 * the turns run after the response and stream to the deal room through Realtime. Owner: Beka.
 */
export async function POST(_request: Request, ctx: RouteContext<"/api/deals/[id]/run">) {
  try {
    const { id } = await ctx.params;
    const deal = await getDeal(id);
    if (!deal) return jsonError(404, "not_found", "This deal does not exist.");
    if (deal.status !== "open")
      return jsonError(409, "not_open", "This negotiation has already ended.");
    if (isRunning(id)) return jsonError(409, "running", "The agents are already negotiating.");
    after(() => runOnce(id));
    return Response.json({ started: true }, { status: 202 });
  } catch (error) {
    return errorResponse(error);
  }
}
