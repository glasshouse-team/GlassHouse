import { Mic, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/**
 * The trip brief box. GH-14 wires it to the guest agent (ranked shortlist with reasons);
 * until then it shows the idea and the plain filters below do the work.
 */
export function BriefBox() {
  return (
    <section className="rounded-2xl border bg-card p-4 shadow-sm">
      <label htmlFor="brief" className="flex items-center gap-2 text-sm font-medium">
        <Sparkles className="size-4 text-brand-accent" aria-hidden />
        Describe your trip in your own words
      </label>
      <Textarea
        id="brief"
        disabled
        rows={3}
        className="mt-2 resize-none"
        placeholder="4 friends, Kazbegi or Tbilisi, early November, about $60 each per night, one of us works remotely, we want a fireplace and a mountain view."
      />
      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Agent search is coming soon. Use the filters below for now.
        </p>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            disabled
            aria-label="Speak your brief"
          >
            <Mic />
          </Button>
          <Button type="button" disabled>
            Find homes
          </Button>
        </div>
      </div>
    </section>
  );
}
