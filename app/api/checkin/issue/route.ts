import { z } from "zod";
import { checkinProblem, needsIssue } from "@/lib/checkin";
import { getLatestCheckin, getReservation } from "@/lib/data/checkins";
import { logEvent } from "@/lib/events";
import { errorResponse, jsonError, parseJson } from "@/lib/http";
import { getViewer } from "@/lib/viewer";

const BodySchema = z.object({ reservationId: z.uuid() });

/**
 * POST /api/checkin/issue: the guest opens an issue with the host about the high-severity
 * differences in their latest check-in report. It is a feed event for the host (the deposit
 * escrow idea stays on a slide). Owner: Beka (GH-23).
 */
export async function POST(request: Request) {
  try {
    const { reservationId } = await parseJson(request, BodySchema);
    const [viewer, reservation] = await Promise.all([getViewer(), getReservation(reservationId)]);
    const problem = checkinProblem(viewer, reservation);
    if (problem || !reservation)
      return jsonError(
        problem?.status ?? 404,
        problem?.code ?? "not_found",
        problem?.message ?? "",
      );

    const checkin = await getLatestCheckin(reservation.id);
    if (!checkin?.report || !needsIssue(checkin.report))
      return jsonError(409, "nothing_to_report", "The latest check-in has no severe difference.");

    const high = checkin.report.differences.filter((d) => d.severity === "high");
    await logEvent({
      actor_type: "human",
      actor_name: `${viewer.name} (guest)`,
      action: "checkin.issue_opened",
      summary: `${viewer.name} opened an issue with the host: ${high[0].room}, ${high[0].seen}`,
      listing_id: reservation.listing_id,
      payload: {
        checkinId: checkin.id,
        reservationId: reservation.id,
        notify: "host",
        differences: high.map((d) => ({ room: d.room, listed: d.listed, seen: d.seen })),
      },
    });
    return Response.json({ ok: true }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
