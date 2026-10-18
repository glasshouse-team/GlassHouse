import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { CaptureFlow, type FillInGap } from "@/components/capture/CaptureFlow";
import { defaultRooms } from "@/components/capture/logic/recording";
import { getListing } from "@/lib/data/listings";
import { isDemoMode } from "@/lib/env";
import { publicMediaUrl, supabaseAdmin } from "@/lib/supabase";
import { getViewer } from "@/lib/viewer";

export const metadata = { title: "Capture your home" };

/** An open gap of this listing's 3D, for fill-in mode (`?gap=<id>`, GH-19 links here). */
async function loadGap(listingId: string, gapId: string | undefined): Promise<FillInGap | null> {
  if (!gapId || !z.uuid().safeParse(gapId).success) return null;
  const db = supabaseAdmin();
  const { data: gap } = await db
    .from("gaps")
    .select("id, world_id, room, description, screenshot_url")
    .eq("id", gapId)
    .maybeSingle();
  if (!gap) return null;
  const { data: world } = await db
    .from("worlds")
    .select("listing_id")
    .eq("id", gap.world_id)
    .maybeSingle();
  if (world?.listing_id !== listingId) return null;
  const shot = gap.screenshot_url;
  return {
    id: gap.id,
    room: gap.room,
    description: gap.description,
    screenshotUrl: shot ? (/^https?:\/\//.test(shot) ? shot : publicMediaUrl(shot)) : null,
  };
}

/**
 * Guided capture on the host's phone (GH-22, Temuri). Phones only open the camera over HTTPS
 * (Vercel preview or ngrok). `?gap=<id>` films one fill-in spot for a gap in the 3D.
 */
export default async function CapturePage(props: PageProps<"/host/capture/[listingId]">) {
  const { listingId } = await props.params;
  const { gap: gapParam } = await props.searchParams;
  const [viewer, listing] = await Promise.all([getViewer(), getListing(listingId)]);
  if (!listing) notFound();

  if (viewer.role !== "host" || listing.host_id !== viewer.profileId) {
    return (
      <div className="mx-auto max-w-xl space-y-3 px-4 py-10">
        <h1 className="text-2xl font-semibold">Only the host can capture this home</h1>
        <p className="text-muted-foreground">
          Switch to the host role in the header, then open this page again.
        </p>
        <Link
          href={`/listing/${listing.slug}`}
          className="text-brand underline-offset-4 hover:underline"
        >
          Back to the listing
        </Link>
      </div>
    );
  }

  const gap = await loadGap(listing.id, typeof gapParam === "string" ? gapParam : undefined);
  return (
    <CaptureFlow
      listingId={listing.id}
      listingTitle={listing.title}
      initialRooms={defaultRooms(listing.bedrooms, Number(listing.baths))}
      demoMode={isDemoMode()}
      gap={gap}
    />
  );
}
