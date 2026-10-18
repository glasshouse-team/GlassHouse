"use client";

import { Camera, Loader2, Square, Upload, Video } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { StoredCheckinReport } from "@/lib/schemas/checkin";
import { MAX_CHECKIN_FRAMES } from "@/lib/schemas/checkin";
import { CheckinReport } from "./CheckinReport";
import { framesFromImages, framesFromVideo, pickEvenly, toJpeg } from "./frames";

/** The live camera stops by itself after 30 seconds. */
const MAX_SECONDS = 30;

type Phase =
  | { name: "idle" }
  | { name: "camera"; recording: boolean; seconds: number }
  | { name: "frames"; frames: string[] }
  | { name: "sending"; frames: string[] }
  | { name: "done"; frames: string[]; report: StoredCheckinReport };

interface Props {
  reservationId: string;
  photoUrls: Record<string, string>;
  /** The latest saved report, shown until the guest checks in again (no thumbnails). */
  saved: StoredCheckinReport | null;
}

/**
 * Film your arrival: the phone camera (frames grabbed from the live picture about once a second)
 * or a video / photos from the file picker. Frames are taken here in the browser (D-015) and
 * sent to POST /api/checkin; the video itself never leaves the phone.
 */
export function CheckinRecorder({ reservationId, photoUrls, saved }: Props) {
  const [phase, setPhase] = useState<Phase>({ name: "idle" });
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const grabbed = useRef<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  function stopCamera() {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  useEffect(() => stopCamera, []);

  async function openCamera() {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("This browser cannot open the camera here. Choose a video or photos instead.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      setPhase({ name: "camera", recording: false, seconds: 0 });
    } catch {
      setError("The camera is blocked. Allow it in the browser, or choose a video or photos.");
    }
  }

  // Attach the stream once the <video> for the camera phase is on the page.
  useEffect(() => {
    const video = videoRef.current;
    if (phase.name === "camera" && video && streamRef.current && !video.srcObject) {
      video.srcObject = streamRef.current;
      void video.play().catch(() => {});
    }
  }, [phase]);

  function grab() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;
    grabbed.current.push(toJpeg(video, video.videoWidth, video.videoHeight));
  }

  function startRecording() {
    grabbed.current = [];
    grab();
    let seconds = 0;
    timerRef.current = window.setInterval(() => {
      seconds += 1;
      grab();
      if (seconds >= MAX_SECONDS) finishRecording();
      else setPhase({ name: "camera", recording: true, seconds });
    }, 1000);
    setPhase({ name: "camera", recording: true, seconds: 0 });
  }

  function finishRecording() {
    grab();
    stopCamera();
    const frames = pickEvenly(grabbed.current, MAX_CHECKIN_FRAMES);
    grabbed.current = [];
    if (frames.length === 0) {
      setError("No picture came from the camera. Try again or choose a video.");
      setPhase({ name: "idle" });
    } else setPhase({ name: "frames", frames });
  }

  async function onFiles(list: FileList | null) {
    const files = [...(list ?? [])];
    if (files.length === 0) return;
    setError(null);
    try {
      const video = files.find((f) => f.type.startsWith("video/"));
      const frames = video
        ? await framesFromVideo(video)
        : await framesFromImages(files.filter((f) => f.type.startsWith("image/")));
      if (frames.length === 0) throw new Error("Choose a video or some photos.");
      setPhase({ name: "frames", frames });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read that file.");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function send(frames: string[]) {
    setError(null);
    setPhase({ name: "sending", frames });
    const response = await fetch("/api/checkin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reservationId, frames }),
    }).catch(() => null);
    const body = (await response?.json().catch(() => null)) as {
      report?: StoredCheckinReport;
      message?: string;
    } | null;
    if (response?.ok && body?.report) {
      setPhase({ name: "done", frames, report: body.report });
    } else {
      setError(body?.message ?? "The Verifier could not compare the frames. Try again.");
      setPhase({ name: "frames", frames });
    }
  }

  function reset() {
    stopCamera();
    setError(null);
    setPhase({ name: "idle" });
  }

  return (
    <div className="space-y-4">
      {phase.name === "idle" && saved && (
        <CheckinReport
          report={saved}
          reservationId={reservationId}
          photoUrls={photoUrls}
          canOpenIssue
        />
      )}

      {phase.name === "idle" && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Walk through the home for up to 30 seconds. The Verifier compares a few frames with the
            listing photos and tells you and your host what differs. Only the frames are sent; the
            video stays on your phone.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button onClick={openCamera} className="bg-brand text-white hover:bg-brand/90">
              <Video aria-hidden /> {saved ? "Film again" : "Film your arrival"}
            </Button>
            <Button variant="outline" onClick={() => fileRef.current?.click()}>
              <Upload aria-hidden /> Choose a video or photos
            </Button>
          </div>
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="video/*,image/*"
        multiple
        className="hidden"
        aria-label="Arrival video or photos"
        onChange={(e) => void onFiles(e.target.files)}
      />

      {phase.name === "camera" && (
        <div className="space-y-3">
          <video
            ref={videoRef}
            muted
            playsInline
            autoPlay
            className="aspect-video w-full rounded-xl bg-black object-cover"
          />
          <div className="flex items-center gap-2">
            {phase.recording ? (
              <Button onClick={finishRecording} variant="destructive">
                <Square aria-hidden /> Stop ({MAX_SECONDS - phase.seconds} s left)
              </Button>
            ) : (
              <Button onClick={startRecording} className="bg-brand text-white hover:bg-brand/90">
                <Camera aria-hidden /> Start
              </Button>
            )}
            <Button variant="ghost" onClick={reset}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {(phase.name === "frames" || phase.name === "sending") && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {phase.frames.length} frame{phase.frames.length === 1 ? "" : "s"} ready.
          </p>
          <ul className="grid grid-cols-4 gap-2">
            {phase.frames.map((src, i) => (
              <li key={i}>
                {/* eslint-disable-next-line @next/next/no-img-element -- data URLs from this browser */}
                <img
                  src={src}
                  alt={`Frame ${i + 1}`}
                  className="aspect-square w-full rounded-md object-cover"
                />
              </li>
            ))}
          </ul>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              onClick={() => void send(phase.frames)}
              disabled={phase.name === "sending"}
              className="bg-brand text-white hover:bg-brand/90"
            >
              {phase.name === "sending" ? (
                <>
                  <Loader2 className="animate-spin" aria-hidden /> The Verifier is comparing...
                </>
              ) : (
                "Compare with the listing"
              )}
            </Button>
            <Button variant="ghost" onClick={reset} disabled={phase.name === "sending"}>
              Start over
            </Button>
          </div>
        </div>
      )}

      {phase.name === "done" && (
        <div className="space-y-4">
          <CheckinReport
            report={phase.report}
            reservationId={reservationId}
            photoUrls={photoUrls}
            thumbnails={phase.frames}
            canOpenIssue
          />
          <Button variant="outline" onClick={reset}>
            Check in again
          </Button>
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
