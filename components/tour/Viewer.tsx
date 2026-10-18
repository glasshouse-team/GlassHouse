"use client";

/**
 * The 3D part of the tour (GH-11): one R3F <Canvas> for the whole visit. Each spot's splat
 * and invisible collider mount in <SpotScene>; switching spots remounts it (the old SplatMesh
 * and collider are disposed). Browser only: loaded through next/dynamic with ssr: false.
 */
import { CameraControls, CameraControlsImpl, Html } from "@react-three/drei";
import { Canvas, useThree, type ThreeEvent } from "@react-three/fiber";
import { SparkRenderer, SplatMesh } from "@sparkjsdev/spark";
import { useEffect, useMemo, useRef, useState } from "react";
import { Box3, DoubleSide, Shape, Vector3 } from "three";
import type { Vec3, World } from "@/lib/schemas/world";
import { fetchBytes, preload } from "./assets";
import {
  colliderFromGlb,
  fallbackFloorY,
  linkDistance,
  splatPose,
  type SpotCollider,
} from "./collider-mesh";
import { LOOK_DISTANCE, useTourInternal } from "./TourProvider";
import {
  EYE_HEIGHT,
  MAX_OFFSET_M,
  neighbourSpots,
  placeArrows,
  servedFromOurStorage,
  spotLabel,
  type DoorwayArrow,
} from "./spots";

const STORAGE_ORIGIN = process.env.NEXT_PUBLIC_SUPABASE_URL ?? null;
const ours = (url: string | null) => (servedFromOurStorage(url, STORAGE_ORIGIN) ? url : null);
const ACTION = CameraControlsImpl.ACTION;

export function splatUrlFor(world: World, hq: boolean): string | null {
  return (hq && ours(world.spz_hq_url)) || ours(world.spz_url);
}

export interface AnchorPick {
  eye: Vec3;
  hit: Vec3;
}

export function Viewer({ onPick }: { onPick?: (pick: AnchorPick) => void }) {
  return (
    <Canvas
      className="touch-none"
      gl={{ antialias: false }}
      dpr={[1, 1.5]}
      camera={{ fov: 70, near: 0.02, far: 200, position: [0, EYE_HEIGHT, LOOK_DISTANCE] }}
    >
      <Spark />
      <Controls />
      <SpotScene onPick={onPick} />
    </Canvas>
  );
}

/** One SparkRenderer for the canvas (Spark's recommended setup). */
function Spark() {
  const { gl, scene } = useThree();
  useEffect(() => {
    const spark = new SparkRenderer({ renderer: gl });
    scene.add(spark);
    return () => {
      scene.remove(spark);
      spark.dispose();
    };
  }, [gl, scene]);
  return null;
}

/**
 * Look-around controls: drei CameraControls orbiting a target 5 cm ahead, so dragging turns
 * the head in place (inverted speeds feel like grabbing the room). The target stays within
 * about 1 m of the spot (Marble worlds blur further out). Wheel and pinch zoom the lens.
 * Keys: arrows turn, WASD steps (clamped by the boundary).
 */
function Controls() {
  const ref = useRef<CameraControlsImpl>(null);
  const { scene, camera } = useThree();
  const { registerThree } = useTourInternal();

  useEffect(() => {
    const controls = ref.current;
    if (!controls) return;
    controls.minDistance = controls.maxDistance = LOOK_DISTANCE;
    controls.azimuthRotateSpeed = -0.35;
    controls.polarRotateSpeed = -0.35;
    controls.minPolarAngle = 0.3;
    controls.maxPolarAngle = Math.PI - 0.3;
    controls.minZoom = 1;
    controls.maxZoom = 3;
    controls.draggingSmoothTime = 0.08;
    controls.smoothTime = 0.35;
    controls.mouseButtons.left = ACTION.ROTATE;
    controls.mouseButtons.right = ACTION.NONE;
    controls.mouseButtons.middle = ACTION.NONE;
    controls.mouseButtons.wheel = ACTION.ZOOM;
    controls.touches.one = ACTION.TOUCH_ROTATE;
    controls.touches.two = ACTION.TOUCH_ZOOM;
    controls.touches.three = ACTION.NONE;
    controls.setBoundary(
      new Box3(
        new Vector3(-MAX_OFFSET_M, 0.5, -MAX_OFFSET_M),
        new Vector3(MAX_OFFSET_M, 2.2, MAX_OFFSET_M),
      ),
    );
    registerThree({ scene, camera, controls });
    return () => registerThree(null);
  }, [scene, camera, registerThree]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const controls = ref.current;
      const el = e.target as HTMLElement | null;
      if (!controls || el?.closest("input, textarea, select, [contenteditable]")) return;
      const step = 0.25;
      const turn = 0.2;
      switch (e.key) {
        case "ArrowLeft":
          void controls.rotate(turn, 0, true);
          break;
        case "ArrowRight":
          void controls.rotate(-turn, 0, true);
          break;
        case "ArrowUp":
          void controls.rotate(0, turn / 2, true);
          break;
        case "ArrowDown":
          void controls.rotate(0, -turn / 2, true);
          break;
        case "w":
        case "W":
          void controls.forward(step, true);
          break;
        case "s":
        case "S":
          void controls.forward(-step, true);
          break;
        case "a":
        case "A":
          void controls.truck(-step, 0, true);
          break;
        case "d":
        case "D":
          void controls.truck(step, 0, true);
          break;
        default:
          return;
      }
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return <CameraControls ref={ref} makeDefault />;
}

interface Loaded {
  worldId: string;
  splat: SplatMesh;
  collider: SpotCollider | null;
  arrows: DoorwayArrow[];
}

/** The current spot: splat + invisible collider + doorway arrows, keyed by world and quality. */
function SpotScene({ onPick }: { onPick?: (pick: AnchorPick) => void }) {
  const { current, hq } = useTourInternal();
  return <SpotWorld key={`${current.id}:${hq}`} world={current} hq={hq} onPick={onPick} />;
}

function SpotWorld({
  world,
  hq,
  onPick,
}: {
  world: World;
  hq: boolean;
  onPick?: (pick: AnchorPick) => void;
}) {
  const { worlds, spotLoaded, spotFailed, setProgress, goToSpot, highlightedRoom, anchorMode } =
    useTourInternal();
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    let cancelled = false;
    let splat: SplatMesh | null = null;
    let collider: SpotCollider | null = null;
    const splatUrl = splatUrlFor(world, hq);
    const colliderUrl = ours(world.collider_mesh_url);
    const scale = world.metric_scale_factor ?? 1;
    let c = colliderUrl ? 0 : 1;
    let s = 0;
    const report = () => setProgress(0.15 * c + 0.75 * s);
    const release = () => {
      splat?.dispose();
      collider?.dispose();
      splat = null;
      collider = null;
    };

    (async () => {
      if (!splatUrl) throw new Error("This room has no 3D file in our storage yet.");
      const colliderBytes = colliderUrl
        ? fetchBytes(colliderUrl, (f) => ((c = f), report())).catch(() => null)
        : Promise.resolve(null);
      const splatBytes = fetchBytes(splatUrl, (f) => ((s = f), report()));
      const glb = await colliderBytes;
      if (glb && glb.length) {
        try {
          collider = colliderFromGlb(glb, scale);
        } catch (error) {
          console.warn("[tour] collider unreadable, arrows use default distances", error);
        }
      }
      const floorY = collider?.floorY ?? fallbackFloorY(world.ground_plane_offset);
      // A copy: Spark may hand the buffer to its worker, and the cache keeps the original.
      const bytes = (await splatBytes).slice();
      if (cancelled) return release();
      splat = new SplatMesh({ fileBytes: bytes, fileName: "splat.spz" });
      const pose = splatPose(scale, floorY);
      splat.position.copy(pose.position);
      splat.quaternion.copy(pose.quaternion);
      splat.scale.copy(pose.scale);
      await splat.initialized;
      if (cancelled) return release();
      const labels = new Map(worlds.map((w) => [w.spot, spotLabel(w)]));
      const arrows = placeArrows(world.links, labels, linkDistance(collider));
      setLoaded({ worldId: world.id, splat, collider, arrows });
      setProgress(1);
    })().catch((error: unknown) => {
      if (cancelled) return;
      console.warn("[tour] spot failed to load", error);
      spotFailed(world.id, error instanceof Error ? error.message : "The 3D room did not load.");
    });

    return () => {
      cancelled = true;
      release();
    };
  }, [world, hq, worlds, setProgress, spotFailed]);

  // Tell the provider once the objects are in the scene (after this commit), then preload
  // the rooms one doorway away.
  useEffect(() => {
    if (!loaded) return;
    spotLoaded(loaded.worldId);
    const next = neighbourSpots(world, worlds)
      .map((spot) => worlds.find((w) => w.spot === spot))
      .filter((w): w is World => Boolean(w));
    preload(next.flatMap((w) => [splatUrlFor(w, hq), ours(w.collider_mesh_url)]));
  }, [loaded, spotLoaded, world, worlds, hq]);

  if (!loaded) return null;

  const pick = (e: ThreeEvent<MouseEvent>) => {
    if (!onPick || e.delta > 6) return;
    e.stopPropagation();
    const eye = e.camera.position;
    onPick({
      eye: { x: eye.x, y: eye.y, z: eye.z },
      hit: { x: e.point.x, y: e.point.y, z: e.point.z },
    });
  };

  return (
    <>
      <primitive object={loaded.splat} />
      {loaded.collider && (
        <primitive object={loaded.collider.mesh} onClick={anchorMode ? pick : undefined} />
      )}
      {loaded.arrows.map((arrow) => (
        <Arrow
          key={arrow.to}
          arrow={arrow}
          highlighted={highlightedRoom === arrow.to}
          onGo={() => void goToSpot(arrow.to)}
        />
      ))}
      {anchorMode && <AnchorMarkers worldId={world.id} />}
    </>
  );
}

/** Chevron pointing along +y in its plane; laid on the floor it points along -z. */
function useChevron() {
  return useMemo(() => {
    const s = new Shape();
    s.moveTo(0, 0.28);
    s.lineTo(0.26, -0.02);
    s.lineTo(0.15, -0.1);
    s.lineTo(0, 0.07);
    s.lineTo(-0.15, -0.1);
    s.lineTo(-0.26, -0.02);
    s.closePath();
    return s;
  }, []);
}

/** A doorway arrow on the floor plus a tappable label above it. */
function Arrow({
  arrow,
  highlighted,
  onGo,
}: {
  arrow: DoorwayArrow;
  highlighted: boolean;
  onGo: () => void;
}) {
  const chevron = useChevron();
  const [hover, setHover] = useState(false);
  const yaw = (-arrow.azimuth * Math.PI) / 180; // (0,0,-1) turned by -az is (sin az, 0, -cos az)
  const active = hover || highlighted;
  return (
    <group position={[arrow.position.x, 0.03, arrow.position.z]} rotation={[0, yaw, 0]}>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        renderOrder={10}
        onClick={(e) => {
          if (e.delta > 6) return;
          e.stopPropagation();
          onGo();
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHover(true);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          setHover(false);
          document.body.style.cursor = "";
        }}
        scale={active ? 1.25 : 1}
      >
        <shapeGeometry args={[chevron]} />
        <meshBasicMaterial
          color={highlighted ? "#f5a524" : "#ffffff"}
          transparent
          opacity={active ? 1 : 0.85}
          depthTest={false}
          side={DoubleSide}
        />
      </mesh>
      <Html position={[0, 0.9, 0]} center zIndexRange={[20, 10]}>
        <button
          type="button"
          onClick={onGo}
          className={`rounded-full px-3 py-1.5 text-sm font-medium whitespace-nowrap shadow-md backdrop-blur transition-colors ${
            highlighted ? "bg-honesty text-neutral-950" : "bg-black/60 text-white hover:bg-black/80"
          }`}
        >
          {arrow.label} →
        </button>
      </Html>
    </group>
  );
}

/** Anchor mode only: a dot at each saved anchor's target in this spot. */
function AnchorMarkers({ worldId }: { worldId: string }) {
  const { allAnchors } = useTourInternal();
  return (
    <>
      {allAnchors
        .filter((a) => a.world_id === worldId)
        .map((a) => {
          const p = a.look_at ?? a.position;
          return (
            <group key={a.id} position={[p.x, p.y, p.z]}>
              <mesh renderOrder={11}>
                <sphereGeometry args={[0.05, 12, 12]} />
                <meshBasicMaterial color="#2f6fde" depthTest={false} />
              </mesh>
              <Html center position={[0, 0.12, 0]} zIndexRange={[20, 10]}>
                <span className="rounded bg-black/70 px-1.5 py-0.5 text-xs whitespace-nowrap text-white">
                  {a.name}
                </span>
              </Html>
            </group>
          );
        })}
    </>
  );
}
