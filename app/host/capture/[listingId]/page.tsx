import { ComingSoon } from "@/components/ui/coming-soon";

// Guided walkthrough capture for phones (GH-22, Temuri, stretch). Needs HTTPS on phones.
// Until it exists, hosts upload a plain walkthrough video and type the room list.
export default async function CapturePage(props: PageProps<"/host/capture/[listingId]">) {
  const { listingId } = await props.params;
  return (
    <ComingSoon
      title={`Record a walkthrough of listing ${listingId}`}
      ticket="GH-22"
      owner="Temuri"
    />
  );
}
