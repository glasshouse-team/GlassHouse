import { ComingSoon } from "@/components/ui/coming-soon";

// Walkable whole-house 3D tour (GH-11, Temuri). Load the viewer with next/dynamic and
// ssr: false: Spark and WebGL only run in the browser. Beka's add-ons live in components/tour-ext/.
export default async function TourPage(props: PageProps<"/tour/[listingId]">) {
  const { listingId } = await props.params;
  return (
    <ComingSoon title="3D tour" ticket="GH-11" owner="Temuri">
      <p className="mt-2 text-xs text-neutral-400">
        Listing {listingId}: walk, Jump to room, minimap.
      </p>
    </ComingSoon>
  );
}
