/**
 * Groups a listing's unresolved gaps for the host dashboard's GapTasks slot (GH-19): one entry
 * per 3D version (published first, then newest), rooms inside, with the version's coverage
 * (D-031 mean over its spot rows, lib/coverage.ts). Pure, no I/O.
 */
import { publishedCoverage, type CoverageWorld, type ListingCoverage } from "@/lib/coverage";

/** The worlds columns the grouping needs. */
export interface GapTaskWorld extends CoverageWorld {
  spot_label: string | null;
}

/** The gaps columns the list shows. */
export interface GapTaskGap {
  id: string;
  world_id: string;
  room: string | null;
  description: string;
  severity: number;
  status: string;
}

/** Gaps the host still has to act on; filled and dismissed ones drop out. */
export const UNRESOLVED_STATUSES: readonly string[] = ["open", "requested"];

export interface GapTaskRoom {
  spot: string;
  room: string;
  /** Most severe first. */
  gaps: GapTaskGap[];
  href: string;
}

export interface GapTaskVersion {
  version: number;
  published: boolean;
  coverage: ListingCoverage | null;
  rooms: GapTaskRoom[];
}

/** The tour link for one room of one version (the tour reads ?version= and ?spot=). */
export function gapTourHref(listingId: string, version: number, spot: string): string {
  return `/tour/${listingId}?version=${version}&spot=${encodeURIComponent(spot)}`;
}

/**
 * "Record now": the phone capture page in fill-in mode for one gap (GH-22 reads `?gap=`, shows
 * the gap's room and instruction and records a fill-in clip; POST /api/captures then moves the
 * gap to `requested`).
 */
export function recordNowHref(listingId: string, gapId: string): string {
  return `/host/capture/${encodeURIComponent(listingId)}?gap=${encodeURIComponent(gapId)}`;
}

/** Button text: a requested gap was already started once, so it reads "Record again". */
export function recordNowLabel(status: string): string {
  return status === "requested" ? "Record again" : "Record now";
}

const SEVERITY: Record<number, string> = { 1: "Minor", 2: "Noticeable", 3: "Major" };

/** "Major" for severity 3. */
export function severityLabel(severity: number): string {
  return SEVERITY[severity] ?? `Severity ${severity}`;
}

/**
 * Versions to show: every version with at least one spot row that is not archived or failed
 * (a failed or archived version is not something the host can publish or fix). Gaps attach to
 * their world's (version, spot); a gap on a world the list does not hold is left out.
 */
export function groupGapTasks(
  listingId: string,
  worlds: readonly GapTaskWorld[],
  gaps: readonly GapTaskGap[],
  publishedWorldId: string | null,
): GapTaskVersion[] {
  const published = worlds.find((w) => w.id === publishedWorldId);
  const byVersion = new Map<number, GapTaskWorld[]>();
  for (const w of worlds) {
    if (w.listing_id !== listingId) continue;
    byVersion.set(w.version, [...(byVersion.get(w.version) ?? []), w]);
  }

  const worldById = new Map(worlds.map((w) => [w.id, w]));
  const open = gaps.filter((g) => UNRESOLVED_STATUSES.includes(g.status));

  return [...byVersion.entries()]
    .filter(
      ([version, rows]) =>
        version === published?.version ||
        rows.some((r) => r.status !== "archived" && r.status !== "failed"),
    )
    .map(([version, rows]): GapTaskVersion => {
      const rooms = new Map<string, GapTaskRoom>();
      for (const gap of open) {
        const world = worldById.get(gap.world_id);
        if (!world || world.listing_id !== listingId || world.version !== version) continue;
        const room = rooms.get(world.spot) ?? {
          spot: world.spot,
          room: gap.room ?? world.spot_label ?? world.spot,
          gaps: [],
          href: gapTourHref(listingId, version, world.spot),
        };
        room.gaps.push(gap);
        rooms.set(world.spot, room);
      }
      for (const room of rooms.values()) room.gaps.sort((a, b) => b.severity - a.severity);
      return {
        version,
        published: version === published?.version,
        coverage: publishedCoverage(rows[0].id, rows),
        rooms: [...rooms.values()].sort((a, b) => a.room.localeCompare(b.room)),
      };
    })
    .sort((a, b) => Number(b.published) - Number(a.published) || b.version - a.version);
}
