import { ComingSoon } from "@/components/ui/coming-soon";

/** Listing page slot (GH-5 contract). Temuri replaces this stub in GH-18. Keep the name and props. */
export function FloorPlanCard({ listingId }: { listingId: string }) {
  return (
    <ComingSoon title="Floor plan" ticket="GH-18" owner="Temuri">
      <p className="mt-2 text-xs text-neutral-400">
        Plan of listing {listingId}, built from the 3D model.
      </p>
    </ComingSoon>
  );
}
