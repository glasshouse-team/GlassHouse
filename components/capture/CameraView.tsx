"use client";
import { useEffect, type ReactNode, type RefObject } from "react";
import { WARNING_TEXT, type CaptureWarning } from "./logic/warnings";

/** Full-screen live camera with overlays. `overlayUrl` shows a gap screenshot faintly to aim. */
export function CameraView({
  stream,
  videoRef,
  overlayUrl,
  children,
}: {
  stream: MediaStream;
  videoRef: RefObject<HTMLVideoElement | null>;
  overlayUrl?: string | null;
  children: ReactNode;
}) {
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
    void video.play().catch(() => {});
    return () => {
      video.srcObject = null;
    };
  }, [stream, videoRef]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black text-white">
      <video
        ref={videoRef}
        className="absolute inset-0 size-full object-cover"
        autoPlay
        playsInline
        muted
      />
      {overlayUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- a storage URL we only show faintly
        <img
          src={overlayUrl}
          alt=""
          className="pointer-events-none absolute inset-0 size-full object-cover opacity-30"
        />
      )}
      <div className="relative flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}

export function WarningBanner({ warnings }: { warnings: CaptureWarning[] }) {
  if (!warnings.length) return null;
  return (
    <div className="flex flex-col gap-1" role="alert" aria-live="assertive">
      {warnings.map((w) => (
        <p
          key={w}
          className="rounded-md bg-amber-500/90 px-3 py-1.5 text-sm font-medium text-black"
        >
          {WARNING_TEXT[w]}
        </p>
      ))}
    </div>
  );
}
