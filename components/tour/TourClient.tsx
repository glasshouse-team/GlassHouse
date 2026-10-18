"use client";

/**
 * Client entry of the tour page (GH-11). `ssr: false` is only allowed in a Client Component
 * (Next 16): Spark, three.js and WebGL run in the browser only.
 */
import dynamic from "next/dynamic";
import type { TourShellProps } from "./TourShell";

const TourShell = dynamic(() => import("./TourShell").then((m) => m.TourShell), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black text-sm text-white">
      Opening the 3D tour...
    </div>
  ),
});

export function TourClient(props: TourShellProps) {
  return <TourShell {...props} />;
}
