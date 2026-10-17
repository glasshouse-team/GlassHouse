import { ComingSoon } from "@/components/ui/coming-soon";

/** Host dashboard slot (GH-5 contract). Temuri replaces this stub in GH-10. Keep the name and props. */
export function WorldVersions({ listingId }: { listingId: string }) {
  return (
    <ComingSoon title="3D versions" ticket="GH-10" owner="Temuri">
      <p className="mt-2 text-xs text-neutral-400">
        Generate, preview and publish 3D versions of listing {listingId}.
      </p>
    </ComingSoon>
  );
}
