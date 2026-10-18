"use client";

/**
 * HTML around the 3D view (GH-11): back link, room badge, Jump to room, HQ toggle, loading
 * and fade screens, errors, and the floor-plan minimap (top right). The bottom corners stay
 * free for Beka's tour-ext: honesty toggle bottom left, Ask the space bottom right.
 */
import { ArrowLeft, ImageOff, Sparkles, Video } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useTour } from "./TourContext";
import { TourMinimap } from "./TourMinimap";
import type { TourPlans } from "./minimap";
import { FADE_MS, useTourInternal } from "./TourProvider";
import { roomBadge, spotLabel } from "./spots";

function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)");
    const update = () => setCoarse(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return coarse;
}

const PANEL = "pointer-events-auto rounded-xl bg-black/55 text-white shadow-lg backdrop-blur";

export function TourOverlay({
  title,
  preview,
  version,
  plans,
}: {
  title: string;
  preview: boolean;
  version: number;
  /** Floor plans of the tour's worlds (GH-18); the minimap shows when the current one has one. */
  plans?: TourPlans;
}) {
  const { listingId, current, hq, setHq, anchorMode } = useTourInternal();
  const { gaps } = useTour();
  const coarse = useCoarsePointer();
  const badge = roomBadge(gaps);

  return (
    <div className="pointer-events-none absolute inset-0 z-30 flex flex-col">
      <div className="flex items-start gap-2 p-3 sm:p-4">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex min-w-0 items-start gap-2">
            <Link
              href={`/listing/${listingId}`}
              className={cn(
                PANEL,
                "inline-flex size-11 shrink-0 items-center justify-center hover:bg-black/75",
              )}
              aria-label="Back to the listing"
            >
              <ArrowLeft className="size-5" aria-hidden />
            </Link>
            <div className={cn(PANEL, "min-w-0 flex-1 px-3 py-2 sm:flex-none")}>
              <p className="truncate text-xs text-white/70">{title}</p>
              <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                {spotLabel(current)}
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
                    badge === "real"
                      ? "bg-emerald-500/25 text-emerald-100"
                      : "bg-honesty text-neutral-950",
                  )}
                >
                  {badge === "real" ? (
                    <>
                      <Video className="size-3" aria-hidden /> Built from real footage
                    </>
                  ) : (
                    <>
                      <Sparkles className="size-3" aria-hidden /> Partly AI-filled
                    </>
                  )}
                </span>
              </p>
            </div>
          </div>
          {preview && (
            <p className="pointer-events-auto w-fit rounded-lg bg-honesty px-3 py-1 text-xs font-medium text-neutral-950">
              Preview of version {version}: guests do not see it until it is published.
            </p>
          )}
          <RoomList />
        </div>
        {/* Top right: HQ toggle and the floor-plan minimap. The bottom corners are tour-ext's. */}
        <div className="flex shrink-0 items-start gap-2">
          {!coarse && current.spz_hq_url && (
            <button
              type="button"
              aria-pressed={hq}
              onClick={() => setHq(!hq)}
              className={cn(
                PANEL,
                "hidden h-11 px-3 text-sm font-medium sm:block",
                hq && "bg-white text-neutral-900",
              )}
              title="High-quality splat (bigger download)"
            >
              HQ
            </button>
          )}
          {plans && !anchorMode && <TourMinimap plans={plans} />}
        </div>
      </div>
      <div className="flex-1" />
      <Hint coarse={coarse} />
      <FadeAndLoading />
      <SpotError />
    </div>
  );
}

/** Jump to room: every spot of the version, same fade as the arrows. */
function RoomList() {
  const { worlds, current, goToSpot, highlightedRoom } = useTourInternal();
  return (
    <nav aria-label="Jump to room" className="min-w-0">
      <ul className="pointer-events-auto flex w-fit max-w-full gap-1.5 overflow-x-auto rounded-xl bg-black/40 p-1.5 backdrop-blur [scrollbar-width:none]">
        {worlds.map((w) => {
          const active = w.id === current.id;
          return (
            <li key={w.id}>
              <button
                type="button"
                aria-current={active ? "true" : undefined}
                onClick={() => void goToSpot(w.spot)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-sm whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none",
                  active
                    ? "bg-white font-semibold text-neutral-900"
                    : "text-white hover:bg-white/15",
                  highlightedRoom === w.spot && !active && "ring-2 ring-honesty",
                )}
              >
                {spotLabel(w)}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function Hint({ coarse }: { coarse: boolean }) {
  const { ready } = useTour();
  const [shown, setShown] = useState(true);
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => setShown(false), 6000);
    return () => clearTimeout(t);
  }, [ready]);
  if (!ready) return null;
  // Clear of tour-ext's bottom corners (honesty toggle bottom-left: bottom-20 below sm, bottom-4
  // from sm; Ask the space bottom-right: bottom-4): 160 px up on phones, 80 px on tablets where
  // the centred pill is still wide enough to reach a corner, 24 px from lg.
  return (
    <p
      className={cn(
        "mx-auto mb-40 max-w-[calc(100%-2rem)] rounded-full bg-black/55 px-4 py-1.5 text-center text-xs text-white backdrop-blur transition-opacity duration-700 sm:mb-20 lg:mb-6",
        shown ? "opacity-100" : "opacity-0",
      )}
    >
      {coarse
        ? "Drag to look around, pinch to zoom, tap an arrow to change room"
        : "Drag to look around, scroll to zoom, click an arrow to change room"}
    </p>
  );
}

/** First load: the room's thumbnail with a progress bar. Switching rooms: a black fade. */
function FadeAndLoading() {
  const { current, ready, fading, progress, error } = useTourInternal();
  const [everReady, setEverReady] = useState(false);
  if (ready && !everReady) setEverReady(true); // adjust during render, not in an effect
  const covering = (fading || !ready) && !error;
  const pct = Math.round(progress * 100);
  return (
    <div
      aria-hidden={!covering}
      className={cn(
        "absolute inset-0 -z-10 flex items-center justify-center bg-black transition-opacity",
        covering ? "opacity-100" : "pointer-events-none opacity-0",
      )}
      style={{ transitionDuration: `${FADE_MS}ms` }}
    >
      {!everReady && current.thumbnail_url && (
        // eslint-disable-next-line @next/next/no-img-element -- full-bleed backdrop from our storage
        <img
          src={current.thumbnail_url}
          alt=""
          className="absolute inset-0 size-full object-cover opacity-50 blur-sm"
        />
      )}
      {!ready && (
        <div
          className="relative w-56 space-y-2 text-center text-white"
          role="status"
          aria-live="polite"
        >
          <p className="text-sm font-medium">Loading {spotLabel(current)}...</p>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/20">
            <div
              className="h-full rounded-full bg-white transition-[width]"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="text-xs text-white/70">{pct}%</p>
        </div>
      )}
    </div>
  );
}

function SpotError() {
  const { error, current, listingId } = useTourInternal();
  if (!error) return null;
  return (
    <div className="absolute inset-0 -z-10 flex items-center justify-center bg-neutral-950 p-6">
      <div className="pointer-events-auto max-w-sm space-y-3 text-center text-white">
        <ImageOff className="mx-auto size-8 text-white/70" aria-hidden />
        <p className="font-semibold">{spotLabel(current)} did not load in 3D.</p>
        <p className="text-sm text-white/70">{error} Try another room above, or see the photos.</p>
        <Link
          href={`/listing/${listingId}`}
          className="inline-block rounded-lg bg-white px-4 py-2 text-sm font-medium text-neutral-900"
        >
          See the photos
        </Link>
      </div>
    </div>
  );
}
