import { MapPin, Star } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AskThisHome } from "@/components/ask-home/AskThisHome";
import { ActivityFeed } from "@/components/feed/ActivityFeed";
import { FloorPlanCard } from "@/components/floorplan/FloorPlanCard";
import { AmenityGrid } from "@/components/listing/AmenityGrid";
import { BookingBox } from "@/components/listing/BookingBox";
import { factsLine, houseRuleLines, stayLabel } from "@/components/listing/format";
import { Gallery } from "@/components/listing/Gallery";
import { HostCard } from "@/components/listing/HostCard";
import { ReviewsSection } from "@/components/listing/ReviewsSection";
import { TourLauncher } from "@/components/tour/TourLauncher";
import { Separator } from "@/components/ui/separator";
import { XrayPanel } from "@/components/xray/XrayPanel";
import { defaultGuests, defaultStay } from "@/lib/booking";
import {
  getAvailability,
  getListing,
  getListingPhotos,
  getListingReviews,
  getProfile,
} from "@/lib/data/listings";
import { getViewer } from "@/lib/viewer";
import { DEMO_DEAL } from "@/seed/fixtures";

export async function generateMetadata(props: PageProps<"/listing/[id]">): Promise<Metadata> {
  const listing = await getListing((await props.params).id);
  return { title: listing ? `${listing.title} · Glasshouse` : "Home not found · Glasshouse" };
}

// The listing page (GH-8, Beka). The four slot components are Temuri's (GH-5 contract):
// render them with the listing's id, never edit them from here.
export default async function ListingPage(props: PageProps<"/listing/[id]">) {
  const { id } = await props.params;
  const listing = await getListing(id);
  if (!listing) notFound();

  const today = new Date().toISOString().slice(0, 10);
  const [photos, reviews, host, availability, viewer] = await Promise.all([
    getListingPhotos(listing.id),
    getListingReviews(listing.id),
    getProfile(listing.host_id),
    getAvailability(listing.id, today),
    getViewer(),
  ]);
  const stay = defaultStay(today, DEMO_DEAL);
  const area = [listing.neighborhood, listing.city].filter(Boolean).join(", ");
  const rules = houseRuleLines(listing.house_rules);

  return (
    <div className="space-y-6 pb-28 lg:pb-0">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{listing.title}</h1>
        <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
          {listing.rating !== null && (
            <span className="flex items-center gap-1 text-foreground">
              <Star className="size-3.5 fill-current" aria-hidden />
              {listing.rating.toFixed(1)} · {listing.review_count} reviews
            </span>
          )}
          <span>{area}, Georgia</span>
        </p>
      </div>

      <Gallery photos={photos} title={listing.title} />

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-8">
          <section className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold">
                {stayLabel(listing.property_type, listing.city)}
              </h2>
              <p className="text-sm text-muted-foreground">{factsLine(listing)}</p>
            </div>
            {host && <HostCard name={host.name} avatarUrl={host.avatar_url} />}
          </section>
          <Separator />
          <XrayPanel listingId={listing.id} />
          <p className="leading-relaxed whitespace-pre-line">{listing.description}</p>
          <Separator />
          <AmenityGrid amenities={listing.amenities} />
          <Separator />
          <TourLauncher listingId={listing.id} />
          <FloorPlanCard listingId={listing.id} />
          <AskThisHome listingId={listing.id} />
          <Separator />
          <ReviewsSection reviews={reviews} rating={listing.rating} />
          {rules.length > 0 && (
            <>
              <Separator />
              <section className="space-y-3">
                <h2 className="text-lg font-semibold">House rules</h2>
                <ul className="grid gap-2 text-sm sm:grid-cols-2">
                  {rules.map((rule) => (
                    <li key={rule}>{rule}</li>
                  ))}
                  <li>Up to {listing.max_guests} guests</li>
                </ul>
              </section>
            </>
          )}
          <Separator />
          <section className="space-y-2">
            <h2 className="text-lg font-semibold">Location</h2>
            <p className="flex items-center gap-2 text-sm">
              <MapPin className="size-4 text-muted-foreground" aria-hidden />
              {area}, Georgia
            </p>
          </section>
        </div>

        <aside className="min-w-0">
          <div className="space-y-6 lg:sticky lg:top-20">
            {/* A client component: pass only what it shows, never the whole row. */}
            <BookingBox
              listingId={listing.id}
              title={listing.title}
              pricing={{
                base_price_cents: listing.base_price_cents,
                weekend_price_cents: listing.weekend_price_cents,
                cleaning_fee_cents: listing.cleaning_fee_cents,
              }}
              maxGuests={listing.max_guests}
              blockedDates={availability.blockedDates}
              overrides={availability.overrides}
              today={today}
              initial={{ ...stay, guests: defaultGuests(listing.max_guests, DEMO_DEAL.guests) }}
              canBook={viewer.role === "guest"}
            />
            <div className="max-h-[40vh] overflow-y-auto">
              <ActivityFeed filter="listing" listingId={listing.id} compact />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
