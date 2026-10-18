"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { CameraView, WarningBanner } from "./CameraView";
import { CoverageRing } from "./CoverageRing";
import {
  MAX_DOORWAY_PHOTOS as MAX_DOORWAYS,
  RING_PHOTOS,
  aimHint,
  ringCoverage,
  ringTarget,
} from "./logic/coverage";
import type { HeadingSample } from "./logic/heading";
import { qualityFlags } from "./logic/warnings";
import { grabPhoto, useHeading, useWakeLock } from "./sensors";
import { useLiveWarnings } from "./useLiveWarnings";

interface Photo {
  blob: Blob;
  heading: number | null;
  t: number;
  doorway: boolean;
}

export interface RingResult {
  /** 8 ring photos in turning order, then the doorway photos. */
  photos: Blob[];
  /** One sample per photo, same order; empty when the compass is off. */
  headingTrack: HeadingSample[];
  qualityFlags: string[];
}

/**
 * One spot's 8-photo ring (D-009): stand in the middle, take a photo, turn right 45 degrees,
 * repeat. The ring shows the next direction; then one photo centred on each doorway.
 */
export function RingCapture({
  stream,
  room,
  roomIndex,
  roomCount,
  compass,
  onDone,
  onSkip,
  onCancel,
}: {
  stream: MediaStream;
  room: string;
  roomIndex: number;
  roomCount: number;
  compass: boolean;
  onDone: (ring: RingResult) => void;
  onSkip: () => void;
  onCancel: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const startRef = useRef(0);
  const samplesRef = useRef<HeadingSample[]>([]);
  const [samples, setSamples] = useState<HeadingSample[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [busy, setBusy] = useState(false);
  // A ref, not state: two taps in one frame must not both pass the check.
  const busyRef = useRef(false);
  const lastShotRef = useRef(0);
  const { heading, headingRef } = useHeading(compass);
  const { warnings, historyRef } = useLiveWarnings({ videoRef, motion: compass, samplesRef });
  useWakeLock(true);

  useEffect(() => {
    startRef.current = performance.now();
    if (!compass) return;
    const timer = window.setInterval(() => {
      const h = headingRef.current;
      if (h === null) return;
      const t = (performance.now() - startRef.current) / 1000;
      samplesRef.current.push({ t: Math.round(t * 100) / 100, heading: h });
      if (samplesRef.current.length > 600) samplesRef.current.shift();
      setSamples([...samplesRef.current]);
    }, 150);
    return () => window.clearInterval(timer);
  }, [compass, headingRef]);

  const ring = photos.filter((p) => !p.doorway);
  const doors = photos.filter((p) => p.doorway);
  const ringDone = ring.length >= RING_PHOTOS;
  const start = ring[0]?.heading ?? null;
  const target = !ringDone && start !== null ? ringTarget(start, ring.length) : null;
  const hint = heading !== null && target !== null ? aimHint(heading, target) : null;
  const coverage = ringCoverage(ring.length ? samples.filter((s) => s.t >= ring[0]!.t) : []);

  async function shoot(doorway: boolean) {
    const video = videoRef.current;
    if (!video || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    // Read the heading at the tap, not after the frame is encoded.
    const heading = headingRef.current;
    const t = Math.round(((performance.now() - startRef.current) / 1000) * 100) / 100;
    try {
      const blob = await grabPhoto(video);
      setPhotos((prev) => [...prev, { blob, heading, t, doorway }]);
      navigator.vibrate?.(30);
    } finally {
      lastShotRef.current = performance.now();
      busyRef.current = false;
      setBusy(false);
    }
  }

  function finish(tapAt: number) {
    // Ignore a double tap that lands on "Save spot" right after the last photo.
    // `tapAt` is the event's timeStamp, on the same clock as performance.now().
    if (busyRef.current || tapAt - lastShotRef.current < 600) return;
    busyRef.current = true;
    const ordered = [...ring, ...doors];
    const withHeading = ordered.every((p) => p.heading !== null);
    const flags: string[] = qualityFlags(historyRef.current);
    if (!withHeading) flags.push("no_compass");
    onDone({
      photos: ordered.map((p) => p.blob),
      headingTrack: withHeading ? ordered.map((p) => ({ t: p.t, heading: p.heading! })) : [],
      qualityFlags: flags,
    });
  }

  let instruction: string;
  if (!ring.length)
    instruction =
      "Stand in the middle of the room, phone level at chest height. Take the first photo.";
  else if (!ringDone)
    instruction = hint
      ? hint.kind === "aimed"
        ? "Aimed. Take the photo."
        : `Turn ${hint.direction} about ${hint.by}°`
      : "Turn right about 45° and take the next photo.";
  else if (doors.length < MAX_DOORWAYS)
    instruction = "Ring done. Now take one photo centred on each doorway, then save this spot.";
  else instruction = "Save this spot.";

  return (
    <CameraView stream={stream} videoRef={videoRef}>
      <div className="flex items-start justify-between gap-2 bg-gradient-to-b from-black/70 to-transparent p-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-white/70">
            Spot {roomIndex + 1} of {roomCount} · photo ring
          </p>
          <p className="text-lg font-semibold">{room}</p>
          <p className="text-sm text-white/80" aria-live="polite">
            {instruction}
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={onCancel}>
          Back
        </Button>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4">
        <WarningBanner warnings={warnings.filter((w) => w !== "too_fast")} />
      </div>

      <div className="flex items-end justify-between gap-3 bg-gradient-to-t from-black/80 to-transparent p-4 pb-8">
        {compass ? (
          <CoverageRing
            filled={coverage.filled}
            heading={heading}
            target={target}
            steps={
              start === null
                ? undefined
                : Array.from({ length: RING_PHOTOS }, (_, i) => ({
                    heading: ringTarget(start, i),
                    done: i < ring.length,
                  }))
            }
            label={`${Math.min(ring.length, RING_PHOTOS)}/${RING_PHOTOS}`}
            sublabel={doors.length ? `+${doors.length} doorway` : "photos"}
          />
        ) : (
          <div className="max-w-40 text-xs text-white/80">
            <p className="text-2xl font-semibold text-white">
              {Math.min(ring.length, RING_PHOTOS)}/{RING_PHOTOS}
            </p>
            Compass off: turn right about 45° between photos (about one eighth of a circle).
          </div>
        )}
        <div className="flex flex-col items-end gap-2">
          {photos.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setPhotos((p) => p.slice(0, -1))}>
              Undo last
            </Button>
          )}
          {!photos.length && (
            <Button variant="ghost" size="sm" onClick={onSkip}>
              Skip this room
            </Button>
          )}
          {ringDone ? (
            <>
              {doors.length < MAX_DOORWAYS && (
                <Button variant="secondary" onClick={() => void shoot(true)} disabled={busy}>
                  Doorway photo
                </Button>
              )}
              <Button size="lg" onClick={(e) => finish(e.timeStamp)}>
                Save spot
              </Button>
            </>
          ) : (
            <Button
              size="lg"
              onClick={() => void shoot(false)}
              disabled={busy}
              className={hint?.kind === "aimed" ? "ring-4 ring-emerald-400" : undefined}
            >
              Take photo {ring.length + 1}
            </Button>
          )}
        </div>
      </div>
    </CameraView>
  );
}
