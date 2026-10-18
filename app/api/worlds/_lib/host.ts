import { getListing } from "@/lib/data/listings";
import { jsonError } from "@/lib/http";
import { WorldRequestError, type EventActor } from "@/lib/marble-worlds";
import { getViewer } from "@/lib/viewer";

/**
 * Only the home's host may start, poll or publish its 3D versions (the role switcher is
 * the login, lib/viewer.ts). Returns the listing and the feed actor, or a JSON refusal.
 */
export async function requireHost(
  listingId: string,
): Promise<{ listing: { id: string; title: string }; actor: EventActor } | Response> {
  const viewer = await getViewer();
  const listing = await getListing(listingId);
  if (!listing) return jsonError(404, "not_found", "This home does not exist.");
  if (viewer.role !== "host" || listing.host_id !== viewer.profileId) {
    return jsonError(403, "not_your_listing", "Only this home's host can manage its 3D versions.");
  }
  return {
    listing: { id: listing.id, title: listing.title },
    actor: { type: "human", name: `${viewer.name} (host)` },
  };
}

/** Maps a WorldRequestError to its JSON refusal; null for any other error. */
export function worldErrorResponse(error: unknown): Response | null {
  return error instanceof WorldRequestError
    ? jsonError(error.status, error.code, error.message)
    : null;
}
