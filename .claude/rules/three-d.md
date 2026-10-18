---
paths:
  - "components/tour/**"
  - "components/tour-ext/**"
  - "components/floorplan/**"
  - "app/(guest)/tour/**"
  - "app/tools/rig/**"
  - "lib/geometry/**"
  - "components/gaps/**"
  - "scripts/build-floorplans.ts"
  - "scripts/run-gaps.ts"
---

# 3D rules

- Spark and WebGL run only in the browser. Load 3D components with `next/dynamic` and `ssr: false` from a `"use client"` component (not from a page). Rendering screenshots or a top-down view happens in the browser rig page, never in Node.
- Units are meters with the floor at y = 0. Convert Marble coordinates only with `lib/geometry/frame.ts` (`marbleToThree`, `floorHeight`): Marble uses OpenCV axes, so always flip.
- Anchors: `position` is where the camera stands, `look_at` what it looks at.
- One Marble world per room spot; doorway arrows and switching spots are ours (D-009). A link's azimuth az points along (sin az, 0, -cos az) after `marbleToThree`.
- Never load splats or meshes from World Labs URLs. Use the copies in our storage (`worlds.spz_url`, `collider_mesh_url`).
- Phones get the web-size splat; cap the device pixel ratio at 1.5. Dispose geometries, materials and SplatMesh objects on unmount.
- components/tour/ is Temuri's. Beka's add-ons live in components/tour-ext/ and use only `useTour()` from components/tour/TourContext.tsx.
