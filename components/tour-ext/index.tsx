"use client";

/**
 * CONTRACT (GH-11 / GH-20 / GH-21, owner: Beka). Add-ons on top of the 3D tour.
 * Temuri's tour page renders <TourExtensions> inside <TourProvider> and outside the
 * <Canvas>, so these components are plain HTML overlays that reach the scene only through
 * useTour() (components/tour/TourContext.tsx). Never edit components/tour/ from here.
 */
import { AskSpacePanel } from "./AskSpacePanel";

export { AskSpacePanel } from "./AskSpacePanel";

export interface TourExtensionsProps {
  listingId: string;
  worldId: string;
}

export function TourExtensions({ listingId, worldId }: TourExtensionsProps) {
  // GH-21 adds <HonestyOverlay /> here.
  return <AskSpacePanel listingId={listingId} worldId={worldId} />;
}
