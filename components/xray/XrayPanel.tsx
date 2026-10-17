import { ComingSoon } from "@/components/ui/coming-soon";

/** Listing page slot (GH-5 contract). Temuri replaces this stub in GH-9. Keep the name and props. */
export function XrayPanel({ listingId }: { listingId: string }) {
  return (
    <ComingSoon title="Listing X-ray" ticket="GH-9" owner="Temuri">
      <p className="mt-2 text-xs text-neutral-400">
        Facts and contradictions for listing {listingId}.
      </p>
    </ComingSoon>
  );
}
