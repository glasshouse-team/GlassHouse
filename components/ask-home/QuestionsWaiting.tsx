import { ComingSoon } from "@/components/ui/coming-soon";

/** Host dashboard slot (GH-5 contract). Temuri replaces this stub in GH-16. Keep the name and props. */
export function QuestionsWaiting({ hostId }: { hostId: string }) {
  return (
    <ComingSoon title="Questions waiting" ticket="GH-16" owner="Temuri">
      <p className="mt-2 text-xs text-neutral-400">
        Questions the host agent forwarded to host {hostId}.
      </p>
    </ComingSoon>
  );
}
