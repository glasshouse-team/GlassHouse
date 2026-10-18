import { getListing } from "@/lib/data/listings";
import { saveHostPolicy } from "@/lib/data/policies";
import { logEvent } from "@/lib/events";
import { errorResponse, jsonError, parseJson } from "@/lib/http";
import { PolicyFormSchema } from "@/lib/policy-form";
import { getViewer } from "@/lib/viewer";

/**
 * PUT /api/host-policies/[listingId]: the host saves the agent rules form. The browser can't
 * touch `host_policies` (no RLS policy), so it goes through here. The feed line names the
 * change, never the numbers. Owner: Beka (GH-8).
 */
export async function PUT(request: Request, ctx: RouteContext<"/api/host-policies/[listingId]">) {
  try {
    const { listingId } = await ctx.params;
    const form = await parseJson(request, PolicyFormSchema);
    const viewer = await getViewer();
    const listing = await getListing(listingId);
    if (!listing) return jsonError(404, "not_found", "This home does not exist.");
    if (viewer.role !== "host" || listing.host_id !== viewer.profileId)
      return jsonError(
        403,
        "not_your_listing",
        "Only this home's host can change its agent rules.",
      );

    await saveHostPolicy(listing.id, form);
    await logEvent({
      actor_type: "human",
      actor_name: `${viewer.name} (host)`,
      action: "policy.updated",
      listing_id: listing.id,
      summary: `${viewer.name} updated the agent rules for ${listing.title}`,
    });
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
