"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabaseBrowser } from "@/lib/supabase";

const NEW_SPOT = "__new__";

interface SignedUploadInfo {
  bucket: string;
  path: string;
  token: string;
}

async function readError(res: Response): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
  return body.message ?? body.error ?? `Request failed (HTTP ${res.status})`;
}

/**
 * Starts a new version from the dashboard (GH-10): pick a room spot (or name a new one),
 * add its 8-photo ring in turning order (or one prepared mp4 of 30 s or less), and the
 * photos go to our storage, then POST /api/worlds starts one generation for that spot;
 * the other spots are copied from the live version (D-031). Owner: Temuri.
 */
export function NewWorldVersion({
  listingId,
  spots,
  onStarted,
}: {
  listingId: string;
  spots: Array<{ spot: string; label: string }>;
  onStarted: () => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const [spot, setSpot] = useState(spots[0]?.spot ?? NEW_SPOT);
  const [newLabel, setNewLabel] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  if (!open) {
    return (
      <Button className="mt-3" size="sm" variant="outline" onClick={() => setOpen(true)}>
        New version from a room spot
      </Button>
    );
  }

  const label = spot === NEW_SPOT ? newLabel.trim() : spots.find((s) => s.spot === spot)?.label;
  const isVideo = files.length === 1 && files[0].type === "video/mp4";
  const valid = Boolean(label) && (isVideo || (files.length >= 2 && files.length <= 8));

  async function start() {
    if (!label) return;
    setMessage(null);
    try {
      setBusy("Registering the capture…");
      const created = await fetch("/api/captures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingId,
          kind: isVideo ? "walkthrough" : "ring",
          room: label,
          files: files.map((f) => ({ contentType: f.type, size: f.size })),
        }),
      });
      if (!created.ok) throw new Error(await readError(created));
      const { captureId, uploads } = (await created.json()) as {
        captureId: string;
        uploads: SignedUploadInfo[];
      };
      const storage = supabaseBrowser().storage;
      for (const [i, upload] of uploads.entries()) {
        setBusy(`Uploading ${i + 1} of ${uploads.length}…`);
        const { error } = await storage
          .from(upload.bucket)
          .uploadToSignedUrl(upload.path, upload.token, files[i], { contentType: files[i].type });
        if (error) throw new Error(`Upload failed: ${error.message}`);
      }
      setBusy("Starting the 3D generation…");
      const started = await fetch("/api/worlds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId, captureIds: [captureId] }),
      });
      if (!started.ok) throw new Error(await readError(started));
      const result = (await started.json()) as {
        demo: boolean;
        version: number;
        failed: Array<{ error: string }>;
      };
      setMessage(
        result.demo
          ? `Demo mode: nothing was generated; showing saved v${result.version}.`
          : result.failed.length
            ? `v${result.version} could not start: ${result.failed[0].error}`
            : `v${result.version} is generating (about 6-9 minutes).`,
      );
      setFiles([]);
      await onStarted();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-3 space-y-2 rounded-lg border border-dashed p-3">
      <p className="font-medium">New version from a room spot</p>
      <label className="block text-xs text-neutral-600">
        Room spot
        <select
          className="mt-1 block w-full rounded-md border px-2 py-1 text-sm"
          value={spot}
          onChange={(e) => setSpot(e.target.value)}
        >
          {spots.map((s) => (
            <option key={s.spot} value={s.spot}>
              Re-shoot {s.label}
            </option>
          ))}
          <option value={NEW_SPOT}>A new room spot…</option>
        </select>
      </label>
      {spot === NEW_SPOT && (
        <Input
          placeholder="Room name, e.g. Balcony"
          maxLength={40}
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
        />
      )}
      <label className="block text-xs text-neutral-600">
        8 photos from the middle of the room, turning right about 45 degrees each (JPEG, PNG or
        WebP, in order), or one prepared mp4 of 30 s or less
        <input
          className="mt-1 block w-full text-sm"
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,video/mp4"
          onChange={(e) =>
            setFiles(
              [...(e.target.files ?? [])].sort((a, b) =>
                a.name.localeCompare(b.name, "en", { numeric: true }),
              ),
            )
          }
        />
      </label>
      {files.length > 0 && !valid && (
        <p className="text-xs text-red-600">Pick 2 to 8 photos or one mp4.</p>
      )}
      <div className="flex gap-2">
        <Button size="sm" disabled={!valid || busy !== null} onClick={start}>
          {busy ?? "Upload and generate (1,600 credits)"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
      {message && <p className="text-xs text-neutral-700">{message}</p>}
    </div>
  );
}
