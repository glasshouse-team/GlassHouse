"use client";

import { ImagePlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MAX_BATCH, MAX_PHOTOS, MAX_SIDE_PX } from "@/lib/listing-photos";

export interface ListingPhotosProps {
  listingId: string;
  photos: { id: string; url: string; room_label: string | null }[];
}

/**
 * The home's gallery photos on the dashboard, with "Add photos" (D-045). The picker has no
 * `capture`, so a phone offers its photo library as well as the camera. Each photo is shrunk
 * to MAX_SIDE_PX in the browser and sent in batches of MAX_BATCH; the server re-encodes it.
 */
export function ListingPhotos({ listingId, photos }: ListingPhotosProps) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const roomId = useId();
  const [room, setRoom] = useState("");
  const [progress, setProgress] = useState<string | null>(null);
  const left = MAX_PHOTOS - photos.length;

  async function upload(list: FileList | null) {
    const files = [...(list ?? [])].filter((f) => f.type.startsWith("image/") || f.type === "");
    if (input.current) input.current.value = "";
    if (files.length === 0) return;
    if (files.length > left) {
      toast.error(`This home can take ${left} more ${left === 1 ? "photo" : "photos"}.`);
      return;
    }
    let added = 0;
    try {
      for (let i = 0; i < files.length; i += MAX_BATCH) {
        const batch = files.slice(i, i + MAX_BATCH);
        setProgress(`Uploading ${Math.min(i + batch.length, files.length)} of ${files.length}...`);
        const form = new FormData();
        for (const file of batch) form.append("photos", await shrink(file), "photo.jpg");
        if (room.trim()) form.append("room", room.trim());
        const response = await fetch(`/api/listings/${listingId}/photos`, {
          method: "POST",
          body: form,
        });
        const body = (await response.json().catch(() => ({}))) as {
          added?: number;
          message?: string;
        };
        if (!response.ok) throw new Error(body.message ?? "Could not add the photos.");
        added += body.added ?? batch.length;
      }
      toast.success(`Added ${added} ${added === 1 ? "photo" : "photos"}.`);
      setRoom("");
    } catch (error) {
      toast.error(
        `${added > 0 ? `Added ${added}, then: ` : ""}${
          error instanceof Error ? error.message : "Could not add the photos."
        }`,
      );
    } finally {
      setProgress(null);
      router.refresh();
    }
  }

  return (
    <section className="min-w-0 space-y-3 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-medium">Photos</h3>
        <span className="text-xs text-muted-foreground">
          {photos.length} of {MAX_PHOTOS}
          {photos.length === 0 ? " · guests can't find this home in search until it has one" : ""}
        </span>
      </div>
      {photos.length > 0 && (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {photos.map((p) => (
            <li key={p.id} className="overflow-hidden rounded-md bg-muted">
              {/* Thumbnails of our own storage; next/image isn't needed for a small grid. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.url}
                alt={p.room_label ?? "Listing photo"}
                loading="lazy"
                className="aspect-square w-full object-cover"
              />
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid min-w-40 flex-1 gap-1.5">
          <Label htmlFor={roomId}>Room (optional)</Label>
          <Input
            id={roomId}
            maxLength={40}
            placeholder="Kitchen"
            value={room}
            onChange={(e) => setRoom(e.target.value)}
          />
        </div>
        <Button
          type="button"
          className="h-11 sm:h-9"
          disabled={progress !== null || left <= 0}
          onClick={() => input.current?.click()}
        >
          <ImagePlus aria-hidden /> {progress ?? "Add photos"}
        </Button>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        aria-label="Photos of the home"
        onChange={(e) => void upload(e.target.files)}
      />
    </section>
  );
}

/** The photo as a JPEG of at most MAX_SIDE_PX, so batches stay small; the original if it can't. */
async function shrink(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX_SIDE_PX / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.85),
    );
    return blob ?? file;
  } catch {
    return file;
  }
}
