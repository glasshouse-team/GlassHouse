import { CalendarDays, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { houseRuleLines, stayLabel } from "@/components/listing/format";
import { HostCard } from "@/components/listing/HostCard";
import { CheckinReport } from "@/components/trip/CheckinReport";
import { CheckinRecorder } from "@/components/trip/CheckinRecorder";
import { tripPriceLines } from "@/components/trip/format";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { stayRangeLabel } from "@/lib/booking";
import { getLatestCheckin, getReservation } from "@/lib/data/checkins";
import { getListing, getListingPhotos, getProfile } from "@/lib/data/listings";
import { getViewer } from "@/lib/viewer";

export const metadata: Metadata = { title: "Your trip · Glasshouse" };

// Trip page with "Film your arrival" check-in verification (GH-23, Beka).
export default async function TripPage(props: PageProps<"/trip/[id]">) {
  const { id } = await props.params;
  const reservation = await getReservation(id);
  if (!reservation) notFound();
  const listing = await getListing(reservation.listing_id);
  if (!listing) notFound();

  const [photos, host, checkin, viewer] = await Promise.all([
    getListingPhotos(listing.id),
    getProfile(listing.host_id),
    getLatestCheckin(reservation.id),
    getViewer(),
  ]);
  const isGuest = viewer.role === "guest" && viewer.profileId === reservation.guest_id;
  const isHost = viewer.role === "host" && viewer.profileId === listing.host_id;
  const rules = houseRuleLines(listing.house_rules);
  const cover = photos[0]?.url;
  const photoUrls = Object.fromEntries(photos.map((p) => [p.id, p.url]));
  const lines = tripPriceLines(reservation);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground">Your trip</p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{listing.title}</h1>
        <p className="text-sm text-muted-foreground">
          {stayLabel(listing.property_type, listing.city)}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-[200px_minmax(0,1fr)]">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element -- listing photos come from Storage
          <img
            src={cover}
            alt={listing.title}
            className="aspect-[4/3] w-full rounded-xl object-cover"
          />
        ) : (
          <div className="aspect-[4/3] w-full rounded-xl bg-muted" />
        )}
        <div className="min-w-0 space-y-3">
          <p className="flex items-center gap-2 text-sm">
            <CalendarDays className="size-4 text-muted-foreground" aria-hidden />
            {stayRangeLabel(reservation.check_in, reservation.check_out)}
            {reservation.status !== "confirmed" && (
              <Badge variant="outline" className="capitalize">
                {reservation.status}
              </Badge>
            )}
          </p>
          <p className="flex items-center gap-2 text-sm">
            <Users className="size-4 text-muted-foreground" aria-hidden />
            {reservation.guests} guest{reservation.guests === 1 ? "" : "s"}
          </p>
          {host && <HostCard name={host.name} avatarUrl={host.avatar_url} />}
          <Link href={`/listing/${listing.slug}`} className="text-sm text-brand underline">
            View the listing
          </Link>
        </div>
      </div>

      <Separator />

      {(isGuest || isHost) && (
        <section className="space-y-3" aria-label="Price">
          <h2 className="text-lg font-semibold">
            {isGuest ? "What you paid" : "What the guest paid"}
          </h2>
          <dl className="space-y-1.5 text-sm">
            {lines.map((line) => (
              <div
                key={line.label}
                className={
                  line.total
                    ? "flex justify-between border-t pt-2 font-semibold"
                    : "flex justify-between"
                }
              >
                <dt>{line.label}</dt>
                <dd>{line.amount}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {rules.length > 0 && (
        <>
          <Separator />
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">House rules</h2>
            <ul className="grid gap-2 text-sm sm:grid-cols-2">
              {rules.map((rule) => (
                <li key={rule}>{rule}</li>
              ))}
            </ul>
          </section>
        </>
      )}

      <Separator />

      <section className="space-y-4" aria-label="Check in">
        <div>
          <h2 className="text-lg font-semibold">Check in</h2>
          <p className="text-sm text-muted-foreground">
            The neutral Verifier checks the home against its listing when you arrive.
          </p>
        </div>
        {isGuest && reservation.status !== "cancelled" ? (
          <CheckinRecorder
            reservationId={reservation.id}
            photoUrls={photoUrls}
            saved={checkin?.report ?? null}
          />
        ) : checkin?.report ? (
          <CheckinReport
            report={checkin.report}
            reservationId={reservation.id}
            photoUrls={photoUrls}
            canOpenIssue={false}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            {isHost
              ? "The guest has not checked in yet. Their report will show here and in your feed."
              : "Only the guest of this trip can check in. Switch to the guest view."}
          </p>
        )}
        {checkin?.status === "pending" && !checkin.report && (
          <p className="text-sm text-muted-foreground">A check-in is being compared.</p>
        )}
      </section>
    </div>
  );
}
