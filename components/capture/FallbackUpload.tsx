"use client";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { MAX_RING_FILES, RING_PHOTOS } from "./logic/coverage";
import { CLIP_MAX_SECONDS } from "./logic/recording";

/** A ring picked from the gallery: photos in turning order, no compass (D-009 ring, D-037). */
export interface FallbackRing {
  photos: Blob[];
  room: string;
}

/** The longest side kept for a gallery ring photo; the server takes JPEGs up to 15 MB. */
const RING_MAX_SIDE_PX = 4096;

/**
 * A gallery photo as an upright JPEG: always re-drawn, so a portrait shot whose orientation
 * lives only in its EXIF tag comes out the right way up (HEIC and PNG too, where the browser
 * can decode them).
 */
async function toJpeg(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, RING_MAX_SIDE_PX / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.9),
  );
  if (!blob) throw new Error("Could not read one of the photos.");
  return blob;
}

export interface FallbackClip {
  blob: Blob;
  durationS: number;
  room: string;
}

const TYPES: Record<string, string> = {
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
};

function normalizeType(file: File): string | null {
  if (["video/mp4", "video/webm", "video/quicktime"].includes(file.type)) return file.type;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return TYPES[ext] ?? null;
}

function readDuration(file: Blob): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(video.duration);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read this video."));
    };
    video.src = url;
  });
}

/**
 * Upload instead of shooting live (gallery picks, D-037): a clip, or a ring of ${RING_PHOTOS} photos, picked from
 * the phone's gallery or filmed with its camera app (no `capture` attribute, so the phone
 * offers both), plus the room it shows. No compass track.
 */
export function FallbackUpload({
  rooms,
  onClip,
  onRing,
}: {
  rooms: string[];
  onClip: (clip: FallbackClip) => void;
  /** Leave out where rings don't apply (fill-in clips). */
  onRing?: (ring: FallbackRing) => void;
}) {
  const id = useId();
  const [room, setRoom] = useState(rooms[0] ?? "");
  const [error, setError] = useState<string | null>(null);

  async function onFile(file: File | undefined) {
    setError(null);
    if (!file) return;
    const type = normalizeType(file);
    if (!type) return setError("Use an mp4, mov or webm video.");
    let durationS: number;
    try {
      durationS = await readDuration(file);
    } catch (e) {
      return setError((e as Error).message);
    }
    if (!Number.isFinite(durationS) || durationS <= 0) durationS = CLIP_MAX_SECONDS;
    if (durationS > CLIP_MAX_SECONDS + 1)
      return setError(
        `This clip is ${Math.round(durationS)} s. World Labs takes ${CLIP_MAX_SECONDS} s at most: film one room per clip, or speed it up with pnpm video:prepare.`,
      );
    onClip({ blob: new Blob([file], { type }), durationS: Math.round(durationS * 10) / 10, room });
  }

  async function onPhotos(list: FileList | null) {
    setError(null);
    const files = [...(list ?? [])];
    if (files.length === 0 || !onRing) return;
    if (files.length < RING_PHOTOS || files.length > MAX_RING_FILES)
      return setError(
        `Pick ${RING_PHOTOS} photos of this room taken from its middle while turning (then up to ${MAX_RING_FILES - RING_PHOTOS} doorway photos, shot after the ring); you picked ${files.length}.`,
      );
    // Taken one after another while turning: the capture time gives the turning order.
    files.sort((a, b) => a.lastModified - b.lastModified || a.name.localeCompare(b.name));
    try {
      onRing({ photos: await Promise.all(files.map(toJpeg)), room });
    } catch (e) {
      setError(`${(e as Error).message} Use JPEG photos.`);
    }
  }

  return (
    <div className="space-y-3 rounded-xl border p-4">
      <h3 className="font-semibold">Upload from your phone instead</h3>
      <p className="text-sm text-muted-foreground">
        Pick a clip of one room (at most {CLIP_MAX_SECONDS} s, a slow full turn in the middle)
        {onRing
          ? ` or ${RING_PHOTOS} photos taken from its middle while turning (doorway photos, if any, shot after them)`
          : ""}{" "}
        from your gallery, or film it now with the camera app.
      </p>
      <div className="space-y-1">
        <Label htmlFor={`${id}-room`}>Room in this clip</Label>
        <select
          id={`${id}-room`}
          className="h-9 w-full rounded-md border bg-background px-2 text-sm"
          value={room}
          onChange={(e) => setRoom(e.target.value)}
        >
          {rooms.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline">
          <label htmlFor={`${id}-file`} className="cursor-pointer">
            Choose or film a video
            <input
              id={`${id}-file`}
              type="file"
              accept="video/*"
              className="sr-only"
              onChange={(e) => {
                void onFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
        </Button>
        {onRing && (
          <Button asChild variant="outline">
            <label htmlFor={`${id}-photos`} className="cursor-pointer">
              Choose {RING_PHOTOS} photos
              <input
                id={`${id}-photos`}
                type="file"
                accept="image/*"
                multiple
                className="sr-only"
                onChange={(e) => {
                  void onPhotos(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
          </Button>
        )}
      </div>
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
