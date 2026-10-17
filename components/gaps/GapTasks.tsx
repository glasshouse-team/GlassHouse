import { ComingSoon } from "@/components/ui/coming-soon";

/** Host dashboard slot (GH-5 contract). Temuri replaces this stub in GH-19. Keep the name and props. */
export function GapTasks({ listingId }: { listingId: string }) {
  return (
    <ComingSoon title="Gap tasks" ticket="GH-19" owner="Temuri">
      <p className="mt-2 text-xs text-neutral-400">
        Blank spots in the 3D of listing {listingId} to film again.
      </p>
    </ComingSoon>
  );
}
