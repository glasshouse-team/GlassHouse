import { Star } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { PhotoPlaceholder } from "@/components/listing/PhotoPlaceholder";
import type { ListingCardData } from "@/lib/data/listings";
import { formatCents } from "@/lib/utils";

/** One search result: photo first, then area, title, rating and price per night. */
export function ListingCard({ listing }: { listing: ListingCardData }) {
  return (
    <Link href={`/listing/${listing.slug}`} className="group block space-y-2">
      <div className="relative aspect-[4/3] overflow-hidden rounded-xl">
        {listing.photoUrl ? (
          <Image
            src={listing.photoUrl}
            alt={listing.title}
            fill
            sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
            className="object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <PhotoPlaceholder className="h-full w-full" />
        )}
      </div>
      <div className="flex items-start justify-between gap-2 text-sm">
        <div className="min-w-0">
          <p className="truncate font-medium">
            {listing.neighborhood ? `${listing.neighborhood}, ` : ""}
            {listing.city}
          </p>
          <p className="truncate text-muted-foreground">{listing.title}</p>
          <p className="text-muted-foreground">Sleeps {listing.max_guests}</p>
        </div>
        {listing.rating !== null && (
          <p className="flex shrink-0 items-center gap-1">
            <Star className="size-3.5 fill-current" aria-hidden />
            {listing.rating.toFixed(1)}
            <span className="text-muted-foreground">({listing.review_count})</span>
          </p>
        )}
      </div>
      <p className="text-sm">
        <span className="font-semibold">{formatCents(listing.base_price_cents)}</span> night
      </p>
    </Link>
  );
}
