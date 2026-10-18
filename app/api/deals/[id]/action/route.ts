import { after } from "next/server";
import { z } from "zod";
import { errorResponse, jsonError, parseJson } from "@/lib/http";
import { getViewer } from "@/lib/viewer";
import { acceptLast, DealActionError, hostCounter, stop } from "@/tools/negotiation/actions";
import { isRunning, runOnce } from "@/tools/negotiation/lock";

export const maxDuration = 300;

const BodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("stop") }),
  z.object({ action: z.literal("accept_last") }),
  z.object({ action: z.literal("counter"), amountCents: z.number().int().positive() }),
]);

/**
 * POST /api/deals/[id]/action: the deal room's buttons. Guest: stop, accept the last offer.
 * Host: counter in person (the guest agent then answers). Owner: Beka (GH-15).
 */
export async function POST(request: Request, ctx: RouteContext<"/api/deals/[id]/action">) {
  try {
    const { id } = await ctx.params;
    const body = await parseJson(request, BodySchema);
    const viewer = await getViewer();
    if (isRunning(id) && body.action !== "stop")
      return jsonError(409, "running", "The agents are mid-turn. Try again in a few seconds.");
    if (body.action === "stop") {
      await stop(id, viewer);
      return Response.json({ status: "declined" });
    }
    if (body.action === "accept_last")
      return Response.json({ status: await acceptLast(id, viewer) });
    await hostCounter(id, viewer, body.amountCents);
    after(() => runOnce(id));
    return Response.json({ status: "open" });
  } catch (error) {
    if (error instanceof DealActionError) return jsonError(error.status, error.code, error.message);
    return errorResponse(error);
  }
}
