import { ComingSoon } from "@/components/ui/coming-soon";

// Trip brief box and ranked shortlist (GH-14) on top of the card grid (GH-8). Owner: Beka.
export default function SearchPage() {
  return (
    <div className="space-y-4">
      <ComingSoon
        title="Trip brief: describe your trip in your own words"
        ticket="GH-14"
        owner="Beka"
      />
      <ComingSoon title="Listing card grid and simple filters" ticket="GH-8" owner="Beka" />
    </div>
  );
}
