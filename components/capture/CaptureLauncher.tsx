import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * Host dashboard slot (GH-5 contract, GH-22). Keep the name and props.
 * Opens the guided phone capture; phones need HTTPS for the camera.
 */
export function CaptureLauncher({ listingId }: { listingId: string }) {
  return (
    <section className="space-y-2 rounded-xl border p-4 text-sm">
      <h2 className="font-semibold">Capture this home in 3D</h2>
      <p className="text-muted-foreground">
        Open this on your phone: 8 photos per room with a compass guide, or short video clips. Each
        room uploads as you go.
      </p>
      <Button asChild size="sm">
        <Link href={`/host/capture/${listingId}`}>Start a guided capture</Link>
      </Button>
    </section>
  );
}
