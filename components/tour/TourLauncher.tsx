import { ComingSoon } from "@/components/ui/coming-soon";

/** Listing page slot (GH-5 contract). Temuri replaces this stub in GH-11. Keep the name and props. */
export function TourLauncher({ listingId }: { listingId: string }) {
  return (
    <ComingSoon title="Walk through this home" ticket="GH-11" owner="Temuri">
      <a className="mt-2 inline-block text-xs underline" href={`/tour/${listingId}`}>
        Open the tour page
      </a>
    </ComingSoon>
  );
}
