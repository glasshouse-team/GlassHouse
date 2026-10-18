import Link from "next/link";
import { QuestionsWaiting } from "@/components/ask-home/QuestionsWaiting";
import { CaptureLauncher } from "@/components/capture/CaptureLauncher";
import { ActivityFeed } from "@/components/feed/ActivityFeed";
import { GapTasks } from "@/components/gaps/GapTasks";
import { approvalPrompt } from "@/components/deal/format";
import { AddHomeDialog } from "@/components/host/AddHomeDialog";
import { AgentRulesForm } from "@/components/host/AgentRulesForm";
import { ApprovalsQueue } from "@/components/host/ApprovalsQueue";
import { DeleteHomeButton } from "@/components/host/DeleteHomeButton";
import { HomeTabs } from "@/components/host/HomeTabs";
import { ListingPhotos } from "@/components/host/ListingPhotos";
import { initialHome } from "@/components/host/home-tabs";
import { ListingDraft } from "@/components/host/ListingDraft";
import { WorldVersions } from "@/components/tour/WorldVersions";
import { RoleSwitcher } from "@/components/ui/role-switcher";
import { stayRangeLabel } from "@/lib/booking";
import { getPendingApprovals } from "@/lib/data/deals";
import { getHostListings, getListingPhotos } from "@/lib/data/listings";
import { getHostPolicy } from "@/lib/data/policies";
import { getViewer } from "@/lib/viewer";
import { SEED_LISTINGS } from "@/seed/data/listings";

/** Demo homes stay (D-044): no delete button for them. */
const seedSlugs = new Set(SEED_LISTINGS.map((l) => l.slug));

export const metadata = { title: "Host dashboard · Glasshouse" };

// The host's dashboard (GH-8, Beka): what needs the host today, then one block per home.
// The slot components are Temuri's (GH-5 contract): render them with real ids only.
export default async function HostDashboardPage(props: PageProps<"/host/dashboard">) {
  const viewer = await getViewer();
  if (viewer.role !== "host") {
    return (
      <div className="mx-auto max-w-md space-y-4 rounded-2xl border p-6 text-center">
        <h1 className="text-xl font-semibold">Host dashboard</h1>
        <p className="text-sm text-muted-foreground">
          You are viewing Glasshouse as {viewer.name}, a guest. Switch to the host view to see
          Giorgi&apos;s homes, approvals and agent rules.
        </p>
        <div className="flex justify-center">
          <RoleSwitcher viewer={viewer} />
        </div>
      </div>
    );
  }

  const [listings, { home }] = await Promise.all([
    getHostListings(viewer.profileId),
    props.searchParams,
  ]);
  const [policies, photos, approvals] = await Promise.all([
    Promise.all(listings.map((listing) => getHostPolicy(listing.id))),
    Promise.all(listings.map((listing) => getListingPhotos(listing.id))),
    getPendingApprovals(viewer.profileId),
  ]);

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Welcome back, {viewer.name}</h1>
        <AddHomeDialog />
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Needs you</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <ApprovalsQueue
            initial={approvals.map(({ deal, listingTitle }) => ({
              dealId: deal.id,
              title: listingTitle,
              prompt: approvalPrompt(
                deal.final_total_cents ?? deal.list_total_cents,
                deal.list_total_cents,
                stayRangeLabel(deal.check_in, deal.check_out),
              ),
            }))}
            listings={listings.map((l) => ({ id: l.id, title: l.title }))}
          />
          <QuestionsWaiting hostId={viewer.profileId} />
        </div>
      </section>

      {listings.length === 0 && (
        <p className="text-sm text-muted-foreground">
          You have no homes listed yet. Use Add a home to list your first one.
        </p>
      )}
      <HomeTabs
        homes={listings.map(({ id, slug, title }) => ({ id, slug, title }))}
        initial={initialHome(listings, home)}
      >
        {listings.map((listing, i) => {
          const policy = policies[i];
          return (
            <section key={listing.id} className="space-y-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-lg font-semibold">{listing.title}</h2>
                <div className="flex items-center gap-2">
                  <Link
                    href={`/listing/${listing.slug}`}
                    className="text-sm text-brand underline-offset-4 hover:underline"
                  >
                    View listing
                  </Link>
                  {!seedSlugs.has(listing.slug) && (
                    <DeleteHomeButton listingId={listing.id} title={listing.title} />
                  )}
                </div>
              </div>
              <ListingPhotos
                listingId={listing.id}
                photos={photos[i].map(({ id, url, room_label }) => ({ id, url, room_label }))}
              />
              <div className="grid gap-4 lg:grid-cols-2">
                <AgentRulesForm
                  listingId={listing.id}
                  basePriceCents={listing.base_price_cents}
                  initial={
                    policy && {
                      negotiable: policy.negotiable,
                      floor_nightly_cents: policy.floor_nightly_cents,
                      max_discount_pct: policy.max_discount_pct,
                      auto_accept_total_cents: policy.auto_accept_total_cents,
                      allowed_terms: policy.allowed_terms.filter(
                        (t): t is "late_checkout" | "early_checkin" =>
                          t === "late_checkout" || t === "early_checkin",
                      ),
                    }
                  }
                />
                <div className="space-y-4">
                  <WorldVersions listingId={listing.id} />
                  <GapTasks listingId={listing.id} />
                  <CaptureLauncher listingId={listing.id} />
                </div>
              </div>
              <ListingDraft
                listingId={listing.id}
                current={{
                  id: listing.id,
                  title: listing.title,
                  description: listing.description,
                  property_type: listing.property_type,
                  max_guests: listing.max_guests,
                  bedrooms: listing.bedrooms,
                  beds: listing.beds,
                  baths: listing.baths,
                  amenities: listing.amenities,
                  house_rules: listing.house_rules,
                }}
              />
            </section>
          );
        })}
      </HomeTabs>

      <ActivityFeed filter="all" listingIds={listings.map((listing) => listing.id)} />
    </div>
  );
}
