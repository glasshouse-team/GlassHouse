import { ComingSoon } from "@/components/ui/coming-soon";

/** Listing page slot (GH-5 contract). Temuri replaces this stub in GH-16. Keep the name and props. */
export function AskThisHome({ listingId }: { listingId: string }) {
  return (
    <ComingSoon title="Ask this home" ticket="GH-16" owner="Temuri">
      <p className="mt-2 text-xs text-neutral-400">
        The host agent answers questions about listing {listingId}.
      </p>
    </ComingSoon>
  );
}
