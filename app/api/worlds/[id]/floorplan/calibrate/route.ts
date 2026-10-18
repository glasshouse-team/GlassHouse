import { z } from "zod";
import { getListing } from "@/lib/data/listings";
import { CalibrationAxis, computeCalibration } from "@/lib/geometry/calibrate";
import { loadVersionPlans, saveCalibration } from "@/lib/geometry/store-floorplans";
import { formatArea } from "@/lib/geometry/svg";
import { errorResponse, jsonError, parseJson } from "@/lib/http";
import { supabaseAdmin } from "@/lib/supabase";
import { getViewer } from "@/lib/viewer";
import { withEvent } from "@/tools/_withEvent";

const Body = z
  .object({
    room: z.string().trim().min(1).max(80),
    axis: CalibrationAxis.default("width"),
    meters: z.number().positive().max(50),
  })
  .strict();

const REFUSAL_STATUS = { unknown_room: 404, no_outline: 409, out_of_range: 422 } as const;

/**
 * POST /api/worlds/[id]/floorplan/calibrate (GH-18 v2): the host enters one real measurement of
 * one room, `{ room, axis?: "width" | "length", meters }` ("Bedroom is 3.2 m wide"). Scale =
 * meters / the room's width (or length) on the plan; it applies to every room of this world's
 * version (one metric frame, D-009/D-040): areas, total, scale bar and SVGs are redone and the
 * measurement is stored with who and when. Plan geometry stays in the 3D's meters. Only the
 * listing's host may calibrate. One feed event. No World Labs or model calls.
 */
export async function POST(
  request: Request,
  ctx: RouteContext<"/api/worlds/[id]/floorplan/calibrate">,
) {
  try {
    const id = z.uuid().parse((await ctx.params).id);
    const body = await parseJson(request, Body);
    const { data: world, error } = await supabaseAdmin()
      .from("worlds")
      .select("listing_id, version")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!world) return jsonError(404, "not_found", "No world with this id.");
    const [viewer, listing] = await Promise.all([getViewer(), getListing(world.listing_id)]);
    if (!listing) return jsonError(404, "not_found", "This home does not exist.");
    if (viewer.role !== "host" || listing.host_id !== viewer.profileId)
      return jsonError(
        403,
        "not_your_listing",
        "Only this home's host can calibrate its floor plan.",
      );

    const version = await loadVersionPlans(world.listing_id, world.version);
    const target = version.plans.find((p) => p.worldId === id) ?? version.plans[0];
    if (!target)
      return jsonError(409, "no_floor_plan", "Build the floor plan of this version first.");
    const result = computeCalibration(target.rooms, {
      room: body.room,
      axis: body.axis,
      meters: body.meters,
      by: viewer.name,
      at: new Date().toISOString(),
    });
    if (!result.ok) return jsonError(REFUSAL_STATUS[result.code], result.code, result.message);

    const save = withEvent<
      [typeof result.calibration],
      Awaited<ReturnType<typeof saveCalibration>>
    >(
      {
        action: "floorplan.calibrated",
        actorName: viewer.name,
        actorType: "human",
        scope: () => ({ listingId: listing.id }),
        summarize: (saved) =>
          `${viewer.name} calibrated the floor plan from the ${saved.calibration.room} ${saved.calibration.axis} (${saved.calibration.meters} m)` +
          (saved.totalArea !== null ? `: ${formatArea(saved.totalArea)} in total` : ""),
        payload: (saved) => ({
          worldId: id,
          version: world.version,
          room: saved.calibration.room,
          axis: saved.calibration.axis,
          meters: saved.calibration.meters,
          measured_m: saved.calibration.measured_m,
          scale: saved.calibration.scale,
          total_area_m2: saved.totalArea,
          plans: saved.plans,
        }),
      },
      (calibration) => saveCalibration(version, calibration),
    );
    const saved = await save(result.calibration);
    return Response.json({
      version: world.version,
      calibration: saved.calibration,
      rooms: saved.areas,
      total_area_m2: saved.totalArea,
      plans: saved.plans,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
