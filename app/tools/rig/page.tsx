import { ComingSoon } from "@/components/ui/coming-soon";

// Hidden screenshot rig for the gap check (GH-19, Temuri): renders 6 views per viewpoint
// inside the 3D world and uploads them for the Verifier.
export default function RigPage() {
  return <ComingSoon title="Gap-check screenshot rig" ticket="GH-19" owner="Temuri" />;
}
