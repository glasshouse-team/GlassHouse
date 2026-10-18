"use client";

import { HonestyOverlay } from "./HonestyOverlay";

/**
 * CONTRACT (GH-11 / GH-20 / GH-21, owner: Beka). Add-ons on top of the 3D tour.
 * Temuri's tour page renders <TourExtensions> inside <TourProvider> and outside the
 * <Canvas>, so these components are plain HTML overlays that reach the scene only through
 * useTour() (components/tour/TourContext.tsx). Never edit components/tour/ from here.
 */
export interface TourExtensionsProps {
  listingId: string;
  worldId: string;
}

export { HonestyOverlay } from "./HonestyOverlay";

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- props are used once GH-20 fills this in
export function TourExtensions(_props: TourExtensionsProps) {
  // GH-20 adds <AskSpacePanel />. The honesty toggle sits bottom left, above the page.
  return <HonestyOverlay className="fixed bottom-4 left-4 z-20" />;
}
