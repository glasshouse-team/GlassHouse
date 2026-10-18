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
   * A thumbnail that tells this version apart: the entry spot's when no other version
   * shows that image, else the first spot whose image is this version's own (the re-shot
   * room, since copied spots share files, D-031), else the entry spot's.
   */
  thumbnailUrl: string | null;
  /** The label of the spot the thumbnail shows. */
  thumbnailSpot: string | null;
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

/** Groups spot rows into versions, newest first. `entrySpot` picks the thumbnail. */
export function summarizeVersions(
  rows: WorldVersionRow[],
  entrySpot?: string | null,
): VersionSummary[] {
  const byVersion = new Map<number, WorldVersionRow[]>();
  /** Thumbnail URL -> the versions that show it. */
  const thumbVersions = new Map<string, Set<number>>();
  for (const row of rows) {
    byVersion.set(row.version, [...(byVersion.get(row.version) ?? []), row]);
    if (row.thumbnail_url) {
      const versions = thumbVersions.get(row.thumbnail_url) ?? new Set<number>();
      versions.add(row.version);
      thumbVersions.set(row.thumbnail_url, versions);
    }
  }
  const ownThumb = (s: WorldVersionRow) =>
    !!s.thumbnail_url && thumbVersions.get(s.thumbnail_url)?.size === 1;
  return [...byVersion.entries()]
    .sort(([a], [b]) => b - a)
    .map(([version, spots]) => {
      const sorted = [...spots].sort(
        (a, b) =>
          Number(b.spot === entrySpot) - Number(a.spot === entrySpot) ||
          a.spot.localeCompare(b.spot),
      );
      const entry = sorted[0];
      const thumb =
        sorted.find(ownThumb) ??
        (entry.thumbnail_url ? entry : sorted.find((s) => s.thumbnail_url)) ??
        null;
      return {
        version,
        status: versionStatus(sorted.map((s) => s.status)),
        spots: sorted,
        done: sorted.filter((s) => FINISHED.includes(s.status)).length,
        total: sorted.length,
        thumbnailUrl: thumb?.thumbnail_url ?? null,
        thumbnailSpot: thumb ? (thumb.spot_label ?? thumb.spot) : null,
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
