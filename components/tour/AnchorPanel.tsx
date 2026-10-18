"use client";

/**
 * Anchor mode (`?anchors=1`, dev only, GH-11): click a surface in the room, name it and save
 * `{ name, kind, room, position: camera eye, look_at: clicked point }` (D-014) through
 * POST /api/worlds/[id]/anchors. Lists and deletes the current spot's anchors.
 */
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { AnchorSchema, type Anchor } from "@/lib/schemas/world";
import { useTourInternal } from "./TourProvider";
import type { AnchorPick } from "./Viewer";
import { spotLabel } from "./spots";

const round = (v: number) => Math.round(v * 1000) / 1000;
const r3 = (p: { x: number; y: number; z: number }) => ({
  x: round(p.x),
  y: round(p.y),
  z: round(p.z),
});

export function AnchorPanel({ pick, onDone }: { pick: AnchorPick | null; onDone: () => void }) {
  const { current, allAnchors, setAllAnchors } = useTourInternal();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<Anchor["kind"]>("object");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const here = allAnchors.filter((a) => a.world_id === current.id);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!pick || !name.trim()) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/worlds/${current.id}/anchors`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          kind,
          room: spotLabel(current),
          position: r3(pick.eye),
          // A room anchor is the room's default view; objects and viewpoints look at the point.
          look_at: r3(pick.hit),
        }),
      });
      const body: unknown = await res.json();
      if (!res.ok) throw new Error((body as { message?: string }).message ?? `HTTP ${res.status}`);
      const anchor = AnchorSchema.parse((body as { anchor: unknown }).anchor);
      setAllAnchors((list) => [...list, anchor]);
      setName("");
      setMessage(`Saved "${anchor.name}".`);
      onDone();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(anchor: Anchor) {
    const res = await fetch(`/api/worlds/${current.id}/anchors?anchorId=${anchor.id}`, {
      method: "DELETE",
    });
    if (res.ok) setAllAnchors((list) => list.filter((a) => a.id !== anchor.id));
    else setMessage(`Could not delete (HTTP ${res.status}).`);
  }

  return (
    <aside className="pointer-events-auto absolute right-3 bottom-3 z-40 w-72 max-w-[calc(100vw-1.5rem)] space-y-2 rounded-xl bg-white/95 p-3 text-sm text-neutral-900 shadow-lg">
      <p className="font-semibold">Anchor mode: {spotLabel(current)}</p>
      {pick ? (
        <form onSubmit={save} className="space-y-2">
          <p className="text-xs text-neutral-600">
            Point at ({pick.hit.x.toFixed(2)}, {pick.hit.y.toFixed(2)}, {pick.hit.z.toFixed(2)}) m
          </p>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="desk, bed, sofa, window, Kitchen"
            className="w-full rounded-md border px-2 py-1.5"
            aria-label="Anchor name"
          />
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as Anchor["kind"])}
            className="w-full rounded-md border px-2 py-1.5"
            aria-label="Anchor kind"
          >
            <option value="room">room</option>
            <option value="object">object</option>
            <option value="viewpoint">viewpoint</option>
          </select>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="rounded-md bg-neutral-900 px-3 py-1.5 font-medium text-white disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save anchor"}
            </button>
            <button type="button" onClick={onDone} className="rounded-md border px-3 py-1.5">
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <p className="text-xs text-neutral-600">
          Look at a thing (or the room), then click it. The camera eye is saved as the position.
        </p>
      )}
      {message && <p className="text-xs">{message}</p>}
      <ul className="max-h-40 space-y-1 overflow-y-auto">
        {here.map((a) => (
          <li key={a.id} className="flex items-center justify-between gap-2">
            <span className="truncate">
              {a.name} <span className="text-neutral-500">({a.kind})</span>
            </span>
            <button
              type="button"
              onClick={() => void remove(a)}
              aria-label={`Delete ${a.name}`}
              className="rounded p-1 hover:bg-neutral-100"
            >
              <Trash2 className="size-4" aria-hidden />
            </button>
          </li>
        ))}
        {here.length === 0 && (
          <li className="text-xs text-neutral-500">No anchors in this room yet.</li>
        )}
      </ul>
    </aside>
  );
}
