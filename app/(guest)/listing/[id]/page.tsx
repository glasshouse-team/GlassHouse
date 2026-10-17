import { AskThisHome } from "@/components/ask-home/AskThisHome";
import { ActivityFeed } from "@/components/feed/ActivityFeed";
import { FloorPlanCard } from "@/components/floorplan/FloorPlanCard";
import { TourLauncher } from "@/components/tour/TourLauncher";
import { ComingSoon } from "@/components/ui/coming-soon";
import { XrayPanel } from "@/components/xray/XrayPanel";

// GH-8 (Beka) builds the real listing page: gallery, details, amenities, reviews and the
// sticky booking box. The four slot components are Temuri's (GH-5 contract): render them,
// never edit them from here.
export default async function ListingPage(props: PageProps<"/listing/[id]">) {
  const { id } = await props.params;
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        <ComingSoon title="Gallery, details, amenities, reviews" ticket="GH-8" owner="Beka" />
        <XrayPanel listingId={id} />
        <TourLauncher listingId={id} />
        <FloorPlanCard listingId={id} />
        <AskThisHome listingId={id} />
      </div>
      <aside className="space-y-4">
        <ComingSoon title="Booking box and Negotiate" ticket="GH-8 / GH-15" owner="Beka" />
        <ActivityFeed filter="listing" listingId={id} compact />
      </aside>
    </div>
  );
}
