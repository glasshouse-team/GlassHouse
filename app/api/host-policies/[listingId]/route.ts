import { getListing } from "@/lib/data/listings";
import { saveHostPolicy } from "@/lib/data/policies";
import { errorResponse, jsonError, parseJson } from "@/lib/http";
import { PolicyFormSchema } from "@/lib/policy-form";
import { getViewer } from "@/lib/viewer";
import { withEvent } from "@/tools/_withEvent";

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

    // The feed line names the change, never the numbers (the feed is public).
    const save = withEvent<Parameters<typeof saveHostPolicy>, void>(
      {
        action: "policy.updated",
        actorName: `${viewer.name} (host)`,
        actorType: "human",
        summarize: () => `${viewer.name} updated the agent rules for ${listing.title}`,
        scope: () => ({ listingId: listing.id }),
      },
      saveHostPolicy,
    );
    await save(listing.id, form);
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
