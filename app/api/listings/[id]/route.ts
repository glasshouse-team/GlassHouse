import { deleteHostListing, getHomeDependants, getListingById } from "@/lib/data/listings";
import { logEvent } from "@/lib/events";
import { deleteBlocker } from "@/lib/home-delete";
import { errorResponse, jsonError } from "@/lib/http";
import { getViewer } from "@/lib/viewer";
import { SEED_LISTINGS } from "@/seed/data/listings";

/**
 * DELETE /api/listings/[id]: the host deletes one of their homes (D-044). Refused for the
 * seeded demo homes, while stays are coming up and while deals are live (lib/home-delete.ts).
 * The cascade removes the home's own feed events, so the deletion is logged without a
 * listing id. Owner: Beka.
 */
export async function DELETE(_request: Request, ctx: RouteContext<"/api/listings/[id]">) {
  try {
    const { id } = await ctx.params;
    const viewer = await getViewer();
    if (viewer.role !== "host")
      return jsonError(403, "hosts_only", "Switch to the host view to manage homes.");
    const listing = await getListingById(id);
    if (!listing) return jsonError(404, "not_found", "This home does not exist.");
    if (listing.host_id !== viewer.profileId)
      return jsonError(403, "not_your_listing", "Only this home's host can delete it.");

    const today = new Date().toISOString().slice(0, 10);
    const block = deleteBlocker({
      isSeed: SEED_LISTINGS.some((l) => l.slug === listing.slug),
      ...(await getHomeDependants(listing.id, today)),
    });
    if (block) return jsonError(409, block.code, block.message);

    await deleteHostListing(listing.id);
    await logEvent({
      actor_type: "human",
      actor_name: `${viewer.name} (host)`,
      action: "listing.deleted",
      summary: `${viewer.name} deleted the home ${listing.title}`,
      payload: { listingId: listing.id, slug: listing.slug },
    });
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
