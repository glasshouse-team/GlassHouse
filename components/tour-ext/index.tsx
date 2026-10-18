"use client";

/**
 * CONTRACT (GH-11 / GH-20 / GH-21, owner: Beka). Add-ons on top of the 3D tour.
 * Temuri's tour page renders <TourExtensions> inside <TourProvider> and outside the
 * <Canvas>, so these components are plain HTML overlays that reach the scene only through
 * useTour() (components/tour/TourContext.tsx). Never edit components/tour/ from here.
 */
import { AskSpacePanel } from "./AskSpacePanel";
import { HonestyOverlay } from "./HonestyOverlay";

export { AskSpacePanel } from "./AskSpacePanel";
export { HonestyOverlay } from "./HonestyOverlay";

export interface TourExtensionsProps {
  listingId: string;
  worldId: string;
}

export function TourExtensions({ listingId, worldId }: TourExtensionsProps) {
  // The honesty toggle sits bottom left; the Ask the space panel sits bottom right. On phones
  // the toggle sits above the Ask button, so the open legend never runs under it.
  return (
    <>
      <HonestyOverlay className="fixed bottom-20 left-4 z-20 sm:bottom-4" />
      <AskSpacePanel listingId={listingId} worldId={worldId} />
    </>
  );
}
