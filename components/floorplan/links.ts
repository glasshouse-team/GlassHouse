/**
 * Links from the floor plan into the tour (owner: Temuri, GH-18). The GH-11 tour starts at
 * `?anchor=<id>` (any anchor of the version), so a room links to its room anchor: the auto one
 * the floor-plan build saves at the spot, else the oldest hand-placed room anchor. `spot` rides
 * along so the link still names the room if the anchor is gone.
 */

export interface RoomAnchorRow {
  id: string;
  world_id: string;
  kind: string;
  source: string;
  created_at: string;
}

/** World id -> the room anchor to start at (auto first, then the oldest manual one). */
export function pickRoomAnchors(rows: RoomAnchorRow[]): Map<string, string> {
  const rank = (r: RoomAnchorRow) => (r.source === "auto" ? 0 : 1);
  const best = new Map<string, RoomAnchorRow>();
  for (const row of rows) {
    if (row.kind !== "room") continue;
    const cur = best.get(row.world_id);
    if (
      !cur ||
      rank(row) < rank(cur) ||
      (rank(row) === rank(cur) && row.created_at < cur.created_at)
    )
      best.set(row.world_id, row);
  }
  return new Map([...best].map(([world, row]) => [world, row.id]));
}

/** `/tour/<listing>?anchor=<id>&spot=<spot>`, or only `?spot=` without an anchor. */
export function roomHref(listingId: string, spot: string, anchorId: string | null): string {
  const params = new URLSearchParams();
  if (anchorId) params.set("anchor", anchorId);
  params.set("spot", spot);
  return `/tour/${encodeURIComponent(listingId)}?${params.toString()}`;
}
