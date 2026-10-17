import { QuestionsWaiting } from "@/components/ask-home/QuestionsWaiting";
import { CaptureLauncher } from "@/components/capture/CaptureLauncher";
import { ActivityFeed } from "@/components/feed/ActivityFeed";
import { GapTasks } from "@/components/gaps/GapTasks";
import { WorldVersions } from "@/components/tour/WorldVersions";
import { ComingSoon } from "@/components/ui/coming-soon";

// GH-8 (Beka) builds the dashboard and reads the host and listing from the role switcher.
// The slot components are Temuri's (GH-5 contract).
const DEMO_HOST_ID = "demo-host";
const DEMO_LISTING_ID = "demo";

export default function HostDashboardPage() {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <ComingSoon title="Approvals queue" ticket="GH-15" owner="Beka" />
      <QuestionsWaiting hostId={DEMO_HOST_ID} />
      <GapTasks listingId={DEMO_LISTING_ID} />
      <WorldVersions listingId={DEMO_LISTING_ID} />
      <CaptureLauncher listingId={DEMO_LISTING_ID} />
      <ComingSoon title="Agent rules (host policy form)" ticket="GH-8" owner="Beka" />
      <div className="lg:col-span-2">
        <ActivityFeed filter="all" />
      </div>
    </div>
  );
}
