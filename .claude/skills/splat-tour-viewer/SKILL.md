---
name: splat-tour-viewer
description: Build the walkable whole-house 3D tour - React Three Fiber + Spark Gaussian splats, metric scale, three-mesh-bvh collisions, desktop and phone controls, Jump to room, anchor mode, camera fly-to, the useTour() API, pins and the honesty overlay. Use for GH-11, GH-19 pins, GH-20 and GH-21 (tour-ext add-ons) and GH-24 review pins.
when_to_use: The user mentions "3D viewer", "tour page", "walk through the house", "splat", "Spark", "collisions", "walk through walls", "jump to room", "fly the camera", "anchor mode", "minimap", "useTour", "pins in 3D", "honesty overlay", "tint AI-filled areas", "3D on phone is slow".
---

# Splat tour viewer

Libraries: three 0.186, @react-three/fiber 9, @react-three/drei 10, @sparkjsdev/spark 2.3 (README in node_modules/@sparkjsdev/spark, examples at sparkjs.dev/examples), three-mesh-bvh 0.9.

Ownership: `components/tour/` and `app/(guest)/tour/` are Temuri's (GH-11). Beka's add-ons go in `components/tour-ext/` and use only `useTour()` (components/tour/TourContext.tsx, a contract).

## Mount (client only)

```tsx
// app/(guest)/tour/[listingId]/page.tsx (server) loads the world row and renders <TourClient world={...} />.
// components/tour/TourClient.tsx starts with "use client": `ssr: false` is only allowed in Client Components.
const Viewer = dynamic(() => import("@/components/tour/Viewer"), { ssr: false });
```

Tree: `<TourProvider>` (outside the Canvas, so HTML overlays can use `useTour()`) > `<Canvas>` with an inner bridge that registers scene, camera and controls > splat + collider. Next to the Canvas, inside the provider, render Beka's `<TourExtensions listingId worldId />` from `components/tour-ext/index.tsx`. Use a full-screen container (`fixed inset-0`): the root layout's `<main>` is narrow.

Inside Viewer: `<Canvas gl={{ antialias: false }} dpr={[1, 1.5]} camera={{ fov: 70, near: 0.05, far: 200 }}>` (Spark recommends antialias off).

## Spark inside React Three Fiber

```tsx
import { SparkRenderer, SplatMesh } from "@sparkjsdev/spark";
const { gl, scene } = useThree();
useEffect(() => {
  const spark = new SparkRenderer({ renderer: gl });
  scene.add(spark);
  return () => {
    scene.remove(spark);
  };
}, [gl, scene]);
const splat = useMemo(() => new SplatMesh({ url: world.spz_url }), [world.spz_url]);
// await splat.initialized for a loaded flag; dispose on unmount
return <primitive object={splat} />;
```

**Coordinates:** Marble worlds use OpenCV axes (+y down, +z forward), so always flip; never "only if it looks upside down". Use the one transform in `lib/geometry/frame.ts` for the splat and the collider together (one parent group): `marbleToThree(metric_scale_factor, floorY)` flips Y and Z, scales to meters and lifts the floor to y = 0. Measure `floorY` from the collider with `floorHeight()` instead of trusting the sign of `ground_plane_offset`, which World Labs does not document. The floor plan (GH-18) and gap check (GH-19) use the same functions, so positions agree everywhere. Use the web splat on phones, HQ behind a desktop toggle.

## Collisions and walking

- Load the collider mesh (GLTFLoader from three/examples/jsm or drei `useGLTF`), apply the same transform, keep it invisible (`visible = false`), and build a BVH:
  `import { computeBoundsTree, acceleratedRaycast } from "three-mesh-bvh"; THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree; THREE.Mesh.prototype.raycast = acceleratedRaycast; geometry.computeBoundsTree();`
- Each frame: raycast in the move direction (`raycaster.firstHitOnly = true`) and stop 0.3 m before a hit; raycast down from 1 m above the camera to follow the floor and keep the eye at 1.6 m.
- Desktop: drei `PointerLockControls` + WASD/arrow keys, Shift to run. Phone: on-screen joystick (left thumb) + drag to look. "Dollhouse" toggle: drei `CameraControls` orbiting from above.

## Camera moves

drei `CameraControls`: `controls.setLookAt(px, py, pz, tx, ty, tz, true)` animates. `flyTo(anchorId)` moves the eye to the anchor's `position` and looks at its `look_at` (or straight ahead if null). Turn the walking controls off during the move and back on after, so only one control moves the camera. Wall rays ignore hits whose normal is mostly vertical (|normal.y| > 0.6).

## useTour() (implement exactly as declared in TourContext.tsx)

`ready, worldId, scene, camera, anchors, gaps, flyTo(), lookAt(), highlightRoom(), addOverlay(object) => remove`. `<TourProvider>` sits outside the Canvas (React context does not cross into or out of the R3F Canvas on its own; the inner bridge hands scene and camera up) and loads anchors and gaps for the world. `addOverlay` adds at the scene root, in world meters (floor y = 0). `gaps` holds all gaps of the shown world; AI-filled means status `open` or `requested`. Beka verifies it from `components/tour-ext/`.

## Anchor mode (`?anchors=1`, dev only)

Click a surface: raycast against the collider mesh, prompt for a name and kind (room, object, viewpoint), and save `{ name, kind, room, position: <camera eye>, look_at: <hit point> }` through `POST /api/worlds/[id]/anchors` (RLS blocks browser writes; the route refuses in production). Label every room plus desk, bed, sofa, window or balcony in both hero homes (about 10 minutes each).

## Pins and overlays

- Gap pins (GH-19, Temuri): small amber camera markers at `gap.position`, via `addOverlay` or directly in components/tour.
- Labels in 3D: drei `<Html position={...}>` with normal styled divs (review pins, GH-24).
- Honesty overlay (GH-21, Beka, in tour-ext): start with translucent amber spheres (`radius_m`) at open gaps through `addOverlay`. Upgrade: Spark splat editing tints the splats themselves:
  ```ts
  import {
    SplatEdit,
    SplatEditSdf,
    SplatEditSdfType,
    SplatEditRgbaBlendMode,
  } from "@sparkjsdev/spark";
  const edit = new SplatEdit({ rgbaBlendMode: SplatEditRgbaBlendMode.MULTIPLY, softEdge: 0.3 });
  const sdf = new SplatEditSdf({
    type: SplatEditSdfType.SPHERE,
    radius: gap.radius_m,
    color: new THREE.Color(1, 0.75, 0.35),
  });
  sdf.position.set(x, y, z);
  edit.addSdf(sdf);
  scene.add(edit);
  ```
  Check the editing example on sparkjs.dev before relying on it.

## Performance and cleanup

Device pixel ratio up to 1.5; web splat on phones; dispose SplatMesh, geometries and materials on unmount; show the thumbnail and a progress bar while loading; fall back to the photo gallery if WebGL fails.

## Done when (GH-11)

Hero home 1 loads in under 10 s on a laptop and works on an iPhone and an Android phone; no walking through walls; steady eye height; Jump to room works for every room; anchors saved for both hero homes; zero requests to World Labs while viewing.
