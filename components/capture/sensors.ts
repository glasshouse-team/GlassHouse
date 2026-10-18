"use client";
/**
 * Browser sensors for the phone recorder (GH-22): permissions, camera, compass heading,
 * shake and frame brightness. The math lives in ./logic (tested); this file is the DOM glue.
 */
import { useEffect, useRef, useState, type RefObject } from "react";
import { headingFromEvent, type OrientationReading } from "./logic/heading";
import { accelMagnitude, averageLuma } from "./logic/warnings";

type PermissionResult = "granted" | "denied" | "not_needed";
type WithPermission = { requestPermission?: () => Promise<"granted" | "denied"> };

export interface StartResult {
  stream: MediaStream | null;
  cameraError: string | null;
  motion: PermissionResult;
}

/**
 * Call from the "Allow camera and motion" tap handler. iOS only grants motion and compass
 * when requestPermission() is called inside the tap, before any await (build notes).
 */
export function requestCameraAndMotion(): Promise<StartResult> {
  const Orientation =
    typeof DeviceOrientationEvent !== "undefined"
      ? (DeviceOrientationEvent as unknown as WithPermission)
      : undefined;
  const Motion =
    typeof DeviceMotionEvent !== "undefined"
      ? (DeviceMotionEvent as unknown as WithPermission)
      : undefined;
  // Both calls start synchronously in the tap; the awaits come after.
  const orientationAsk =
    typeof Orientation?.requestPermission === "function"
      ? Orientation.requestPermission().catch(() => "denied" as const)
      : Promise.resolve("not_needed" as const);
  const motionAsk =
    typeof Motion?.requestPermission === "function"
      ? Motion.requestPermission().catch(() => "denied" as const)
      : Promise.resolve("not_needed" as const);

  return (async () => {
    const [orientation, motion] = await Promise.all([orientationAsk, motionAsk]);
    const motionResult: PermissionResult =
      orientation === "denied" || motion === "denied"
        ? "denied"
        : orientation === "granted" || motion === "granted"
          ? "granted"
          : "not_needed";
    const { stream, error } = await openCamera();
    return { stream, cameraError: error, motion: motionResult };
  })();
}

const VIDEO: MediaTrackConstraints = {
  facingMode: { ideal: "environment" },
  width: { ideal: 1280 },
  height: { ideal: 720 },
  frameRate: { ideal: 30 },
};

/** Rear camera with audio (narration, GH-25); without audio if the mic is refused. */
async function openCamera(): Promise<{ stream: MediaStream | null; error: string | null }> {
  if (!navigator.mediaDevices?.getUserMedia)
    return {
      stream: null,
      error: window.isSecureContext
        ? "This browser cannot open the camera."
        : "The camera needs HTTPS. Open this page over https:// (Vercel preview or ngrok).",
    };
  try {
    return {
      stream: await navigator.mediaDevices.getUserMedia({ video: VIDEO, audio: true }),
      error: null,
    };
  } catch {
    try {
      return {
        stream: await navigator.mediaDevices.getUserMedia({ video: VIDEO, audio: false }),
        error: null,
      };
    } catch (error) {
      const name = (error as { name?: string }).name;
      return {
        stream: null,
        error:
          name === "NotAllowedError"
            ? "Camera access was refused. Allow it in the browser's site settings, or upload a clip below."
            : "The camera could not start. You can still upload a clip below.",
      };
    }
  }
}

function screenAngle(): number {
  if (typeof screen !== "undefined" && screen.orientation) return screen.orientation.angle;
  const legacy = (window as unknown as { orientation?: number }).orientation;
  return typeof legacy === "number" ? legacy : 0;
}

/**
 * Live compass heading. `headingRef` updates on every event; `heading` (state) about 10 times
 * a second for drawing. Uses `deviceorientationabsolute` where it exists (Android Chrome).
 */
export function useHeading(enabled: boolean): {
  heading: number | null;
  headingRef: RefObject<number | null>;
} {
  const headingRef = useRef<number | null>(null);
  const [heading, setHeading] = useState<number | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const eventName =
      "ondeviceorientationabsolute" in window ? "deviceorientationabsolute" : "deviceorientation";
    const onEvent = (e: Event) => {
      const h = headingFromEvent(e as unknown as OrientationReading, screenAngle());
      if (h !== null) headingRef.current = h;
    };
    window.addEventListener(eventName, onEvent);
    const timer = window.setInterval(() => setHeading(headingRef.current), 100);
    return () => {
      window.removeEventListener(eventName, onEvent);
      window.clearInterval(timer);
    };
  }, [enabled]);
  return { heading: enabled ? heading : null, headingRef };
}

/** Peak acceleration (gravity removed) over the last second, or null without a sensor. */
export function useShakePeak(enabled: boolean): RefObject<number | null> {
  const peakRef = useRef<number | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let samples: { t: number; a: number }[] = [];
    const onMotion = (e: DeviceMotionEvent) => {
      const acc = e.acceleration;
      let a: number | null = null;
      if (acc && acc.x !== null) a = accelMagnitude(acc);
      else if (e.accelerationIncludingGravity?.x != null)
        a = Math.abs(accelMagnitude(e.accelerationIncludingGravity) - 9.81);
      if (a === null) return;
      const now = performance.now();
      samples.push({ t: now, a });
      samples = samples.filter((s) => now - s.t < 1000);
      peakRef.current = Math.max(...samples.map((s) => s.a));
    };
    window.addEventListener("devicemotion", onMotion);
    return () => window.removeEventListener("devicemotion", onMotion);
  }, [enabled]);
  return peakRef;
}

/** Average frame luminance sampled every 500 ms from a small canvas, or null before a frame. */
export function useBrightness(
  videoRef: RefObject<HTMLVideoElement | null>,
  enabled: boolean,
): RefObject<number | null> {
  const lumaRef = useRef<number | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 18;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const timer = window.setInterval(() => {
      const video = videoRef.current;
      if (!ctx || !video || video.readyState < 2) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      lumaRef.current = averageLuma(ctx.getImageData(0, 0, canvas.width, canvas.height).data);
    }, 500);
    return () => window.clearInterval(timer);
  }, [videoRef, enabled]);
  return lumaRef;
}

/** Keeps the screen on while `active` (where the Wake Lock API exists). */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    navigator.wakeLock
      .request("screen")
      .then((l) => {
        if (cancelled) void l.release();
        else lock = l;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      void lock?.release();
    };
  }, [active]);
}

/** Grabs the current video frame as a JPEG at the camera's full resolution. */
export async function grabPhoto(video: HTMLVideoElement): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth || 1280;
  canvas.height = video.videoHeight || 720;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No canvas");
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Photo failed"))), "image/jpeg", 0.9),
  );
}
