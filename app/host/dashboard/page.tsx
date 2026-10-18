import Link from "next/link";
import { QuestionsWaiting } from "@/components/ask-home/QuestionsWaiting";
import { CaptureLauncher } from "@/components/capture/CaptureLauncher";
import { ActivityFeed } from "@/components/feed/ActivityFeed";
import { GapTasks } from "@/components/gaps/GapTasks";
import { AgentRulesForm } from "@/components/host/AgentRulesForm";
import { WorldVersions } from "@/components/tour/WorldVersions";
import { ComingSoon } from "@/components/ui/coming-soon";
import { RoleSwitcher } from "@/components/ui/role-switcher";
import { getHostListings } from "@/lib/data/listings";
import { getHostPolicy } from "@/lib/data/policies";
import { getViewer } from "@/lib/viewer";

export const metadata = { title: "Host dashboard · Glasshouse" };

// The host's dashboard (GH-8, Beka): what needs the host today, then one block per home.
// The slot components are Temuri's (GH-5 contract): render them with real ids only.
export default async function HostDashboardPage() {
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

  const listings = await getHostListings(viewer.profileId);
  const policies = await Promise.all(listings.map((listing) => getHostPolicy(listing.id)));

  return (
    <div className="space-y-10">
      <h1 className="text-2xl font-semibold tracking-tight">Welcome back, {viewer.name}</h1>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Needs you</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <ComingSoon title="Approvals queue" ticket="GH-15" owner="Beka" />
          <QuestionsWaiting hostId={viewer.profileId} />
        </div>
      </section>

      {listings.length === 0 && (
        <p className="text-sm text-muted-foreground">You have no homes listed yet.</p>
      )}
      {listings.map((listing, i) => {
        const policy = policies[i];
        return (
          <section key={listing.id} className="space-y-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold">{listing.title}</h2>
              <Link
                href={`/listing/${listing.slug}`}
                className="text-sm text-brand underline-offset-4 hover:underline"
              >
                View listing
              </Link>
            </div>
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
          </section>
        );
      })}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Activity</h2>
        <ActivityFeed filter="all" />
      </section>
    </div>
  );
}
