import { ActivityFeed } from "@/components/feed/ActivityFeed";
import { ComingSoon } from "@/components/ui/coming-soon";

// Deal room: guest and host agents negotiate live, the host approves (GH-15, Beka).
export default async function DealPage(props: PageProps<"/deal/[id]">) {
  const { id } = await props.params;
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <ComingSoon title={`Deal room ${id}`} ticket="GH-15" owner="Beka" />
      <ActivityFeed filter="deal" dealId={id} compact />
    </div>
  );
}
