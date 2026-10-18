"use client";

/**
 * <TourProvider> (GH-11): implements the useTour() contract (TourContext.tsx) for the
 * per-spot tour (D-009). It sits outside the R3F <Canvas>; the viewer's bridge hands it the
 * scene, camera and controls. `worldId`, `anchors` and `gaps` are the CURRENT spot's;
 * `flyTo` takes any anchor of the version: it switches spot first (fade), then turns.
 * Viewer pieces in components/tour/ use the internal context (useTourInternal) as well.
 */
import type { CameraControlsImpl } from "@react-three/drei";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Vector3, type Camera, type Object3D, type Scene } from "three";
import type { Anchor, Gap, Vec3, World } from "@/lib/schemas/world";
import { placePins, type PlacedPin, type ReviewPin } from "./review-pins";
import { TourContext, type TourApi } from "./TourContext";
import {
  ARRIVAL_PITCH,
  anchorView,
  arrivalAzimuth,
  lookDirection,
  spotEye,
  spotLabel,
} from "./spots";

/** Camera-to-target distance of the look-around controls: tiny, so the eye stays put. */
export const LOOK_DISTANCE = 0.05;
export const FADE_MS = 300;
/** A spot that has not loaded by then resolves its waiters anyway (flyTo never hangs). */
const READY_TIMEOUT_MS = 30_000;

export type View = { kind: "azimuth"; azimuth: number } | { kind: "anchor"; anchor: Anchor };

interface Three {
  scene: Scene;
  camera: Camera;
  controls: CameraControlsImpl;
}

export interface TourInternal {
  listingId: string;
  worlds: World[];
  current: World;
  ready: boolean;
  fading: boolean;
  progress: number;
  error: string | null;
  hq: boolean;
  setHq(hq: boolean): void;
  highlightedRoom: string | null;
  /** Every anchor of the version (anchor mode lists and edits them). */
  allAnchors: Anchor[];
  setAllAnchors(update: (anchors: Anchor[]) => Anchor[]): void;
  anchorMode: boolean;
  goToSpot(spot: string): Promise<void>;
  registerThree(three: Three | null): void;
  /** Called by the viewer once the current spot's splat and collider are in the scene. */
  spotLoaded(worldId: string): void;
  spotFailed(worldId: string, message: string): void;
  setProgress(fraction: number): void;
  /** Review claims placed at the version's anchors (GH-24); filter by worldId per spot. */
  reviewPins: PlacedPin[];
  showReviews: boolean;
  setShowReviews(show: boolean): void;
}

const InternalContext = createContext<TourInternal | null>(null);

export function useTourInternal(): TourInternal {
  const value = useContext(InternalContext);
  if (!value) throw new Error("useTourInternal() must be used inside <TourProvider>.");
  return value;
}

export interface TourProviderProps {
  listingId: string;
  worlds: World[];
  entrySpot: string;
  anchors: Anchor[];
  gaps: Gap[];
  startAnchorId?: string | null;
  anchorMode?: boolean;
  /** The listing's review claims (components/tour/data.ts loadReviewPins). */
  reviewPins?: ReviewPin[];
  children: ReactNode;
}

const NO_PINS: ReviewPin[] = [];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function ofWorld<T extends { world_id: string }>(rows: T[], worldId: string): T[] {
  return rows.filter((r) => r.world_id === worldId);
}

function matchesRoom(world: World, name: string): boolean {
  const n = name.trim().toLowerCase();
  return world.spot.toLowerCase() === n || spotLabel(world).toLowerCase() === n;
}

export function TourProvider({
  listingId,
  worlds,
  entrySpot,
  anchors: initialAnchors,
  gaps: allGaps,
  startAnchorId = null,
  anchorMode = false,
  reviewPins: claims = NO_PINS,
  children,
}: TourProviderProps) {
  const [allAnchors, setAllAnchorsState] = useState(initialAnchors);
  const [showReviews, setShowReviews] = useState(true);
  const reviewPins = useMemo(() => placePins(claims, allAnchors), [claims, allAnchors]);
  const start = startAnchorId ? initialAnchors.find((a) => a.id === startAnchorId) : undefined;
  const startWorld = start ? worlds.find((w) => w.id === start.world_id) : undefined;
  const [currentSpot, setCurrentSpot] = useState(startWorld?.spot ?? entrySpot);
  const [readyWorldId, setReadyWorldId] = useState<string | null>(null);
  const [fading, setFading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [hq, setHqState] = useState(false);
  const [highlightedRoom, setHighlightedRoom] = useState<string | null>(null);
  const [three, setThree] = useState<Three | null>(null);

  const current = worlds.find((w) => w.spot === currentSpot) ?? worlds[0];

  // Refs for the async API: callers hold an older api object across awaits.
  const threeRef = useRef<Three | null>(null);
  const currentRef = useRef(current);
  const readyRef = useRef<string | null>(null);
  const anchorsRef = useRef(initialAnchors); // kept in step by setAllAnchors
  const busyRef = useRef(false);
  const overlays = useRef(new Set<Object3D>());
  const waiters = useRef<{ worldId: string; resolve: () => void }[]>([]);
  // The first view: ?anchor=, else the entry spot's first room anchor, else straight ahead.
  const pendingView = useRef<View | null>(
    start
      ? { kind: "anchor", anchor: start }
      : (() => {
          const room = initialAnchors.find((a) => a.world_id === current.id && a.kind === "room");
          return room ? { kind: "anchor", anchor: room } : { kind: "azimuth", azimuth: 0 };
        })(),
  );

  useEffect(() => {
    currentRef.current = current;
  });

  const applyView = useCallback(async (view: View, transition: boolean) => {
    const controls = threeRef.current?.controls;
    if (!controls) return;
    let eye: Vec3;
    let dir: Vec3;
    if (view.kind === "azimuth") {
      eye = spotEye();
      dir = lookDirection(view.azimuth, ARRIVAL_PITCH);
    } else {
      const v = anchorView(view.anchor);
      eye = v.eye;
      const d = { x: v.target.x - eye.x, y: v.target.y - eye.y, z: v.target.z - eye.z };
      const len = Math.hypot(d.x, d.y, d.z) || 1;
      dir = { x: d.x / len, y: d.y / len, z: d.z / len };
    }
    const t = LOOK_DISTANCE;
    await controls.setLookAt(
      eye.x - dir.x * t,
      eye.y - dir.y * t,
      eye.z - dir.z * t,
      eye.x,
      eye.y,
      eye.z,
      transition,
    );
  }, []);

  const waitReady = useCallback((worldId: string) => {
    if (readyRef.current === worldId) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const entry = { worldId, resolve };
      waiters.current.push(entry);
      setTimeout(() => {
        waiters.current = waiters.current.filter((w) => w !== entry);
        resolve();
      }, READY_TIMEOUT_MS);
    });
  }, []);

  const resolveWaiters = useCallback((worldId: string) => {
    const due = waiters.current.filter((w) => w.worldId === worldId);
    waiters.current = waiters.current.filter((w) => w.worldId !== worldId);
    for (const w of due) w.resolve();
  }, []);

  const goToSpot = useCallback(
    async (spot: string, view?: View) => {
      const from = currentRef.current;
      const target = worlds.find((w) => w.spot === spot);
      if (!target) return;
      if (target.id === from.id) {
        if (view) await applyView(view, true);
        return;
      }
      if (busyRef.current) return waitReady(currentRef.current.id);
      busyRef.current = true;
      try {
        setFading(true);
        await sleep(FADE_MS);
        pendingView.current = view ?? {
          kind: "azimuth",
          azimuth: arrivalAzimuth(target, from.spot),
        };
        readyRef.current = null;
        currentRef.current = target;
        setReadyWorldId(null);
        setError(null);
        setProgress(0);
        setCurrentSpot(spot);
        await waitReady(target.id);
      } finally {
        busyRef.current = false;
      }
    },
    [worlds, applyView, waitReady],
  );

  const spotLoaded = useCallback(
    (worldId: string) => {
      if (currentRef.current.id !== worldId) return;
      const view = pendingView.current;
      pendingView.current = null;
      if (view) void applyView(view, false);
      readyRef.current = worldId;
      setReadyWorldId(worldId);
      setProgress(1);
      setFading(false);
      resolveWaiters(worldId);
    },
    [applyView, resolveWaiters],
  );

  const spotFailed = useCallback(
    (worldId: string, message: string) => {
      if (currentRef.current.id !== worldId) return;
      setError(message);
      setFading(false);
      resolveWaiters(worldId);
    },
    [resolveWaiters],
  );

  const registerThree = useCallback((next: Three | null) => {
    const prev = threeRef.current;
    if (prev && prev.scene !== next?.scene) for (const o of overlays.current) prev.scene.remove(o);
    threeRef.current = next;
    if (next) for (const o of overlays.current) next.scene.add(o);
    setThree(next);
  }, []);

  const flyTo = useCallback(
    async (anchorId: string) => {
      const anchor = anchorsRef.current.find((a) => a.id === anchorId);
      const world = anchor && worlds.find((w) => w.id === anchor.world_id);
      if (!anchor || !world) return; // unknown ids are ignored (components/tour-ext/actions.ts)
      if (world.id !== currentRef.current.id) await goToSpot(world.spot);
      if (currentRef.current.id !== world.id) return; // another switch won
      await applyView({ kind: "anchor", anchor }, true);
    },
    [worlds, goToSpot, applyView],
  );

  const lookAt = useCallback(async (point: Vec3) => {
    const controls = threeRef.current?.controls;
    if (!controls) return;
    const eye = controls.getTarget(new Vector3());
    const d = { x: point.x - eye.x, y: point.y - eye.y, z: point.z - eye.z };
    const len = Math.hypot(d.x, d.y, d.z);
    if (len < 1e-6) return;
    const t = LOOK_DISTANCE / len;
    await controls.setLookAt(
      eye.x - d.x * t,
      eye.y - d.y * t,
      eye.z - d.z * t,
      eye.x,
      eye.y,
      eye.z,
      true,
    );
  }, []);

  const highlightRoom = useCallback(
    (name: string | null) => {
      if (name === null) return setHighlightedRoom(null);
      const world = worlds.find((w) => matchesRoom(w, name));
      setHighlightedRoom(world ? world.spot : name);
    },
    [worlds],
  );

  const addOverlay = useCallback((object: Object3D) => {
    overlays.current.add(object);
    threeRef.current?.scene.add(object);
    return () => {
      overlays.current.delete(object);
      object.removeFromParent();
    };
  }, []);

  const setAllAnchors = useCallback((update: (anchors: Anchor[]) => Anchor[]) => {
    setAllAnchorsState((prev) => {
      const next = update(prev);
      anchorsRef.current = next;
      return next;
    });
  }, []);

  /** Swapping web and HQ splats reloads the spot in place; the camera stays where it is. */
  const setHq = useCallback((next: boolean) => {
    readyRef.current = null;
    setReadyWorldId(null);
    setProgress(0);
    setHqState(next);
  }, []);

  const ready = readyWorldId === current.id && three !== null;

  const currentId = current.id;

  const api = useMemo<TourApi>(
    () => ({
      ready,
      worldId: currentId,
      scene: three?.scene ?? null,
      camera: three?.camera ?? null,
      anchors: ofWorld(allAnchors, currentId),
      gaps: ofWorld(allGaps, currentId),
      flyTo,
      lookAt,
      highlightRoom,
      addOverlay,
    }),
    [ready, currentId, three, allAnchors, allGaps, flyTo, lookAt, highlightRoom, addOverlay],
  );

  const internal = useMemo<TourInternal>(
    () => ({
      listingId,
      worlds,
      current,
      ready,
      fading,
      progress,
      error,
      hq,
      setHq,
      highlightedRoom,
      allAnchors,
      setAllAnchors,
      anchorMode,
      goToSpot: (spot: string) => goToSpot(spot),
      registerThree,
      spotLoaded,
      spotFailed,
      setProgress,
      reviewPins,
      showReviews,
      setShowReviews,
    }),
    [
      reviewPins,
      showReviews,
      listingId,
      worlds,
      current,
      ready,
      fading,
      progress,
      error,
      hq,
      setHq,
      highlightedRoom,
      allAnchors,
      setAllAnchors,
      anchorMode,
      goToSpot,
      registerThree,
      spotLoaded,
      spotFailed,
    ],
  );

  return (
    <TourContext.Provider value={api}>
      <InternalContext.Provider value={internal}>{children}</InternalContext.Provider>
    </TourContext.Provider>
  );
}
