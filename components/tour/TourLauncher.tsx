import { Box } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { loadLauncher } from "./data";

/**
 * Listing page slot (GH-5 contract, GH-11). Keep the name and props. A thumbnail card that
 * opens the per-spot 3D tour; without a published tour it says so and links nowhere.
 */
export async function TourLauncher({ listingId }: { listingId: string }) {
  const data = await loadLauncher(listingId);
  if (!data) {
    return (
      <section className="flex items-center gap-3 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
        <Box className="size-5 shrink-0" aria-hidden />
        No 3D tour of this home yet.
      </section>
    );
  }
  const rooms = data.rooms.length;
  return (
    <Link
      href={`/tour/${listingId}`}
      className="group block overflow-hidden rounded-xl border transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <div className="relative aspect-[16/7] bg-muted">
        {data.thumbnailUrl && (
          <Image
            src={data.thumbnailUrl}
            alt="The entrance of this home in 3D"
            fill
            sizes="(min-width: 1024px) 700px, 100vw"
            className="object-cover transition-transform duration-500 group-hover:scale-[1.02]"
          />
        )}
        <span className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        <span className="absolute bottom-3 left-3 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-neutral-900 shadow">
          <Box className="size-4" aria-hidden /> Walk through this home
        </span>
      </div>
      <p className="px-4 py-3 text-sm text-muted-foreground">
        {rooms} {rooms === 1 ? "room" : "rooms"} in 3D, built from the host&apos;s own photos:{" "}
        {data.rooms.join(", ")}.
      </p>
    </Link>
  );
}
