import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { formatCoverage } from "@/lib/coverage";
import { hasSupabaseEnv, supabaseAdmin } from "@/lib/supabase";
import {
  groupGapTasks,
  recordNowHref,
  recordNowLabel,
  severityLabel,
  type GapTaskVersion,
} from "./gap-tasks";

const STATUS_TEXT: Record<string, string> = { open: "Open", requested: "Re-shoot requested" };

async function loadGapTasks(listingId: string): Promise<GapTaskVersion[] | null> {
  if (!hasSupabaseEnv()) return null;
  const db = supabaseAdmin();
  const [{ data: listing, error: listingError }, { data: worlds, error: worldsError }] =
    await Promise.all([
      db.from("listings").select("published_world_id").eq("id", listingId).maybeSingle(),
      db
        .from("worlds")
        .select("id, listing_id, version, spot, spot_label, status, coverage_score")
        .eq("listing_id", listingId),
    ]);
  if (listingError || worldsError) throw listingError ?? worldsError;
  const rows = worlds ?? [];
  const ids = rows.map((w) => w.id);
  const { data: gaps, error: gapsError } = ids.length
    ? await db
        .from("gaps")
        .select("id, world_id, room, description, severity, status")
        .in("world_id", ids)
        .in("status", ["open", "requested"])
    : { data: [], error: null };
  if (gapsError) throw gapsError;
  return groupGapTasks(
    listingId,
    rows.map((w) => ({
      ...w,
      coverage_score: w.coverage_score === null ? null : Number(w.coverage_score),
    })),
    gaps ?? [],
    listing?.published_world_id ?? null,
  );
}

/**
 * Host dashboard slot (GH-5 contract; keep the name and props; built in GH-19). The AI-filled
 * areas of each 3D version, by room, with a link to that room in the tour, and the version's
 * coverage. Reads saved `gaps` rows only; nothing here runs a check or calls a model.
 */
export async function GapTasks({ listingId }: { listingId: string }) {
  let versions: GapTaskVersion[] | null;
  try {
    versions = await loadGapTasks(listingId);
  } catch (error) {
    console.error("[gaps] load", listingId, error);
    versions = null;
  }

  return (
    // contain-inline-size: long descriptions never widen the dashboard grid on phones.
    <section className="min-w-0 rounded-xl border p-3 text-sm [contain:inline-size] sm:p-4">
      <h2 className="font-semibold">AI-filled areas</h2>
      <p className="mt-1 text-xs text-neutral-500">
        Parts of the 3D the photos did not cover, so the model filled them in. Re-shoot them to
        raise the share filmed.
      </p>
      {versions === null && (
        <p className="mt-2 text-neutral-500">
          Could not load the AI-filled areas. Reload the page.
        </p>
      )}
      {versions?.length === 0 && <p className="mt-2 text-neutral-500">No 3D version yet.</p>}
      <ul className="mt-3 space-y-3">
        {versions?.map((v) => (
          <li key={v.version} className="min-w-0 rounded-lg border p-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">v{v.version}</span>
              {v.published && <Badge>Live for guests</Badge>}
              {v.coverage && (
                <span className="text-xs text-neutral-600">{formatCoverage(v.coverage.score)}</span>
              )}
            </div>
            {v.rooms.length === 0 ? (
              <p className="mt-1 text-xs text-neutral-500">
                {v.published
                  ? "No AI-filled areas found in the published version."
                  : "No AI-filled areas found in this version."}
              </p>
            ) : (
              <ul className="mt-2 space-y-2">
                {v.rooms.map((room) => (
                  <li key={room.spot} className="min-w-0 space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium [overflow-wrap:anywhere]">{room.room}</span>
                      {/* 44 px tall on phones (touch target), compact from sm up. */}
                      <Link
                        href={room.href}
                        className="inline-flex h-11 items-center rounded-md border px-3 text-xs font-medium hover:bg-neutral-50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:h-8 dark:hover:bg-neutral-900"
                      >
                        View in 3D
                      </Link>
                    </div>
                    <ul className="space-y-1.5">
                      {room.gaps.map((gap) => (
                        <li
                          key={gap.id}
                          className="min-w-0 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-950 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-100"
                        >
                          <div className="flex flex-wrap items-center gap-1.5 font-medium">
                            <span>{severityLabel(gap.severity)}</span>
                            <span aria-hidden>·</span>
                            <span>{STATUS_TEXT[gap.status] ?? gap.status}</span>
                          </div>
                          <p className="mt-1 [overflow-wrap:anywhere]">{gap.description}</p>
                          {/* Opens the phone capture page for exactly this spot (GH-22 fill-in). */}
                          <Link
                            href={recordNowHref(listingId, gap.id)}
                            className="mt-2 inline-flex h-11 items-center rounded-md bg-amber-900 px-3 font-medium text-amber-50 hover:bg-amber-800 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:h-8 dark:bg-amber-200 dark:text-amber-950 dark:hover:bg-amber-100"
                          >
                            {recordNowLabel(gap.status)}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
