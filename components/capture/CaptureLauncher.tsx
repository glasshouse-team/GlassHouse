import { ComingSoon } from "@/components/ui/coming-soon";

/** Host dashboard slot (GH-5 contract). Temuri replaces this stub in GH-22 (stretch). Keep the name and props. */
export function CaptureLauncher({ listingId }: { listingId: string }) {
  return (
    <ComingSoon title="Record a walkthrough" ticket="GH-22" owner="Temuri">
      <a className="mt-2 inline-block text-xs underline" href={`/host/capture/${listingId}`}>
        Open the capture page
      </a>
    </ComingSoon>
  );
}
