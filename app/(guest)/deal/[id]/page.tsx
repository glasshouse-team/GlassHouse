import Link from "next/link";
import { notFound } from "next/navigation";
import { DealRoom } from "@/components/deal/DealRoom";
import { ActivityFeed } from "@/components/feed/ActivityFeed";
import { stayRangeLabel } from "@/lib/booking";
import { getDeal, getDealMessages } from "@/lib/data/deals";
import { getListing, getProfile } from "@/lib/data/listings";
import { getViewer } from "@/lib/viewer";

export const metadata = { title: "Deal room · Glasshouse" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Deal room: the guest and host agents negotiate live, the host approves (GH-15, Beka).
// Only public deal data reaches the page; the guest's limits stay in deal_secrets.
export default async function DealPage(props: PageProps<"/deal/[id]">) {
  const { id } = await props.params;
  if (!UUID.test(id)) notFound();
  const deal = await getDeal(id);
  if (!deal) notFound();
  const [listing, messages, viewer, guest] = await Promise.all([
    getListing(deal.listing_id),
    getDealMessages(id),
    getViewer(),
    getProfile(deal.guest_id),
  ]);
  if (!listing) notFound();
  const host = await getProfile(listing.host_id);

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-4">
        <div>
          <p className="text-sm text-muted-foreground">Deal room</p>
          <h1 className="text-2xl font-semibold tracking-tight">
            <Link href={`/listing/${listing.slug}`} className="hover:underline">
              {listing.title}
            </Link>
          </h1>
        </div>
        <DealRoom
          initialDeal={deal}
          initialMessages={messages.map((m) => ({
            id: m.id,
            actor: m.actor,
            type: m.type,
            amount_cents: m.amount_cents,
            body: m.body,
            created_at: m.created_at,
          }))}
          stay={stayRangeLabel(deal.check_in, deal.check_out)}
          guestName={guest?.name ?? "The guest"}
          hostName={host?.name ?? "The host"}
          isGuest={viewer.role === "guest" && viewer.profileId === deal.guest_id}
          isHost={viewer.role === "host" && viewer.profileId === listing.host_id}
        />
      </div>
      <aside className="min-w-0">
        <ActivityFeed filter="deal" dealId={deal.id} compact />
      </aside>
    </div>
  );
}
