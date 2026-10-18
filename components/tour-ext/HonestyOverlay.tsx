"use client";

import { Eye, EyeOff } from "lucide-react";
import { useEffect, useState } from "react";
import { useTour } from "@/components/tour/TourContext";
import { cn } from "@/lib/utils";
import { markedGaps, showGapSpheres } from "./honesty";

/**
 * "Show what's real" (GH-21): a toggle that marks the AI-filled areas of the current spot
 * in amber. Spheres go in through useTour().addOverlay and come out when the toggle goes
 * off, the spot changes (gaps belong to the current spot's world, D-009) or the tour
 * unmounts. Toggling is not logged (GH-21: too noisy). Rendered inside <TourExtensions>.
 */
export function HonestyOverlay({ className }: { className?: string }) {
  const { ready, worldId, gaps, addOverlay } = useTour();
  const [on, setOn] = useState(false);
  const count = markedGaps(gaps).length;

  useEffect(() => {
    if (!on || !ready) return;
    return showGapSpheres(gaps, addOverlay);
    // worldId: a new spot means new gaps and a new scene, even if the arrays look alike.
  }, [on, ready, worldId, gaps, addOverlay]);

  return (
    <div
      className={cn(
        "pointer-events-auto w-fit max-w-[calc(100vw-2rem)] space-y-1.5 rounded-xl bg-background/90 p-2 text-sm shadow-md backdrop-blur",
        className,
      )}
    >
      <button
        type="button"
        aria-pressed={on}
        onClick={() => setOn((v) => !v)}
        className={cn(
          "inline-flex items-center gap-2 rounded-lg px-3 py-1.5 font-medium transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
          on ? "bg-honesty text-neutral-950" : "bg-muted hover:bg-accent",
        )}
      >
        {on ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
        Show what&apos;s real
      </button>
      {on && (
        <p
          className="flex items-center gap-2 px-1 text-xs text-muted-foreground"
          aria-live="polite"
        >
          <span
            className="inline-block size-3 shrink-0 rounded-full bg-honesty/60 ring-1 ring-honesty"
            aria-hidden
          />
          <span>
            Amber = AI-filled, not filmed by the host.{" "}
            {!ready
              ? "Loading this room..."
              : count === 0
                ? "No AI-filled areas found in this room."
                : `${count} ${count === 1 ? "area" : "areas"} in this room.`}
          </span>
        </p>
      )}
    </div>
  );
}
