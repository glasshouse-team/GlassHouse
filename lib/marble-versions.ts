/**
 * World versions as the host sees them (owner: Temuri, GH-10). Pure and client-safe: the
 * WorldVersions panel and GET /api/worlds both use it. A version is a set of spot rows
 * (D-009); every version holds one row per spot of the home (D-031).
 */
import type { WorldStatus } from "./schemas/world";

/** The `worlds` columns the versions panel needs. */
export interface WorldVersionRow {
  id: string;
  version: number;
  spot: string;
  spot_label: string | null;
  status: WorldStatus;
  thumbnail_url: string | null;
  error: string | null;
  created_at: string;
  ready_at: string | null;
  published_at: string | null;
  cost_credits: number | null;
}

export const VERSION_ROW_COLUMNS =
  "id,version,spot,spot_label,status,thumbnail_url,error,created_at,ready_at,published_at,cost_credits";

export type VersionStatus = "generating" | "failed" | "ready" | "published" | "archived";

export interface VersionSummary {
  version: number;
  status: VersionStatus;
  spots: WorldVersionRow[];
  /** Spots finished (ready, published or archived) out of all spots. */
  done: number;
  total: number;
  /**
   * Thumbnail of the entry spot, else of the first spot that has one. When that spot is a
   * copy (D-031), a spot this version shot itself is shown instead if it has a thumbnail.
   */
  thumbnailUrl: string | null;
  /** Room name of the thumbnail's spot. */
  thumbnailLabel: string | null;
  /** The version whose world files this thumbnail reuses (D-031), else null. */
  thumbnailSameAs: number | null;
  createdAt: string;
  /** Credits this version cost (copied spots cost 0, D-031). */
  credits: number;
  /** A row to pass to /api/worlds/[id]/publish. */
  publishRowId: string;
}

const FINISHED: WorldStatus[] = ["ready", "published", "archived"];

/**
 * One status for a whole version: any spot still running makes it "generating", then any
 * failed spot makes it "failed"; a version is "published" or "archived" only when every
 * spot is, else "ready".
 */
export function versionStatus(statuses: WorldStatus[]): VersionStatus {
  if (statuses.some((s) => s === "queued" || s === "generating")) return "generating";
  if (statuses.some((s) => s === "failed")) return "failed";
  if (statuses.length && statuses.every((s) => s === "published")) return "published";
  if (statuses.length && statuses.every((s) => s === "archived")) return "archived";
  return "ready";
}

/** Copied spot rows cost 0 credits (D-031); fresh ones carry the spot's cost. */
const isCopy = (row: WorldVersionRow) => row.cost_credits === 0;

/** The row whose thumbnail stands for a version: the entry spot, unless it is a copy. */
function thumbnailRow(sorted: WorldVersionRow[]): WorldVersionRow | null {
  const withThumb = sorted.filter((s) => s.thumbnail_url);
  const first = withThumb[0] ?? null;
  if (!first || !isCopy(first)) return first;
  return withThumb.find((s) => !isCopy(s)) ?? first;
}

/**
 * For a copied thumbnail row, the other version that holds the same picture: the one whose
 * row is not a copy, else the newest other one. Null when the picture is this version's own.
 */
function sameAsVersion(row: WorldVersionRow | null, rows: WorldVersionRow[]): number | null {
  if (!row || !isCopy(row)) return null;
  const twins = rows
    .filter((r) => r.version !== row.version && r.thumbnail_url === row.thumbnail_url)
    .sort((a, b) => Number(isCopy(a)) - Number(isCopy(b)) || b.version - a.version);
  return twins[0]?.version ?? null;
}

/** Groups spot rows into versions, newest first. `entrySpot` picks the thumbnail. */
export function summarizeVersions(
  rows: WorldVersionRow[],
  entrySpot?: string | null,
): VersionSummary[] {
  const byVersion = new Map<number, WorldVersionRow[]>();
  for (const row of rows) {
    byVersion.set(row.version, [...(byVersion.get(row.version) ?? []), row]);
  }
  return [...byVersion.entries()]
    .sort(([a], [b]) => b - a)
    .map(([version, spots]) => {
      const sorted = [...spots].sort(
        (a, b) =>
          Number(b.spot === entrySpot) - Number(a.spot === entrySpot) ||
          a.spot.localeCompare(b.spot),
      );
      const entry = sorted[0];
      const thumb = thumbnailRow(sorted);
      return {
        version,
        status: versionStatus(sorted.map((s) => s.status)),
        spots: sorted,
        done: sorted.filter((s) => FINISHED.includes(s.status)).length,
        total: sorted.length,
        thumbnailUrl: thumb?.thumbnail_url ?? null,
        thumbnailLabel: thumb ? (thumb.spot_label ?? thumb.spot) : null,
        thumbnailSameAs: sameAsVersion(thumb, rows),
        createdAt: sorted.map((s) => s.created_at).sort()[sorted.length - 1],
        credits: sorted.reduce((n, s) => n + (s.cost_credits ?? 0), 0),
        publishRowId: entry.id,
      };
    });
}

/** Spot rows the host page must poll (GH-10: only polling moves a world forward). */
export function rowsToPoll(rows: Pick<WorldVersionRow, "id" | "status">[]): string[] {
  return rows.filter((r) => r.status === "generating").map((r) => r.id);
}

/** The guest tour URL for previewing one version. */
export function previewHref(listingId: string, version: number): string {
  return `/tour/${listingId}?version=${version}`;
}
