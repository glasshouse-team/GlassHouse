import { calibrationLine, planCalibration } from "@/lib/geometry/calibrate";
import { formatArea } from "@/lib/geometry/svg";
import { getListingFloorPlans } from "./data";
import { FloorPlanView } from "./FloorPlanView";

/**
 * Listing page slot (GH-5 contract, GH-18). Keep the name and props. Shows the published
 * version's floor plan, built from the 3D model and loaded from storage, in the frame of the spot
 * where the tour starts (that room is highlighted). Clicking a room opens the tour at that spot.
 * v2: each room's outline and area, the total, and where the scale comes from (the host's one
 * measurement, or approximate). Renders nothing for listings without a plan.
 */
export async function FloorPlanCard({ listingId }: { listingId: string }) {
  const data = await getListingFloorPlans(listingId).catch((error: unknown) => {
    console.error("[FloorPlanCard]", error);
    return null;
  });
  if (!data) return null;
  const start = data.spots.find((s) => data.plans.has(s.worldId));
  if (!start) return null;
  const plan = data.plans.get(start.worldId)!;
  const roomHrefs = Object.fromEntries(
    data.spots.map((s) => [s.name, `/tour/${listingId}?spot=${encodeURIComponent(s.spot)}`]),
  );
  const rooms = plan.rooms.map((r) => r.name);
  const areas = new Map(plan.rooms.map((r) => [r.name, r.area_m2]));
  const calibration = planCalibration(plan.rooms);

  return (
    <section className="space-y-3" aria-labelledby="floor-plan-heading">
      <div>
        <h2 id="floor-plan-heading" className="text-lg font-semibold">
          Floor plan
        </h2>
        <p className="text-sm text-muted-foreground">
          Measured from the 3D model of this home: {rooms.length} rooms. The tour starts in the{" "}
          {start.name}. Click a room to walk into it.
        </p>
      </div>
      <FloorPlanView
        plan={plan}
        svgUrl={plan.svg_url}
        title={`Floor plan with ${rooms.join(", ")}`}
        roomHrefs={roomHrefs}
      />
      <ul className="flex flex-wrap gap-2 text-sm" aria-label="Rooms and floor areas">
        {data.spots.map((s) => {
          const area = areas.get(s.name);
          return (
            <li key={s.spot}>
              <a
                href={roomHrefs[s.name]}
                className="inline-block rounded-full border px-3 py-1 transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                {s.name}
                {area !== undefined && area !== null && (
                  <span className="text-muted-foreground"> · {formatArea(area)}</span>
                )}
              </a>
            </li>
          );
        })}
      </ul>
      {plan.total_area_m2 !== null && (
        <p className="text-sm">
          <span className="font-medium">Total floor area: {formatArea(plan.total_area_m2)}</span>
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        {calibrationLine(calibration)}.{" "}
        {calibration
          ? "Every room is scaled from that one measurement by the host."
          : "Sizes use the 3D scan's own scale until the host enters one real measurement."}{" "}
        Rooms are placed by the doorways between them.
      </p>
    </section>
  );
}
