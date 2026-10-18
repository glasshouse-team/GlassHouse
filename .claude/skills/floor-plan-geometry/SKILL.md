---
name: floor-plan-geometry
description: Build the floor plan from the 3D collider mesh - horizontal slicing, wall grid, straightening, room labels from a top-down render, SVG output and the in-tour minimap. Use for GH-18 (v1 walls and labels, v2 room polygons and areas).
when_to_use: The user mentions "floor plan", "slice the mesh", "walls", "room polygons", "room areas", "top-down view", "minimap", "you are here dot", "calibrate scale", "plan looks wrong".
---

# Floor plan from the 3D (GH-18)

The geometry comes from the world's collider mesh in **meters** (Marble's metric scale). The Verifier only names the rooms. It runs once per world version, offline (`pnpm floorplans` or `POST /api/worlds/[id]/floorplan`), never on a page view. Owner: Temuri.

Already in the starter: `lib/geometry/slice.ts` (`sliceTriangle`, `sliceMesh`, `segmentLength`) with tests on a box room. Build the rest next to it: `walls.ts`, `rooms.ts` (v2), `svg.ts`, each with a small test on a synthetic mesh.

## v1 (build this first, 2-3 h)

1. **Load** the stored collider mesh in Node with `colliderToThree(bytes, metric_scale_factor)` (lib/geometry/collider.ts): it reads the GLB, applies `marbleToThree` + `floorHeight` from `lib/geometry/frame.ts` and returns merged triangles in meters with the floor at y = 0, matching the viewer exactly. GH-3: Marble colliders are uncompressed trimesh GLBs (130-215k triangles, no Draco, no node transforms), so no GLTFLoader or Draco decoder is needed. Each spot world (D-009) has its own collider: build one plan per spot; a whole-home plan needs the spots placed relative to each other.
2. **Slice** at y = 1.0, 1.3 and 1.6 m (above furniture, below the ceiling) with `sliceMesh`. For big meshes, build a BVH and use `shapecast` to visit only triangles whose bounds cross each plane.
3. **Wall grid:** rasterize segments into a 5 cm grid (Bresenham per segment). Keep cells hit in at least 2 of the 3 slices: this drops furniture tops and noise.
4. **Straighten:** histogram of segment angles modulo 90 degrees, take the peak as the main wall angle, rotate everything so walls are axis-aligned. Snap segments within about 5 degrees to the axes, merge collinear neighbours, drop pieces under 20 cm. These thresholds are starting points; tune them by looking at the result.
5. **Room names:** render a top-down orthographic view of the splat at 1024 px **in the browser** (the rig page, `/tools/rig?world=<id>&mode=topdown`): Spark needs WebGL, so Node and API routes cannot render it, and Spark ignores clipping planes, so put the orthographic camera at y = 1.8 m looking down (`up = (0, 0, -1)`, near 0.01) to cut the ceiling. Upload `topdown.jpg` plus its x/z bounds with `createSignedUpload`, then the floorplan route does the rest. Send it to `agentModel()` with the room list from GH-6 and one frame per room; output schema `RoomLabelsSchema` (lib/schemas/verifier.ts): `{ room, x, y, confidence }` in image pixels. Convert pixels to meters with the orthographic camera bounds. Save each as an anchor `{ kind: "room", source: "auto" }`: these feed Jump to room.
6. **SVG** (`svg.ts`): thick wall strokes, room names, a 1 m scale bar, "Plan is approximate" in small text, hatching (`--honesty` color) around open gaps. Upload to `media/worlds/{id}/floorplan.svg`; insert a `floor_plans` row (`version: "v1"`, `scale_source: "marble-metric"`).
7. **UI:** `components/floorplan/FloorPlanCard.tsx` (listing slot; clicking a room opens `/tour/<listing>` at that room) and `components/floorplan/Minimap.tsx` inside the tour: a "you are here" dot and view cone from the camera position and yaw (x and z map to the SVG through the same transform), click a room to `flyTo`.

## v2 (only if v1 is done before the freeze)

- Close door openings: dilate the wall grid by about 0.5 m (closes 1 m gaps), flood-fill free space, keep regions over 2 m2, erode back. Doors are where the dilation added cells.
- Polygons: d3-contour on each region, then simplify-js; area with the shoelace formula; total area.
- Calibration: the host taps a door on the plan and enters its real width; store the ratio and apply it to the plan and the 3D (`scale_source: "host-calibrated"`).

## Fallbacks

A) Slicing is too noisy: ask Sonnet for room rectangles on the top-down render and draw a coarse plan. B) Show the top-down render itself as "View from above".

## Done when

Both hero homes show straight walls, the right room count and correct names; the minimap dot follows the camera within about half a meter; room anchors exist and Jump to room uses them; the SVG loads from storage.
