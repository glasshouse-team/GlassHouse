import { getListing } from "@/lib/data/listings";
import { errorResponse, jsonError, parseJson } from "@/lib/http";
import { supabaseAdmin } from "@/lib/supabase";
import { getViewer } from "@/lib/viewer";
import { withEvent } from "@/tools/_withEvent";
import { ApplyDraftSchema, appliedFieldsLabel, type ApplyDraft } from "@/tools/host/draft";

/**
 * POST /api/listing-draft/apply: the host saves chosen fields of the narration draft to the
 * listing (GH-25, Beka). Only the safe fields (title, description, amenities from the shared
 * list); counts, rules and the manual stay a preview. The feed line names the fields only.
 */
export async function POST(request: Request) {
  try {
    const body = await parseJson(request, ApplyDraftSchema);
    const viewer = await getViewer();
    const listing = await getListing(body.listingId);
    if (!listing) return jsonError(404, "not_found", "This home does not exist.");
    if (viewer.role !== "host" || listing.host_id !== viewer.profileId)
      return jsonError(403, "not_your_listing", "Only this home's host can change its listing.");

    const { listingId, ...fields } = body;
    const names = Object.keys(fields).filter((k) => fields[k as keyof typeof fields] !== undefined);
    if (names.length === 0) return jsonError(400, "nothing_to_apply", "Pick a field to apply.");

    const save = withEvent<[ApplyDraft], void>(
      {
        action: "listing.updated",
        actorName: `${viewer.name} (host)`,
        actorType: "human",
        summarize: () =>
          `${viewer.name} updated the ${appliedFieldsLabel(names)} of ${listing.title} from the narration draft`,
        scope: () => ({ listingId }),
        payload: () => ({ fields: names }),
      },
      async () => {
        const { error } = await supabaseAdmin().from("listings").update(fields).eq("id", listingId);
        if (error) throw new Error(`Could not save the listing: ${error.message}`);
      },
    );
    await save(body);
    return Response.json({ ok: true, fields: names });
  } catch (error) {
    return errorResponse(error);
  }
}
