"use client";

/**
 * The GH-18 floor-plan minimap inside the tour (GH-11), top right: the current spot world's plan
 * with the "you are here" dot and view cone. Tapping a room switches to that spot with the same
 * fade and arrival as a doorway arrow. Open by default from `sm` up; on phones it starts as a
 * 44 px button. Bottom left (honesty toggle) and bottom right (Ask the space) stay Beka's.
 */
import { Map as MapIcon, X } from "lucide-react";
import { useCallback, useState } from "react";
import { cameraPose } from "@/components/floorplan/camera-pose";
import { Minimap } from "@/components/floorplan/Minimap";
import { useTour } from "./TourContext";
import { useTourInternal } from "./TourProvider";
import { highlightedPlanRoom, roomSpot, spotRoom, type TourPlans } from "./minimap";
import { spotLabel } from "./spots";

const BUTTON =
  "pointer-events-auto inline-flex size-11 shrink-0 items-center justify-center rounded-xl bg-black/55 text-white shadow-lg backdrop-blur hover:bg-black/75 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none";

function startsOpen(): boolean {
  try {
    return window.matchMedia("(min-width: 640px)").matches;
  } catch {
    return false;
  }
}

export function TourMinimap({ plans }: { plans: TourPlans }) {
  const { worlds, current, goToSpot, highlightedRoom } = useTourInternal();
  const { camera, ready } = useTour();
  const [open, setOpen] = useState(startsOpen);
  const plan = plans[current.id];

  const getPose = useCallback(() => (ready && camera ? cameraPose(camera) : null), [ready, camera]);
  const onRoomClick = useCallback(
    (room: string) => {
      const spot = roomSpot(room, worlds);
      if (spot) void goToSpot(spot);
    },
    [worlds, goToSpot],
  );

  if (!plan) return null;
  const here = spotRoom(current, plan.rooms) ?? spotLabel(current);
  const highlight = highlightedPlanRoom(highlightedRoom, current, worlds, plan.rooms);

  return (
    <div className="relative flex flex-col items-end gap-2">
      <button
        type="button"
        className={BUTTON}
        aria-expanded={open}
        aria-controls="tour-minimap"
        aria-label={open ? "Hide the floor plan" : "Show the floor plan"}
        title={open ? "Hide the floor plan" : "Floor plan"}
        onClick={() => setOpen(!open)}
      >
        {open ? <X className="size-5" aria-hidden /> : <MapIcon className="size-5" aria-hidden />}
      </button>
      {open && (
        <div id="tour-minimap" className="contents">
          <Minimap
            plan={plan}
            svgUrl={plan.svg_url}
            currentRoom={here}
            getPose={getPose}
            highlight={highlight}
            onRoomClick={onRoomClick}
            className="pointer-events-auto absolute top-full right-0 mt-2 w-64 sm:static sm:mt-0 sm:w-56 [@media(max-height:760px)]:w-44"
          />
        </div>
      )}
    </div>
  );
}
