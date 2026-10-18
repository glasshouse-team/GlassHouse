"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  previewHref,
  rowsToPoll,
  type VersionStatus,
  type VersionSummary,
} from "@/lib/marble-versions";
import { NewWorldVersion } from "./NewWorldVersion";

/** GH-10: only polling moves a world forward; the host page polls every 15 s. */
const POLL_MS = 15_000;

interface Panel {
  demo: boolean;
  entrySpot: string | null;
  spots: Array<{ spot: string; label: string }>;
  versions: VersionSummary[];
}

const STATUS_TEXT: Record<VersionStatus, string> = {
  generating: "Generating",
  failed: "Failed",
  ready: "Ready to publish",
  published: "Live for guests",
  archived: "Archived",
};
const STATUS_VARIANT: Record<VersionStatus, "default" | "secondary" | "destructive" | "outline"> = {
  generating: "secondary",
  failed: "destructive",
  ready: "outline",
  published: "default",
  archived: "outline",
};

async function readError(res: Response): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
  return body.message ?? body.error ?? `Request failed (HTTP ${res.status})`;
}

/**
 * Host dashboard slot (GH-5 contract; keep the name and props). Lists the 3D versions of a
 * home with status, progress, thumbnail and created time, a Preview link into the tour and
 * a Publish button, and starts a new version from a re-shot room spot. Owner: Temuri, GH-10.
 */
export function WorldVersions({ listingId }: { listingId: string }) {
  const [panel, setPanel] = useState<Panel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState<number | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/worlds?listingId=${listingId}`, { cache: "no-store" });
    if (!res.ok) {
      setError(await readError(res));
      return;
    }
    setPanel((await res.json()) as Panel);
    setError(null);
  }, [listingId]);

  useEffect(() => {
    // Fetching on mount is the point of this effect; the state updates arrive async.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const pollIds = panel ? rowsToPoll(panel.versions.flatMap((v) => v.spots)) : [];
  const pollKey = pollIds.join(",");
  useEffect(() => {
    if (!pollKey) return;
    const timer = setInterval(async () => {
      await Promise.all(
        pollKey.split(",").map((id) => fetch(`/api/worlds/${id}/status`, { cache: "no-store" })),
      );
      await load();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [pollKey, load]);

  async function publish(version: VersionSummary) {
    setPublishing(version.version);
    const res = await fetch(`/api/worlds/${version.publishRowId}/publish`, { method: "POST" });
    if (!res.ok) setError(await readError(res));
    await load();
    setPublishing(null);
  }

  return (
    <section className="rounded-xl border p-4 text-sm">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">3D versions</h2>
        {panel?.demo && <Badge variant="secondary">Demo mode: saved worlds only</Badge>}
      </div>
      {error && <p className="mt-2 text-red-600">{error}</p>}
      {!panel && !error && <p className="mt-2 text-neutral-500">Loading versions…</p>}
      {panel && panel.versions.length === 0 && (
        <p className="mt-2 text-neutral-500">No 3D version yet. Photograph a room to start one.</p>
      )}
      <ul className="mt-3 space-y-3">
        {panel?.versions.map((v) => (
          <li key={v.version} className="flex gap-3 rounded-lg border p-2">
            {v.thumbnailUrl ? (
              // Our storage URL; next/image would need the Supabase host in next.config.ts.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={v.thumbnailUrl}
                alt={`Version ${v.version} thumbnail`}
                className="h-16 w-24 shrink-0 rounded object-cover"
              />
            ) : (
              <div className="h-16 w-24 shrink-0 rounded bg-neutral-100" />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">v{v.version}</span>
                <Badge variant={STATUS_VARIANT[v.status]}>{STATUS_TEXT[v.status]}</Badge>
                <span className="text-xs text-neutral-500">
                  {new Date(v.createdAt).toLocaleString()}
                </span>
              </div>
              <p className="mt-1 text-xs text-neutral-600">
                {v.done} of {v.total} room spots done
                {v.status === "generating" && " · checks every 15 s, about 6-9 minutes a spot"}
              </p>
              <p className="mt-1 truncate text-xs text-neutral-500">
                {v.spots
                  .map((s) => `${s.spot_label ?? s.spot}: ${s.status}${s.error ? ` (${s.error})` : ""}`)
                  .join(" · ")}
              </p>
              <div className="mt-2 flex gap-2">
                <Button asChild size="xs" variant="outline">
                  <Link href={previewHref(listingId, v.version)}>Preview</Link>
                </Button>
                {v.status !== "published" && (
                  <Button
                    size="xs"
                    disabled={v.status !== "ready" && v.status !== "archived"}
                    onClick={() => publish(v)}
                  >
                    {publishing === v.version ? "Publishing…" : "Publish"}
                  </Button>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
      {panel && <NewWorldVersion listingId={listingId} spots={panel.spots} onStarted={load} />}
    </section>
  );
}
