/**
 * CONTRACT FILE (GH-5, owner: Temuri). Output schemas for the neutral Verifier.
 * Keep output schemas simple (no .refine/.transform): structured output support varies,
 * so check extra rules in code after parsing. See .claude/skills/verifier-vision.
 */
import { z } from "zod";
import { GapIssue } from "./world";

export const Confidence = z.number().min(0).max(1);

/** Fact keys the X-ray should try to fill. Other keys are allowed. */
export const KNOWN_FACT_KEYS = [
  "beds_counted",
  "sleeping_spots",
  "has_desk",
  "desk_near_window",
  "stairs",
  "step_free_entrance",
  "kitchen_equipment",
  "outdoor_space",
  "view_type",
  "natural_light",
  "washer",
  "tv",
  "workspace",
  "parking_visible",
  "fireplace",
] as const;

// ---------- GH-9 Listing X-ray ----------

export const FactSchema = z.object({
  key: z.string(),
  value: z.union([z.string(), z.number(), z.boolean()]),
  /** Claude cites labels such as "photo_04"; tools/verifier/xray.ts stores `listing_photos.id` values. At least one. */
  evidence: z.array(z.string()),
  confidence: Confidence,
});

export const ContradictionSchema = z.object({
  /** The exact claim from the listing text. */
  claim: z.string(),
  /** What the photos show instead. */
  finding: z.string(),
  evidence: z.array(z.string()),
  severity: z.enum(["low", "medium", "high"]),
});

export const XrayResultSchema = z.object({
  facts: z.array(FactSchema),
  contradictions: z.array(ContradictionSchema),
  /** Rooms or features never shown, e.g. "bathroom", "view from bedroom". */
  missing_photos: z.array(z.string()),
});
export type XrayResult = z.infer<typeof XrayResultSchema>;

// ---------- GH-19 Gap check (per viewpoint, 6 views) ----------

/** Normalized box in the screenshot, 0..1 from the top-left corner. */
export const BBoxSchema = z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() });

export const ViewFindingSchema = z.object({
  view_id: z.string(),
  issue: z.union([GapIssue, z.literal("none")]),
  description: z.string(),
  bbox: BBoxSchema.nullable(),
  severity: z.number().int().min(1).max(3).nullable(),
});

export const VisibleObjectSchema = z.object({
  view_id: z.string(),
  /** desk, bed, sofa, window, balcony_door, tv, kitchen, table, wardrobe, shower, fireplace... */
  label: z.string(),
  bbox: BBoxSchema,
});

export const GapCheckResultSchema = z.object({
  views: z.array(ViewFindingSchema),
  objects: z.array(VisibleObjectSchema),
});
export type GapCheckResult = z.infer<typeof GapCheckResultSchema>;

/**
 * One view checked on its own against the real photos facing the same way (D-046). The code
 * adds the view id and assembles a GapCheckResult from the six answers.
 */
export const ViewCheckSchema = z.object({
  issue: z.union([GapIssue, z.literal("none")]),
  description: z.string(),
  bbox: BBoxSchema.nullable(),
  severity: z.number().int().min(1).max(3).nullable(),
  objects: z.array(z.object({ label: z.string(), bbox: BBoxSchema })),
});
export type ViewCheck = z.infer<typeof ViewCheckSchema>;

/** Second look at one suspected gap (the red box): do the real photos show that content? */
export const GapConfirmSchema = z.object({
  shown_in_photos: z.boolean(),
  reason: z.string(),
});
export type GapConfirm = z.infer<typeof GapConfirmSchema>;

// ---------- GH-18 Room names on the top-down render ----------

export const RoomLabelsSchema = z.object({
  rooms: z.array(
    z.object({
      room: z.string(),
      /** Pixel position of the label in the top-down image. */
      x: z.number(),
      y: z.number(),
      confidence: Confidence,
    }),
  ),
});
export type RoomLabels = z.infer<typeof RoomLabelsSchema>;
