import { z } from "zod";
import { isDemoMode } from "@/lib/env";
import { logEvent } from "@/lib/events";
import { errorResponse, jsonError, parseJson } from "@/lib/http";
import {
  baseSpots,
  entrySpot,
  savedVersion,
  startVersion,
  versionRows,
} from "@/lib/marble-generation";
import { summarizeVersions } from "@/lib/marble-versions";
import { requireHost, worldErrorResponse } from "./_lib/host";

const StartSchema = z.object({
  listingId: z.uuid(),
  /** One capture per room spot to (re)generate (D-009). */
  captureIds: z.array(z.uuid()).min(1).max(10),
});

/**
 * POST /api/worlds { listingId, captureIds }: starts the next version (owner: Temuri, GH-10).
 * One Marble generation per captured spot, status `generating` with its operation id; the
 * other spots are copied from the version guests see now (D-031). DEMO_MODE returns the
 * saved version and calls nothing.
 */
export async function POST(request: Request) {
  try {
    const body = await parseJson(request, StartSchema);
    const host = await requireHost(body.listingId);
    if (host instanceof Response) return host;

    if (isDemoMode()) {
      const saved = await savedVersion(body.listingId);
      if (!saved) {
        return jsonError(409, "no_saved_world", "Demo mode has no saved 3D version for this home.");
      }
      await logEvent({
        actor_type: host.actor.type,
        actor_name: host.actor.name,
        action: "world.demo",
        summary: `${host.actor.name} asked for a new 3D version of ${host.listing.title}; demo mode shows saved v${saved.version}`,
        listing_id: body.listingId,
        payload: { version: saved.version, demo: true },
      });
      return Response.json({ demo: true, ...saved, failed: [] });
    }

    const started = await startVersion({
      listingId: body.listingId,
      listingTitle: host.listing.title,
      captureIds: body.captureIds,
      actor: host.actor,
    });
    return Response.json({ demo: false, ...started }, { status: 201 });
  } catch (error) {
    return worldErrorResponse(error) ?? errorResponse(error);
  }
}

/**
 * GET /api/worlds?listingId=: the versions panel (host only). Reads our database only;
 * it never calls World Labs (polling is the status route's job).
 */
export async function GET(request: Request) {
  try {
    const listingId = z.uuid().parse(new URL(request.url).searchParams.get("listingId"));
    const host = await requireHost(listingId);
    if (host instanceof Response) return host;
    const [rows, entry, spots] = await Promise.all([
      versionRows(listingId),
      entrySpot(listingId),
      baseSpots(listingId),
    ]);
    return Response.json({
      demo: isDemoMode(),
      entrySpot: entry,
      spots,
      versions: summarizeVersions(rows, entry),
    });
  } catch (error) {
    return worldErrorResponse(error) ?? errorResponse(error);
  }
}
