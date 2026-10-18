"use client";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { CLIP_MAX_SECONDS } from "./logic/recording";

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
 * Fallback when the camera or recorder is unavailable: pick or film a clip with the phone's own
 * camera app (`capture="environment"`) and say which room it shows. No compass track.
 */
export function FallbackUpload({
  rooms,
  onClip,
}: {
  rooms: string[];
  onClip: (clip: FallbackClip) => void;
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

  return (
    <div className="space-y-3 rounded-xl border p-4">
      <h3 className="font-semibold">Upload a clip instead</h3>
      <p className="text-sm text-muted-foreground">
        Film one room with your camera app (at most {CLIP_MAX_SECONDS} s, a slow full turn in the
        middle), then pick it here.
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
      <Button asChild variant="outline">
        <label htmlFor={`${id}-file`} className="cursor-pointer">
          Choose or film a video
          <input
            id={`${id}-file`}
            type="file"
            accept="video/*"
            capture="environment"
            className="sr-only"
            onChange={(e) => {
              void onFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
      </Button>
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
