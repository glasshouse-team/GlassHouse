import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { TourClient } from "@/components/tour/TourClient";
import { loadTour } from "@/components/tour/data";
import { startAnchor } from "@/components/tour/spots";

export const metadata: Metadata = { title: "3D tour · Glasshouse" };

const Version = z.coerce.number().int().positive();

// Per-spot 3D tour (GH-11, D-009): `?version=n` previews a version, `?anchor=<id>` starts at
// an anchor, `?anchors=1` (dev only) turns on anchor mode. Assets come from our storage only;
// nothing here calls World Labs. Beka's add-ons mount inside via <TourExtensions>.
export default async function TourPage(props: PageProps<"/tour/[listingId]">) {
  const { listingId } = await props.params;
  const search = await props.searchParams;
  if (!z.uuid().safeParse(listingId).success) notFound();
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const version = Version.safeParse(one(search.version));
  const data = await loadTour(listingId, version.success ? version.data : null);
  if (!data) notFound();

  if (!data.tour) {
    return (
      <div className="mx-auto max-w-md space-y-3 py-16 text-center">
        <h1 className="text-xl font-semibold">No 3D tour yet</h1>
        <p className="text-sm text-muted-foreground">
          {version.success
            ? `Version ${version.data} of this home has no rooms ready to show.`
            : "The host has not published a 3D tour of this home yet."}
        </p>
        <Link href={`/listing/${listingId}`} className="text-sm underline">
          Back to {data.listing.title}
        </Link>
      </div>
    );
  }

  const anchor = startAnchor(data.anchors, data.tour.worlds, one(search.anchor) ?? null);
  return (
    <TourClient
      listingId={listingId}
      title={data.listing.title}
      version={data.tour.version}
      preview={data.tour.preview}
      worlds={data.tour.worlds}
      entrySpot={data.tour.entrySpot}
      anchors={data.anchors}
      gaps={data.gaps}
      startAnchorId={anchor?.id ?? null}
      anchorMode={one(search.anchors) === "1" && process.env.NODE_ENV !== "production"}
    />
  );
}
