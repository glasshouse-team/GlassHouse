"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { CameraView, WarningBanner } from "./CameraView";
import { CoverageRing } from "./CoverageRing";
import { ringCoverage, samplesForRoom, type RoomMarker } from "./logic/coverage";
import type { HeadingSample } from "./logic/heading";
import {
  CLIP_MAX_SECONDS,
  VIDEO_BITS_PER_SECOND,
  baseMimeType,
  formatClock,
  pickMimeType,
} from "./logic/recording";
import { qualityFlags } from "./logic/warnings";
import { useHeading, useWakeLock } from "./sensors";
import { useLiveWarnings } from "./useLiveWarnings";

export interface ClipResult {
  blob: Blob;
  durationS: number;
  roomMarkers: RoomMarker[];
  headingTrack: HeadingSample[];
  qualityFlags: string[];
}

/** Heading samples are kept at about 10 per second (300 for a full clip). */
const SAMPLE_MS = 100;

/**
 * One video clip of at most 30 s (World Labs' limit, D-009 / D-015) with "Next room" markers,
 * the 36-bin coverage ring per room and live warnings.
 */
export function ClipRecorder({
  stream,
  rooms,
  firstRoom,
  compass,
  overlayUrl,
  onDone,
  onCancel,
}: {
  stream: MediaStream;
  rooms: string[];
  firstRoom: number;
  compass: boolean;
  overlayUrl?: string | null;
  onDone: (clip: ClipResult, lastRoom: number) => void;
  onCancel: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startRef = useRef(0);
  const samplesRef = useRef<HeadingSample[]>([]);
  const markersRef = useRef<RoomMarker[]>([]);
  const roomRef = useRef(firstRoom);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [roomIndex, setRoomIndex] = useState(firstRoom);
  const [track, setTrack] = useState<HeadingSample[]>([]);
  const [markers, setMarkers] = useState<RoomMarker[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [mimeType] = useState(() =>
    typeof MediaRecorder === "undefined"
      ? null
      : pickMimeType((t) => MediaRecorder.isTypeSupported(t)),
  );

  const { heading, headingRef } = useHeading(compass);
  const { warnings, historyRef } = useLiveWarnings({ videoRef, motion: compass, samplesRef });
  useWakeLock(recording);

  function stop() {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
  }

  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => {
      const t = (performance.now() - startRef.current) / 1000;
      const h = headingRef.current;
      if (h !== null) samplesRef.current.push({ t: Math.round(t * 100) / 100, heading: h });
      setTrack([...samplesRef.current]);
      setElapsed(t);
      if (t >= CLIP_MAX_SECONDS) stop();
    }, SAMPLE_MS);
    return () => window.clearInterval(timer);
  }, [recording, headingRef]);

  // Leaving the screen mid-recording drops the clip instead of uploading it.
  useEffect(
    () => () => {
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        recorder.onstop = null;
        recorder.stop();
      }
    },
    [],
  );

  function start() {
    if (!mimeType) return;
    setError(null);
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: VIDEO_BITS_PER_SECOND });
    } catch {
      setError("This browser cannot record video. Upload a clip instead.");
      return;
    }
    chunksRef.current = [];
    samplesRef.current = [];
    historyRef.current = [];
    markersRef.current = [{ room: rooms[firstRoom]!, t: 0 }];
    roomRef.current = firstRoom;
    setMarkers(markersRef.current);
    setRoomIndex(firstRoom);
    setTrack([]);
    setElapsed(0);
    recorder.ondataavailable = (e) => {
      if (e.data.size) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      setRecording(false);
      const durationS = Math.min(
        CLIP_MAX_SECONDS,
        Math.round(((performance.now() - startRef.current) / 1000) * 10) / 10,
      );
      const blob = new Blob(chunksRef.current, { type: baseMimeType(mimeType) });
      const flags: string[] = qualityFlags(historyRef.current);
      if (!samplesRef.current.length) flags.push("no_compass");
      onDone(
        {
          blob,
          durationS,
          roomMarkers: markersRef.current,
          headingTrack: samplesRef.current,
          qualityFlags: flags,
        },
        roomRef.current,
      );
    };
    recorderRef.current = recorder;
    startRef.current = performance.now();
    recorder.start(1000);
    setRecording(true);
  }

  function nextRoom() {
    const next = roomRef.current + 1;
    if (next >= rooms.length) return;
    const t = Math.round(((performance.now() - startRef.current) / 1000) * 100) / 100;
    markersRef.current = [...markersRef.current, { room: rooms[next]!, t }];
    roomRef.current = next;
    setMarkers(markersRef.current);
    setRoomIndex(next);
  }

  const coverage = ringCoverage(samplesForRoom(track, markers, markers.length - 1));
  const left = Math.max(0, CLIP_MAX_SECONDS - elapsed);
  const room = rooms[roomIndex] ?? "";

  return (
    <CameraView stream={stream} videoRef={videoRef} overlayUrl={overlayUrl}>
      <div className="flex items-start justify-between gap-2 bg-gradient-to-b from-black/70 to-transparent p-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-white/70">
            Room {roomIndex + 1} of {rooms.length}
          </p>
          <p className="text-lg font-semibold">{room}</p>
          <p className="text-sm text-white/80" aria-live="polite">
            {recording
              ? `${formatClock(elapsed)} · ${Math.ceil(left)} s left`
              : `Up to ${CLIP_MAX_SECONDS} s per clip`}
          </p>
        </div>
        {!recording && (
          <Button variant="secondary" size="sm" onClick={onCancel}>
            Back
          </Button>
        )}
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4">
        <WarningBanner warnings={recording ? warnings : warnings.filter((w) => w === "too_dark")} />
        {error && <p className="rounded-md bg-red-600/90 px-3 py-1.5 text-sm">{error}</p>}
        {!mimeType && (
          <p className="rounded-md bg-red-600/90 px-3 py-1.5 text-sm">
            This browser cannot record video here. Go back and upload a clip instead.
          </p>
        )}
      </div>

      <div className="flex items-end justify-between gap-3 bg-gradient-to-t from-black/80 to-transparent p-4 pb-8">
        {compass ? (
          <CoverageRing
            filled={coverage.filled}
            heading={heading}
            label={`${Math.round(coverage.degrees)}°`}
            sublabel={coverage.done ? "room covered" : "turn a full circle"}
          />
        ) : (
          <p className="max-w-36 text-xs text-white/80">
            Compass off: turn slowly through a full circle in the middle of each room.
          </p>
        )}
        <div className="flex flex-col items-end gap-2">
          {recording && roomIndex + 1 < rooms.length && (
            <Button variant="secondary" onClick={nextRoom}>
              Next room: {rooms[roomIndex + 1]}
            </Button>
          )}
          {recording ? (
            <Button variant="destructive" size="lg" onClick={stop}>
              Stop
            </Button>
          ) : (
            <Button size="lg" onClick={start} disabled={!mimeType}>
              Record
            </Button>
          )}
        </div>
      </div>
    </CameraView>
  );
}
