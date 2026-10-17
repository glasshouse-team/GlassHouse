---
paths:
  - "components/tour/**"
  - "components/tour-ext/**"
  - "components/floorplan/**"
  - "app/(guest)/tour/**"
  - "app/tools/rig/**"
---

# 3D rules

- Spark and WebGL run only in the browser. Load 3D components with `next/dynamic` and `ssr: false`, and mark them `"use client"`.
- Units are meters: scale by `metric_scale_factor`, then shift down by `ground_plane_offset`, so the floor is at y = 0.
- Never load splats or meshes from World Labs URLs. Use the copies in our storage (`worlds.spz_url`, `collider_mesh_url`).
- Phones get the web-size splat; cap the device pixel ratio at 1.5. Dispose geometries, materials and SplatMesh objects on unmount.
- components/tour/ is Temuri's. Beka's add-ons live in components/tour-ext/ and use only `useTour()` from components/tour/TourContext.tsx.
