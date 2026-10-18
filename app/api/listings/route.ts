import { createHostListing } from "@/lib/data/listings";
import { logEvent } from "@/lib/events";
import { errorResponse, jsonError, parseJson } from "@/lib/http";
import { NewHomeSchema } from "@/lib/new-home";
import { formatCents } from "@/lib/utils";
import { getViewer } from "@/lib/viewer";

/**
 * POST /api/listings: a host lists a new home (D-043). The home is published at once with
 * the default agent rules; the dialog then sends the host to the capture page to film it.
 * Owner: Beka.
 */
export async function POST(request: Request) {
  try {
    const viewer = await getViewer();
    if (viewer.role !== "host")
      return jsonError(403, "hosts_only", "Switch to the host view to list a home.");
    const home = await parseJson(request, NewHomeSchema);

    const listing = await createHostListing(viewer.profileId, home);
    await logEvent({
      actor_type: "human",
      actor_name: `${viewer.name} (host)`,
      action: "listing.created",
      listing_id: listing.id,
      summary: `${viewer.name} listed a new home: ${home.title} in ${home.city}, ${formatCents(home.base_price_cents)} a night`,
      payload: { slug: listing.slug },
    });
    return Response.json(listing, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
