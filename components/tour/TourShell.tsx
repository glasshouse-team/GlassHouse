"use client";

/**
 * The whole tour screen (GH-11), browser only (loaded by TourClient with ssr: false):
 * <TourProvider> > [3D <Viewer>, HTML <TourOverlay>, Beka's <TourExtensions>]. Full screen
 * (`fixed inset-0`): the root layout's <main> is narrow. Without WebGL, or if the 3D crashes,
 * it shows the rooms' pictures and a link to the listing photos instead.
 */
import Link from "next/link";
import { Component, useState, type ReactNode } from "react";
import { TourExtensions } from "@/components/tour-ext";
import type { Anchor, Gap, World } from "@/lib/schemas/world";
import { AnchorPanel } from "./AnchorPanel";
import { useTour } from "./TourContext";
import { TourOverlay } from "./TourOverlay";
import { TourProvider } from "./TourProvider";
import { Viewer, type AnchorPick } from "./Viewer";
import { spotLabel } from "./spots";

export interface TourShellProps {
  listingId: string;
  title: string;
  version: number;
  preview: boolean;
  worlds: World[];
  entrySpot: string;
  anchors: Anchor[];
  gaps: Gap[];
  startAnchorId: string | null;
  anchorMode: boolean;
}

function hasWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

export function TourShell(props: TourShellProps) {
  const [webgl] = useState(hasWebGL);
  const [pick, setPick] = useState<AnchorPick | null>(null);
  if (!webgl) return <PhotoFallback {...props} reason="This browser cannot show 3D (no WebGL)." />;

  return (
    <TourProvider
      listingId={props.listingId}
      worlds={props.worlds}
      entrySpot={props.entrySpot}
      anchors={props.anchors}
      gaps={props.gaps}
      startAnchorId={props.startAnchorId}
      anchorMode={props.anchorMode}
    >
      <div className="fixed inset-0 z-40 overflow-hidden bg-black select-none">
        <ViewerBoundary
          fallback={<PhotoFallback {...props} reason="The 3D view stopped working." />}
        >
          <div className="absolute inset-0">
            <Viewer onPick={props.anchorMode ? setPick : undefined} />
          </div>
        </ViewerBoundary>
        <TourOverlay title={props.title} preview={props.preview} version={props.version} />
        {props.anchorMode && <AnchorPanel pick={pick} onDone={() => setPick(null)} />}
        <Extensions listingId={props.listingId} />
      </div>
    </TourProvider>
  );
}

/** Beka's add-ons for the current spot (components/tour-ext, contract). */
function Extensions({ listingId }: { listingId: string }) {
  const { worldId } = useTour();
  if (!worldId) return null;
  return <TourExtensions listingId={listingId} worldId={worldId} />;
}

class ViewerBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.warn("[tour] viewer crashed", error);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** Photo fallback: each room's picture, and the listing's photo gallery. */
function PhotoFallback({ listingId, title, worlds, reason }: TourShellProps & { reason: string }) {
  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-neutral-950 p-4 text-white sm:p-8">
      <div className="mx-auto max-w-4xl space-y-4">
        <p className="text-sm text-white/70">{title}</p>
        <h1 className="text-xl font-semibold">{reason}</h1>
        <p className="text-sm text-white/70">Here are the rooms as pictures instead.</p>
        <ul className="grid gap-3 sm:grid-cols-2">
          {worlds.map((w) => (
            <li key={w.id} className="overflow-hidden rounded-xl bg-white/5">
              {(w.thumbnail_url ?? w.pano_url) && (
                // eslint-disable-next-line @next/next/no-img-element -- room picture from our storage
                <img
                  src={(w.thumbnail_url ?? w.pano_url)!}
                  alt={spotLabel(w)}
                  className="aspect-video w-full object-cover"
                />
              )}
              <p className="p-2 text-sm font-medium">{spotLabel(w)}</p>
            </li>
          ))}
        </ul>
        <Link
          href={`/listing/${listingId}`}
          className="inline-block rounded-lg bg-white px-4 py-2 text-sm font-medium text-neutral-900"
        >
          See all photos
        </Link>
      </div>
    </div>
  );
}
