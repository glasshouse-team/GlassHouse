/**
 * CONTRACT FILE (GH-5, owner: Temuri). Shared types for 3D worlds, anchors, gaps,
 * floor plans and captures. Units are meters after applying Marble's metric scale;
 * the floor is at y = 0. See docs/CONTRACTS.md.
 */
import { z } from "zod";

export const Vec3Schema = z.object({ x: z.number(), y: z.number(), z: z.number() });
export type Vec3 = z.infer<typeof Vec3Schema>;

// ---------- Worlds (one row per room spot of a generated version, D-009) ----------

/** A doorway arrow: the spot it leads to and its direction from this spot, in degrees
 * clockwise from the spot's first ring photo. In three.js after marbleToThree it points
 * along (sin az, 0, -cos az). */
export const SpotLinkSchema = z.object({
  to: z.string().min(1),
  azimuth: z.number().min(0).max(360),
});
export type SpotLink = z.infer<typeof SpotLinkSchema>;

export const WorldStatus = z.enum([
  "queued",
  "generating",
  "ready",
  "failed",
  "published",
  "archived",
]);
export type WorldStatus = z.infer<typeof WorldStatus>;

export const WorldInputKind = z.enum(["video", "multi-image", "image", "text"]);

export const WorldSchema = z.object({
  id: z.uuid(),
  listing_id: z.uuid(),
  version: z.number().int().positive(),
  /** Room spot key within the version, e.g. "kitchen"; unique per (listing, version). */
  spot: z.string().min(1),
  /** Label for arrows and Jump to room, e.g. "Kitchen". */
  spot_label: z.string().nullable(),
  /** Doorway arrows from this spot. */
  links: z.array(SpotLinkSchema),
  status: WorldStatus,
  model: z.string().nullable(),
  input_kind: WorldInputKind.nullable(),
  input_capture_ids: z.array(z.uuid()),
  marble_world_id: z.string().nullable(),
  operation_id: z.string().nullable(),
  /** Splat sized for the web and phones. Served from OUR storage, never from World Labs. */
  spz_url: z.string().nullable(),
  spz_hq_url: z.string().nullable(),
  collider_mesh_url: z.string().nullable(),
  hq_mesh_url: z.string().nullable(),
  pano_url: z.string().nullable(),
  thumbnail_url: z.string().nullable(),
  caption: z.string().nullable(),
  /** Multiply raw splat/mesh coordinates by this to get meters. */
  metric_scale_factor: z.number().nullable(),
  /** After scaling, subtract this from y to put the floor at 0. */
  ground_plane_offset: z.number().nullable(),
  /** Share of gap-check views backed by real footage, 0..1 (GH-19). */
  coverage_score: z.number().min(0).max(1).nullable(),
  cost_credits: z.number().int().nullable(),
  error: z.string().nullable(),
});
export type World = z.infer<typeof WorldSchema>;

// ---------- Anchors (named points the camera can fly to) ----------

export const AnchorKind = z.enum(["room", "object", "viewpoint"]);

export const AnchorSchema = z.object({
  id: z.uuid(),
  world_id: z.uuid(),
  /** "Kitchen", "desk", "bed", "balcony". */
  name: z.string(),
  kind: AnchorKind,
  room: z.string().nullable(),
  /** Where the camera stands (eye height 1.6 m for rooms), in meters, floor at y = 0. */
  position: Vec3Schema,
  /** What the camera looks at (the object or surface), or null for a room's default view. */
  look_at: Vec3Schema.nullable(),
  source: z.enum(["auto", "manual"]),
});
export type Anchor = z.infer<typeof AnchorSchema>;

// ---------- Gaps (blank or AI-invented areas found by the Verifier) ----------

export const GapIssue = z.enum(["blank", "smeared", "stretched", "invented", "dark"]);
export type GapIssue = z.infer<typeof GapIssue>;

export const GapStatus = z.enum(["open", "requested", "filled", "dismissed"]);

export const GapSchema = z.object({
  id: z.uuid(),
  world_id: z.uuid(),
  room: z.string().nullable(),
  issue: GapIssue,
  /** Plain instruction for the host: "The corner left of the fridge is blank." */
  description: z.string(),
  severity: z.number().int().min(1).max(3),
  position: Vec3Schema.nullable(),
  view_dir: Vec3Schema.nullable(),
  radius_m: z.number().positive(),
  screenshot_url: z.string().nullable(),
  status: GapStatus,
  filled_by_capture: z.uuid().nullable(),
});
export type Gap = z.infer<typeof GapSchema>;

// ---------- Floor plans (GH-18) ----------

/** 2D point on the floor plane in meters: [x, z]. */
export const Point2Schema = z.tuple([z.number(), z.number()]);

/**
 * One real measurement of one room by the host (GH-18 v2), stored on that room in
 * floor_plans.rooms; scale = meters / measured_m applies to every room of the version.
 */
export const FloorPlanCalibrationSchema = z.object({
  room: z.string(),
  axis: z.enum(["width", "length"]),
  /** The real length the host entered. */
  meters: z.number().positive(),
  /** The same length in the 3D's meters. */
  measured_m: z.number().positive(),
  /** Real meters per 3D meter. */
  scale: z.number().positive(),
  /** Who entered it (profile name) and when (ISO time). */
  by: z.string(),
  at: z.string(),
});
export type FloorPlanCalibration = z.infer<typeof FloorPlanCalibrationSchema>;

export const FloorPlanSchema = z.object({
  id: z.uuid(),
  world_id: z.uuid(),
  svg_url: z.string().nullable(),
  rooms: z.array(
    z.object({
      name: z.string(),
      /** Label position (v1) or polygon centroid (v2). */
      label: Point2Schema,
      polygon: z.array(Point2Schema).nullable(),
      /** Floor area (v2), calibrated when the plan is host-calibrated. */
      area_m2: z.number().nullable(),
      /** Only on the room the host measured (v2). */
      calibration: FloorPlanCalibrationSchema.optional(),
    }),
  ),
  /** Wall segments [x1, z1, x2, z2] in meters. */
  walls: z.array(z.tuple([z.number(), z.number(), z.number(), z.number()])),
  doors: z.array(z.object({ at: Point2Schema, width_m: z.number() })),
  total_area_m2: z.number().nullable(),
  /** "marble-metric" or "host-calibrated". */
  scale_source: z.string().nullable(),
  version: z.enum(["v1", "v2"]),
  status: z.enum(["building", "ready", "failed"]),
});
export type FloorPlan = z.infer<typeof FloorPlanSchema>;

// ---------- Captures (photo rings, walkthroughs, fill-ins, check-ins) ----------

export const CaptureKind = z.enum(["walkthrough", "ring", "fill_in", "checkin"]);
export const RoomMarkerSchema = z.object({ room: z.string(), t: z.number().nonnegative() });
export const HeadingSampleSchema = z.object({
  t: z.number().nonnegative(),
  heading: z.number().min(0).max(360),
});

export const CaptureSchema = z.object({
  id: z.uuid(),
  listing_id: z.uuid(),
  kind: CaptureKind,
  raw_url: z.string().nullable(),
  prepared_url: z.string().nullable(),
  duration_s: z.number().nullable(),
  size_bytes: z.number().int().nullable(),
  /** "Next room" taps: seconds from the start of the video. */
  room_markers: z.array(RoomMarkerSchema),
  heading_track: z.array(HeadingSampleSchema),
  quality_flags: z.array(z.string()),
  transcript: z.string().nullable(),
  gap_id: z.uuid().nullable(),
  status: z.enum(["uploading", "uploaded", "prepared", "failed"]),
});
export type Capture = z.infer<typeof CaptureSchema>;
