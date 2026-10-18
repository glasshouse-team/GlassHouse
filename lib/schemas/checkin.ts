/**
 * GH-23 check-in verification (owner: Beka). The Verifier compares the guest's arrival frames
 * with the listing's photos and X-ray facts. Kept simple for structured output: no refine or
 * transform; extra rules (known frame ids, one entry per thing) run in lib/checkin.ts.
 */
import { z } from "zod";

export const CheckinSeverity = z.enum(["low", "medium", "high"]);
export type CheckinSeverity = z.infer<typeof CheckinSeverity>;

/** At most 8 frames per check-in, each a JPEG data URL from the browser (D-015). */
export const MAX_CHECKIN_FRAMES = 8;
/** One frame at 1024 px, JPEG 0.75, is about 100-250 kB of base64; 600k characters is a hard cap. */
export const MAX_FRAME_CHARS = 600_000;
/** All frames together stay under the 4.5 MB body limit of a Vercel function. */
export const MAX_FRAMES_TOTAL_CHARS = 3_800_000;

export const CheckinMatchSchema = z.object({
  room: z.string().describe("Room name, e.g. kitchen"),
  item: z.string().describe("What looks as listed, at most eight words"),
  evidence_frame: z.string().describe("The frame id that shows it, e.g. frame_03"),
});

export const CheckinDifferenceSchema = z.object({
  room: z.string(),
  listed: z.string().describe("What the listing photos or facts show"),
  seen: z.string().describe("What the arrival frame shows instead"),
  evidence_frame: z.string().describe("The frame id that shows the difference"),
  listing_photo: z.string().describe("The listing photo id it differs from, or empty"),
  severity: CheckinSeverity,
});

/** What the model returns (frame and photo ids as labels). */
export const CheckinReportSchema = z.object({
  matches: z.array(CheckinMatchSchema),
  differences: z.array(CheckinDifferenceSchema),
  missing_items: z
    .array(z.string())
    .describe("Listed things the frames should show but do not, at most eight words each"),
});
export type CheckinReport = z.infer<typeof CheckinReportSchema>;
export type CheckinDifference = z.infer<typeof CheckinDifferenceSchema>;

/** What `checkins.report` holds (public read): the cleaned report plus run details, no images. */
export const StoredCheckinReportSchema = CheckinReportSchema.extend({
  frame_ids: z.array(z.string()),
  /** listing_photos.id per photo label the Verifier saw ("photo_02" -> uuid). */
  photo_ids: z.record(z.string(), z.string()),
  model: z.string(),
});
export type StoredCheckinReport = z.infer<typeof StoredCheckinReportSchema>;

export const CheckinRequestSchema = z.object({
  reservationId: z.uuid(),
  frames: z
    .array(
      z
        .string()
        .max(MAX_FRAME_CHARS)
        .regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/, "Each frame must be a JPEG data URL"),
    )
    .min(1)
    .max(MAX_CHECKIN_FRAMES),
});
export type CheckinRequest = z.infer<typeof CheckinRequestSchema>;
