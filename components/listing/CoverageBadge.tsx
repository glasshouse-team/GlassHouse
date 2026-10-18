import { Video } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { coverageExplanation, formatCoverage, type ListingCoverage } from "@/lib/coverage";
import { cn } from "@/lib/utils";

/** The listing page section the badge links to. */
export const HOW_WE_VERIFY_ID = "how-we-verify";

const pill =
  "inline-flex w-fit shrink-0 items-center gap-1 rounded-full border bg-background px-2 py-0.5 text-xs font-medium whitespace-nowrap";

/**
 * "92% filmed" (GH-21): the share of the published 3D tour filmed by the host, from the
 * spot worlds' `coverage_score` (lib/coverage.ts). Renders nothing without a score.
 *
 * `card` is for search cards, which are links already: a plain pill with a native tooltip.
 * The default (listing page) opens a popover that explains the number and links to
 * "How we verify".
 */
export function CoverageBadge({
  coverage,
  card = false,
  className,
}: {
  coverage: ListingCoverage | null;
  card?: boolean;
  className?: string;
}) {
  if (!coverage) return null;
  const label = formatCoverage(coverage.score);
  const explanation = coverageExplanation(coverage);

  if (card) {
    return (
      <span className={cn(pill, "border-transparent shadow-sm", className)} title={explanation}>
        <Video className="size-3" aria-hidden />
        {label}
      </span>
    );
  }

  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          pill,
          "cursor-pointer hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
          className,
        )}
        aria-label={`${label}. What does this mean?`}
      >
        <Video className="size-3" aria-hidden />
        {label}
      </PopoverTrigger>
      <PopoverContent align="start" className="space-y-2 text-sm">
        <p className="font-medium">{label}</p>
        <p className="text-muted-foreground">{explanation}</p>
        <a
          href={`#${HOW_WE_VERIFY_ID}`}
          className="inline-block font-medium text-brand underline-offset-4 hover:underline"
        >
          How we verify
        </a>
      </PopoverContent>
    </Popover>
  );
}

/** The short "How we verify" section on the listing page. */
export function HowWeVerify() {
  return (
    <section id={HOW_WE_VERIFY_ID} className="scroll-mt-24 space-y-2">
      <h2 className="text-lg font-semibold">How we verify</h2>
      <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
        <li>
          The 3D tour is built from the host&apos;s own photos of each room. Where the camera did
          not reach, AI fills the gap.
        </li>
        <li>
          A neutral Verifier checks every room from many angles and marks what is filled in. The
          coverage score is the share of those views backed by real footage.
        </li>
        <li>
          In the tour, &ldquo;Show what&apos;s real&rdquo; marks the AI-filled areas in{" "}
          <span className="font-medium text-foreground">
            <span
              className="mr-1 inline-block size-2.5 rounded-full bg-honesty align-middle"
              aria-hidden
            />
            amber
          </span>
          . Hosts are asked to film them, and the score goes up when they do.
        </li>
      </ul>
    </section>
  );
}
