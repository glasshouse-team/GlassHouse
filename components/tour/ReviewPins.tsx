"use client";

/**
 * Spatial reviews (GH-24): guests' claims pinned where they happened, inside the current
 * spot's world. Green for praise, amber for complaints, grey for plain facts; tap a pin for the claim, the source
 * review and the reviewer's first name. Rendered inside the R3F <Canvas> by SpotWorld, so
 * only the current spot's pins exist. Positions come from review-pins.ts (placePins).
 */
import { Info, MessageSquareQuote, ThumbsDown, ThumbsUp, X, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import type { ClaimSentiment } from "@/lib/schemas/verifier";
import { cn } from "@/lib/utils";
import { FrontHtml } from "./FrontHtml";
import type { PlacedPin } from "./review-pins";
import { useTourInternal } from "./TourProvider";

/** Green for praise, amber for complaints, grey for plain facts. */
const LOOK: Record<ClaimSentiment, { label: string; icon: LucideIcon; pin: string; dot: string }> =
  {
    positive: {
      label: "Praise",
      icon: ThumbsUp,
      pin: "bg-emerald-500 text-white",
      dot: "bg-emerald-500",
    },
    negative: {
      label: "Complaint",
      icon: ThumbsDown,
      pin: "bg-amber-400 text-neutral-950",
      dot: "bg-amber-400",
    },
    neutral: { label: "Note", icon: Info, pin: "bg-slate-600 text-white", dot: "bg-slate-500" },
  };

export function ReviewPins({ worldId }: { worldId: string }) {
  const { reviewPins, showReviews } = useTourInternal();
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!showReviews) return null;
  const pins = reviewPins.filter((p) => p.worldId === worldId);
  return (
    <>
      {pins.map((p) => (
        <Pin
          key={p.pin.id}
          placed={p}
          open={open === p.pin.id}
          onToggle={() => setOpen((cur) => (cur === p.pin.id ? null : p.pin.id))}
        />
      ))}
    </>
  );
}

function Pin({
  placed,
  open,
  onToggle,
}: {
  placed: PlacedPin;
  open: boolean;
  onToggle: () => void;
}) {
  const { pin, position } = placed;
  const look = LOOK[pin.sentiment];
  const Icon = look.icon;
  return (
    <FrontHtml
      position={[position.x, position.y, position.z]}
      zIndexRange={open ? [25, 21] : [20, 10]}
    >
      <div className="relative flex flex-col items-center">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-label={`${look.label} from ${pin.author}: ${pin.claim}`}
          className={cn(
            "flex size-8 items-center justify-center rounded-full border-2 border-white shadow-lg transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none",
            look.pin,
            open && "scale-110",
          )}
        >
          <Icon className="size-4" aria-hidden />
        </button>
        {open && (
          <div
            role="dialog"
            aria-label={`Review by ${pin.author}`}
            className="absolute bottom-10 left-1/2 w-64 -translate-x-1/2 max-w-[70vw] space-y-1.5 rounded-xl bg-white p-3 text-left text-neutral-900 shadow-xl"
          >
            <div className="flex items-start gap-2">
              <span className={cn("mt-1 size-2.5 shrink-0 rounded-full", look.dot)} aria-hidden />
              <p className="flex-1 text-sm leading-snug font-semibold first-letter:uppercase">
                {pin.claim}
              </p>
              <button
                type="button"
                onClick={onToggle}
                className="-m-1 rounded p-1 text-neutral-500 hover:bg-neutral-100"
                aria-label="Close"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </div>
            <p className="flex gap-1.5 text-xs leading-relaxed text-neutral-600">
              <MessageSquareQuote className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <span>&ldquo;{pin.review}&rdquo;</span>
            </p>
            <p className="text-xs font-medium text-neutral-800">{pin.author}, guest review</p>
          </div>
        )}
      </div>
    </FrontHtml>
  );
}
