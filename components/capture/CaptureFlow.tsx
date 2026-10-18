"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ClipRecorder, type ClipResult } from "./ClipRecorder";
import { FallbackUpload, type FallbackClip } from "./FallbackUpload";
import { CLIP_MAX_SECONDS } from "./logic/recording";
import { RingCapture, type RingResult } from "./RingCapture";
import { RoomChecklist } from "./RoomChecklist";
import { requestCameraAndMotion } from "./sensors";
import { UploadPanel, type UploadJob } from "./UploadPanel";
import { uploadCapture, type CaptureRequest } from "./upload";

export interface FillInGap {
  id: string;
  room: string | null;
  description: string;
  screenshotUrl: string | null;
}

type Mode = "ring" | "clip";
type Step = "intro" | "hub" | "capture";

const TIPS = [
  "Turn on every light and open the curtains and interior doors.",
  "Put away personal items, photos of people, documents and screens.",
  "Keep people and pets out of the frame.",
  "Hold the phone level at chest height and move slowly.",
  "Stand in the middle of each room and turn a full circle.",
];

/**
 * Guided capture on a phone (GH-22): instructions and permission, room checklist, then per spot
 * an 8-photo ring (D-009, default) or a video clip of at most 30 s, each uploaded right away.
 */
export function CaptureFlow({
  listingId,
  listingTitle,
  initialRooms,
  demoMode,
  gap,
}: {
  listingId: string;
  listingTitle: string;
  initialRooms: string[];
  demoMode: boolean;
  gap: FillInGap | null;
}) {
  const [step, setStep] = useState<Step>("intro");
  const [rooms, setRooms] = useState<string[]>(
    gap ? [gap.room?.trim() || "Fill-in spot"] : initialRooms,
  );
  const [mode, setMode] = useState<Mode>(gap ? "clip" : "ring");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [compass, setCompass] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [motionDenied, setMotionDenied] = useState(false);
  const [starting, setStarting] = useState(false);
  const [done, setDone] = useState<Set<number>>(new Set());
  const [skipped, setSkipped] = useState<Set<number>>(new Set());
  const [jobs, setJobs] = useState<UploadJob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => () => streamRef.current?.getTracks().forEach((t) => t.stop()), []);

  const cleanRooms = rooms.map((r) => r.trim()).filter(Boolean);
  const nextRoom = cleanRooms.findIndex((_, i) => !done.has(i));
  const allDone = nextRoom === -1;

  function allow() {
    // No await before this call: iOS grants motion only inside the tap (sensors.ts).
    const ask = requestCameraAndMotion();
    setStarting(true);
    setRooms(cleanRooms);
    void ask.then(({ stream: s, cameraError: err, motion }) => {
      setStarting(false);
      setMotionDenied(motion === "denied");
      setCompass(motion !== "denied" && isPhoneLike());
      setCameraError(err);
      if (s) {
        streamRef.current = s;
        setStream(s);
        setStep("capture");
      }
    });
  }

  function updateJob(key: string, patch: Partial<UploadJob>) {
    setJobs((prev) => prev.map((j) => (j.key === key ? { ...j, ...patch } : j)));
  }

  function submit(label: string, request: CaptureRequest, files: Blob[], roomIdx: number[]) {
    const key = crypto.randomUUID();
    const run = () => {
      updateJob(key, { status: "uploading", progress: 0, error: undefined });
      uploadCapture(request, files, (p) => updateJob(key, { progress: p }))
        .then(() => {
          updateJob(key, { status: "done", progress: 1 });
          setDone((prev) => new Set([...prev, ...roomIdx]));
        })
        .catch((e: Error) => updateJob(key, { status: "failed", error: e.message }));
    };
    setJobs((prev) => [
      ...prev,
      { key, label, progress: 0, status: "uploading", flags: request.qualityFlags, retry: run },
    ]);
    // Mark the rooms as captured now so the host can go on; a failed upload can be retried.
    setDone((prev) => new Set([...prev, ...roomIdx]));
    run();
  }

  const kind = gap ? ("fill_in" as const) : ("walkthrough" as const);

  function onRing(ring: RingResult) {
    const room = cleanRooms[nextRoom]!;
    submit(
      `${room}: ${ring.photos.length} photos`,
      {
        listingId,
        kind: "ring",
        roomMarkers: [{ room, t: 0 }],
        headingTrack: ring.headingTrack,
        qualityFlags: ring.qualityFlags,
      },
      ring.photos,
      [nextRoom],
    );
    setStep("hub");
  }

  function onClip(clip: ClipResult, lastRoom: number) {
    const first = nextRoom;
    const covered = Array.from({ length: lastRoom - first + 1 }, (_, i) => first + i);
    submit(
      `${clip.roomMarkers.map((m) => m.room).join(", ")}: ${Math.round(clip.durationS)} s clip`,
      {
        listingId,
        kind,
        gapId: gap?.id,
        durationS: clip.durationS,
        roomMarkers: clip.roomMarkers,
        headingTrack: clip.headingTrack,
        qualityFlags: clip.qualityFlags,
      },
      [clip.blob],
      covered,
    );
    setStep("hub");
  }

  function onFallback(clip: FallbackClip) {
    const idx = Math.max(0, cleanRooms.indexOf(clip.room));
    submit(
      `${clip.room}: uploaded clip`,
      {
        listingId,
        kind,
        gapId: gap?.id,
        durationS: clip.durationS,
        roomMarkers: [{ room: clip.room, t: 0 }],
        headingTrack: [],
        qualityFlags: ["no_compass"],
      },
      [clip.blob],
      [idx],
    );
    if (step === "intro") setStep("hub");
  }

  if (step === "capture" && stream && !allDone) {
    return mode === "ring" ? (
      <RingCapture
        key={nextRoom}
        stream={stream}
        room={cleanRooms[nextRoom]!}
        roomIndex={nextRoom}
        roomCount={cleanRooms.length}
        compass={compass}
        onDone={onRing}
        onSkip={() => {
          setSkipped((prev) => new Set([...prev, nextRoom]));
          setDone((prev) => new Set([...prev, nextRoom]));
          setStep("hub");
        }}
        onCancel={() => setStep("hub")}
      />
    ) : (
      <ClipRecorder
        key={nextRoom}
        stream={stream}
        rooms={cleanRooms}
        firstRoom={nextRoom}
        compass={compass}
        overlayUrl={gap?.screenshotUrl}
        onDone={onClip}
        onCancel={() => setStep("hub")}
      />
    );
  }

  const uploading = jobs.some((j) => j.status === "uploading");
  const uploaded = jobs.filter((j) => j.status === "done").length;

  return (
    <div className="mx-auto max-w-xl space-y-6 px-4 py-6">
      <header className="space-y-1">
        <p className="text-sm text-muted-foreground">
          <Link href="/host/dashboard" className="underline-offset-4 hover:underline">
            Host dashboard
          </Link>{" "}
          / Capture
        </p>
        <h1 className="text-2xl font-semibold">
          {gap ? "Film a fill-in spot" : "Capture your home in 3D"}
        </h1>
        <p className="text-muted-foreground">{listingTitle}</p>
      </header>

      {gap && (
        <section className="space-y-2 rounded-xl border p-4 text-sm">
          <h2 className="font-semibold">The spot to fill in</h2>
          <p>{gap.description}</p>
          {gap.screenshotUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- storage screenshot of the gap
            <img
              src={gap.screenshotUrl}
              alt="The blank spot in the 3D tour"
              className="rounded-md"
            />
          )}
          <p className="text-muted-foreground">
            The screenshot shows faintly over the camera so you can aim at the same spot.
          </p>
        </section>
      )}

      {step === "intro" && (
        <>
          <section className="space-y-2">
            <h2 className="font-semibold">Before you start</h2>
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {TIPS.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </section>

          {!gap && (
            <section className="space-y-3">
              <h2 className="font-semibold">How to capture</h2>
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Capture mode">
                <ModeCard
                  active={mode === "ring"}
                  onClick={() => setMode("ring")}
                  title="Photo ring"
                  text="8 photos per room, turning 45° each time, plus each doorway. Best 3D."
                />
                <ModeCard
                  active={mode === "clip"}
                  onClick={() => setMode("clip")}
                  title="Video clip"
                  text={`Up to ${CLIP_MAX_SECONDS} s per clip; tap "Next room" as you walk.`}
                />
              </div>
            </section>
          )}

          {!gap && (
            <section className="space-y-2">
              <h2 className="font-semibold">Rooms</h2>
              <RoomChecklist rooms={rooms} onChange={setRooms} />
            </section>
          )}

          <Button
            size="lg"
            className="w-full"
            onClick={allow}
            disabled={starting || !cleanRooms.length}
          >
            {starting ? "Opening the camera..." : "Allow camera and motion"}
          </Button>
          <p className="text-xs text-muted-foreground">
            Your phone asks for the camera, microphone and motion (compass). The compass fills the
            ring as you turn; without it you can still capture.
          </p>
        </>
      )}

      {cameraError && (
        <p
          className="rounded-md border border-destructive/40 p-3 text-sm text-destructive"
          role="alert"
        >
          {cameraError}
        </p>
      )}
      {motionDenied && (
        <p className="rounded-md border p-3 text-sm text-muted-foreground">
          Motion access was refused, so the compass ring is off. Turn about 45° between photos, or a
          slow full circle on video.
        </p>
      )}

      {step === "hub" && (
        <section className="space-y-3">
          <h2 className="font-semibold">Rooms</h2>
          <ol className="space-y-1 text-sm">
            {cleanRooms.map((r, i) => (
              <li key={`${r}-${i}`} className="flex justify-between gap-2">
                <span>
                  {i + 1}. {r}
                </span>
                <span className={done.has(i) ? "text-brand" : "text-muted-foreground"}>
                  {skipped.has(i)
                    ? "Skipped"
                    : done.has(i)
                      ? "Captured"
                      : i === nextRoom
                        ? "Next"
                        : "To do"}
                </span>
              </li>
            ))}
          </ol>
          {!allDone && stream && (
            <Button size="lg" className="w-full" onClick={() => setStep("capture")}>
              {mode === "ring" ? "Capture" : "Record"} {cleanRooms[nextRoom]}
            </Button>
          )}
        </section>
      )}

      {(cameraError || step === "hub") && !allDone && (
        <FallbackUpload rooms={cleanRooms} onClip={onFallback} />
      )}

      <UploadPanel jobs={jobs} />

      {step === "hub" && (
        <GenerateStep
          demoMode={demoMode}
          ready={allDone && uploaded > 0 && !uploading}
          uploaded={uploaded}
        />
      )}
    </div>
  );
}

function ModeCard({
  active,
  onClick,
  title,
  text,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  text: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={`rounded-lg border p-3 text-left text-sm transition-colors ${
        active ? "border-brand bg-brand/10" : "hover:bg-muted"
      }`}
    >
      <span className="block font-medium">{title}</span>
      <span className="text-muted-foreground">{text}</span>
    </button>
  );
}

/**
 * "Generate my 3D home". TODO(GH-10): POST /api/worlds is still a 501 stub on main, so this step
 * does not start a generation yet. When GH-10 lands, call it here with the uploaded capture ids
 * (never in DEMO_MODE, and never on a page view: only from this button).
 */
function GenerateStep({
  demoMode,
  ready,
  uploaded,
}: {
  demoMode: boolean;
  ready: boolean;
  uploaded: number;
}) {
  return (
    <section className="space-y-2 rounded-xl border p-4">
      <h2 className="font-semibold">Generate my 3D home</h2>
      {demoMode ? (
        <p className="text-sm text-muted-foreground">
          Demo mode: 3D generation is off, so the saved 3D tour stays in place. Your{" "}
          {uploaded === 1 ? "capture is" : `${uploaded} captures are`} stored for later.
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          {ready
            ? "All rooms are uploaded. 3D generation starts from the host dashboard once it is switched on (GH-10)."
            : "Capture and upload every room first."}
        </p>
      )}
      <Button disabled className="w-full">
        Generate my 3D home
      </Button>
    </section>
  );
}

/** Compass headings only mean something on a phone or tablet. */
function isPhoneLike(): boolean {
  return (
    typeof window !== "undefined" && "ondeviceorientation" in window && navigator.maxTouchPoints > 0
  );
}
