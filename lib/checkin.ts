/**
 * Pure rules for GH-23 check-in verification (owner: Beka): who may check in, frame labels,
 * which listing photos go with them, cleaning the Verifier's answer and the feed line.
 */
import type { CheckinReport, CheckinSeverity } from "@/lib/schemas/checkin";

/** At most 8 listing photos go to the Verifier, next to at most 8 frames. */
export const MAX_LISTING_PHOTOS = 8;

/** frame_01, frame_02 ... in the order the browser took them. */
export function frameIds(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `frame_${String(i + 1).padStart(2, "0")}`);
}

export interface CheckinViewer {
  role: "guest" | "host";
  profileId: string;
}

export interface CheckinReservation {
  guest_id: string;
  status: string;
}

/** Why this viewer may not check in to this reservation, or null when they may. */
export function checkinProblem(
  viewer: CheckinViewer,
  reservation: CheckinReservation | null,
): { status: 403 | 404 | 409; code: string; message: string } | null {
  if (!reservation)
    return { status: 404, code: "not_found", message: "This reservation does not exist." };
  if (viewer.role !== "guest")
    return { status: 403, code: "guests_only", message: "Switch to the guest view to check in." };
  if (reservation.guest_id !== viewer.profileId)
    return {
      status: 403,
      code: "not_your_trip",
      message: "Only the guest of this reservation can check in.",
    };
  if (reservation.status === "cancelled")
    return { status: 409, code: "cancelled", message: "This reservation was cancelled." };
  return null;
}

export interface PhotoRef {
  id: string;
  url: string;
  room_label: string | null;
  sort: number;
}

/**
 * Up to `max` listing photos, spread over rooms: the first photo of each room first (in sort
 * order), then the rest in sort order. Labelled photo_01.. in the order they are sent.
 */
export function pickListingPhotos(
  photos: PhotoRef[],
  max = MAX_LISTING_PHOTOS,
): { label: string; photo: PhotoRef }[] {
  const sorted = [...photos].sort((a, b) => a.sort - b.sort || a.id.localeCompare(b.id));
  const seenRooms = new Set<string>();
  const first: PhotoRef[] = [];
  const rest: PhotoRef[] = [];
  for (const photo of sorted) {
    const room = photo.room_label?.trim().toLowerCase() || `#${photo.id}`;
    if (seenRooms.has(room)) rest.push(photo);
    else {
      seenRooms.add(room);
      first.push(photo);
    }
  }
  return [...first, ...rest]
    .slice(0, max)
    .map((photo, i) => ({ label: `photo_${String(i + 1).padStart(2, "0")}`, photo }));
}

const SEVERITY_ORDER: Record<CheckinSeverity, number> = { high: 0, medium: 1, low: 2 };

/**
 * The rules the schema cannot hold: findings must cite a frame we sent (others are dropped),
 * ids are normalised, an unknown listing photo becomes "", empty text goes, repeats go, and
 * differences are ordered by severity (high first).
 */
export function cleanReport(
  raw: CheckinReport,
  frames: string[],
  photoLabels: string[],
): CheckinReport {
  const frameSet = new Set(frames);
  const photoSet = new Set(photoLabels);
  const id = (value: string) => value.trim().toLowerCase();
  const text = (value: string) => value.replace(/\s+/g, " ").trim();
  const seen = new Set<string>();
  const once = (key: string) => (seen.has(key) ? false : (seen.add(key), true));

  const matches = raw.matches
    .map((m) => ({
      room: text(m.room),
      item: text(m.item),
      evidence_frame: id(m.evidence_frame),
    }))
    .filter((m) => m.item && frameSet.has(m.evidence_frame))
    .filter((m) => once(`m|${m.room.toLowerCase()}|${m.item.toLowerCase()}`));

  const differences = raw.differences
    .map((d) => ({
      room: text(d.room),
      listed: text(d.listed),
      seen: text(d.seen),
      evidence_frame: id(d.evidence_frame),
      listing_photo: photoSet.has(id(d.listing_photo)) ? id(d.listing_photo) : "",
      severity: d.severity,
    }))
    .filter((d) => d.seen && frameSet.has(d.evidence_frame))
    .filter((d) => once(`d|${d.room.toLowerCase()}|${d.seen.toLowerCase()}`))
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  const missing_items = raw.missing_items
    .map(text)
    .filter(Boolean)
    .filter((m) => once(`x|${m.toLowerCase()}`));

  return { matches, differences, missing_items };
}

export interface SeveritySummary {
  high: number;
  medium: number;
  low: number;
  total: number;
}

export function severitySummary(report: Pick<CheckinReport, "differences">): SeveritySummary {
  const summary: SeveritySummary = { high: 0, medium: 0, low: 0, total: 0 };
  for (const d of report.differences) {
    summary[d.severity] += 1;
    summary.total += 1;
  }
  return summary;
}

/** A high-severity difference lets the guest open an issue with the host. */
export function needsIssue(report: Pick<CheckinReport, "differences">): boolean {
  return report.differences.some((d) => d.severity === "high");
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** "Verifier compared Nino's arrival with the listing: 1 difference (1 high)". */
export function checkinFeedLine(guestName: string, report: CheckinReport): string {
  const s = severitySummary(report);
  const result =
    s.total === 0
      ? "no differences"
      : `${plural(s.total, "difference")}${s.high > 0 ? ` (${s.high} high)` : ""}`;
  return `Verifier compared ${guestName}'s arrival with the listing: ${result}`;
}
