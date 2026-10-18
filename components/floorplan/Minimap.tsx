"use client";

/**
 * In-tour minimap (owner: Temuri, GH-18): the current spot world's floor plan with a "you are
 * here" dot and view cone that follow the camera. The tour (GH-11) renders it next to the canvas:
 *
 *   <Minimap plan={plan} svgUrl={plan.svg_url} currentRoom="Kitchen"
 *     getPose={() => (tour.camera ? cameraPose(tour.camera) : null)}
 *     highlight={highlighted} onRoomClick={(room) => jumpToRoom(room)} />
 *
 * `plan` is the floor_plans row of the current spot world (components/floorplan/data.ts), so the
 * camera's x/z land on it directly. Clicking a room calls onRoomClick with its name (the tour
 * switches to that spot and flies to its room anchor).
 */
import { useEffect, useRef, useState } from "react";
import type { PlanShape } from "@/lib/geometry/svg";
import { cn } from "@/lib/utils";
import { poseChanged } from "./camera-pose";
import { FloorPlanView, type PlanPose } from "./FloorPlanView";

export interface MinimapProps {
  plan: PlanShape;
  svgUrl: string | null;
  /** The spot the camera is in. */
  currentRoom: string;
  /** Called every frame; return null while the camera is not ready. */
  getPose: () => PlanPose | null;
  /** highlightRoom(name) from the tour; falls back to the current room. */
  highlight?: string | null;
  onRoomClick?: (room: string) => void;
  className?: string;
}

export function Minimap({
  plan,
  svgUrl,
  currentRoom,
  getPose,
  highlight,
  onRoomClick,
  className,
}: MinimapProps) {
  const [pose, setPose] = useState<PlanPose | null>(null);
  const last = useRef<PlanPose | null>(null);
  const read = useRef(getPose);
  useEffect(() => {
    read.current = getPose;
  }, [getPose]);

  useEffect(() => {
    let frame = 0;
    const tick = () => {
      const next = read.current();
      if (poseChanged(last.current, next)) {
        last.current = next;
        setPose(next);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div className={cn("w-56 rounded-xl bg-white/90 p-1.5 shadow-lg backdrop-blur", className)}>
      <FloorPlanView
        plan={plan}
        svgUrl={svgUrl}
        title={`Floor plan, you are in the ${currentRoom}`}
        highlight={highlight ?? currentRoom}
        onRoomClick={onRoomClick}
        pose={pose}
        className="rounded-lg border-0"
      />
    </div>
  );
}
