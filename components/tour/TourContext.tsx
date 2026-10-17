"use client";

/**
 * CONTRACT FILE (GH-5, owner: Temuri). The tour extension API.
 * Temuri implements <TourProvider> in GH-11. Beka's add-ons (components/tour-ext/:
 * Ask the space, honesty overlay) use ONLY this hook and never edit components/tour/.
 */
import { createContext, useContext } from "react";
import type { Camera, Object3D, Scene } from "three";
import type { Anchor, Gap, Vec3 } from "@/lib/schemas/world";

export interface TourApi {
  /** True once the splat and collider mesh are loaded. */
  ready: boolean;
  worldId: string | null;
  scene: Scene | null;
  camera: Camera | null;
  anchors: Anchor[];
  gaps: Gap[];
  /** Smoothly moves the camera to an anchor (drei CameraControls.setLookAt with transition). */
  flyTo(anchorId: string): Promise<void>;
  /** Turns the camera toward a point without moving. */
  lookAt(point: Vec3): Promise<void>;
  /** Highlights a room on the minimap and in the scene. null clears it. */
  highlightRoom(name: string | null): void;
  /** Adds an object to the scene. Call the returned function to remove it. */
  addOverlay(object: Object3D): () => void;
}

export const TourContext = createContext<TourApi | null>(null);

export function useTour(): TourApi {
  const api = useContext(TourContext);
  if (!api) {
    throw new Error(
      "useTour() must be used inside <TourProvider> (components/tour, built in GH-11).",
    );
  }
  return api;
}
