"use client";
import { useEffect, useRef, useState, type RefObject } from "react";
import { turnRate, type HeadingSample } from "./logic/heading";
import { currentWarnings, type CaptureWarning } from "./logic/warnings";
import { useBrightness, useShakePeak } from "./sensors";

/**
 * Checks for warnings every 500 ms (too fast, too dark, shaky) and keeps a history of them for
 * the capture's quality flags. `samplesRef` is the live heading track (for the turn speed).
 */
export function useLiveWarnings({
  videoRef,
  motion,
  samplesRef,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  motion: boolean;
  samplesRef: RefObject<HeadingSample[]>;
}): { warnings: CaptureWarning[]; historyRef: RefObject<CaptureWarning[][]> } {
  const lumaRef = useBrightness(videoRef, true);
  const shakeRef = useShakePeak(motion);
  const historyRef = useRef<CaptureWarning[][]>([]);
  const [warnings, setWarnings] = useState<CaptureWarning[]>([]);
  useEffect(() => {
    const timer = window.setInterval(() => {
      const samples = samplesRef.current;
      const now = currentWarnings({
        turnRate: samples.length > 1 ? turnRate(samples) : null,
        luma: lumaRef.current,
        shakePeak: shakeRef.current,
      });
      historyRef.current.push(now);
      setWarnings((prev) => (prev.join() === now.join() ? prev : now));
    }, 500);
    return () => window.clearInterval(timer);
  }, [lumaRef, shakeRef, samplesRef]);
  return { warnings, historyRef };
}
