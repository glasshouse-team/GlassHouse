import { AlertTriangle, Check, Sparkles, Star } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { PhotoPlaceholder } from "@/components/listing/PhotoPlaceholder";
import type { ResultCard, SearchLine } from "@/components/search/search-stream";
import { cn, formatCents } from "@/lib/utils";

type Result = Extract<SearchLine, { type: "result" }>;

/** The guest agent's shortlist: ranked cards with cited reasons, concerns, and the others. */
export function SearchResults({ result }: { result: Result }) {
  return (
    <section className="space-y-4" aria-label="Your shortlist">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">
          {result.results.length > 0 ? "Your shortlist" : "No match yet"}
        </h2>
        <p className="text-xs text-muted-foreground">
          {result.briefLabel ? `${result.briefLabel} · ` : ""}found in{" "}
          {(result.ms / 1000).toFixed(1)} s
        </p>
      </div>
      {result.message && (
        <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
          {result.message}
        </p>
      )}
      {result.notes.map((note) => (
        <p key={note} className="flex items-start gap-2 text-sm text-muted-foreground">
          <Sparkles className="mt-0.5 size-4 shrink-0 text-brand-accent" aria-hidden />
          {note}
        </p>
      ))}
      <ol className="grid gap-4 lg:grid-cols-2">
        {result.results.map((card, i) => (
          <li key={card.listingId} className={cn(i === 0 && "lg:col-span-2")}>
            <ShortlistCard card={card} top={i === 0} />
          </li>
        ))}
      </ol>
      {result.others.length > 0 && (
        <details className="rounded-xl border p-4 text-sm">
          <summary className="cursor-pointer font-medium">
            Why not the others ({result.others.length})
          </summary>
          <ul className="mt-3 space-y-2">
            {result.others.map((other) => (
              <li key={other.slug}>
                <Link href={`/listing/${other.slug}`} className="font-medium hover:underline">
                  {other.title}
                </Link>
                <span className="text-muted-foreground">: {other.why}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function ShortlistCard({ card, top }: { card: ResultCard; top: boolean }) {
  return (
    <article
      className={cn(
        "flex h-full flex-col gap-4 rounded-2xl border bg-card p-4 sm:flex-row",
        top && "border-brand ring-2 ring-brand/30",
      )}
    >
      <Link
        href={`/listing/${card.slug}`}
        className={cn(
          "relative block aspect-[4/3] shrink-0 overflow-hidden rounded-xl sm:w-48",
          top && "sm:w-64",
        )}
      >
        {card.photoUrl ? (
          <Image
            src={card.photoUrl}
            alt={card.title}
            fill
            sizes="(min-width: 640px) 256px, 100vw"
            className="object-cover"
          />
        ) : (
          <PhotoPlaceholder className="h-full w-full" />
        )}
      </Link>
      <div className="min-w-0 flex-1 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {top && (
              <p className="text-xs font-semibold tracking-wide text-brand uppercase">Best match</p>
            )}
            <h3 className="font-semibold">
              <Link href={`/listing/${card.slug}`} className="hover:underline">
                {card.title}
              </Link>
            </h3>
            <p className="text-sm text-muted-foreground">
              {card.neighborhood ? `${card.neighborhood}, ` : ""}
              {card.city} · <span className="text-foreground">{formatCents(card.priceCents)}</span>{" "}
              night
              {card.rating !== null && (
                <>
                  {" · "}
                  <Star className="inline size-3 fill-current align-[-1px]" aria-hidden />{" "}
                  {card.rating.toFixed(1)}
                </>
              )}
            </p>
          </div>
          <span
            className="shrink-0 rounded-full bg-muted px-2 py-1 text-xs font-semibold"
            title="How well it fits your brief"
          >
            {card.score}/100
          </span>
        </div>
        <ul className="flex flex-wrap gap-2" aria-label="Why it fits">
          {card.reasons.map((reason) => (
            <li
              key={reason.text}
              className="flex items-start gap-1.5 rounded-lg bg-brand/10 px-2.5 py-1.5 text-xs"
            >
              <Check className="mt-0.5 size-3 shrink-0 text-brand" aria-hidden />
              <span>
                {reason.text}
                {reason.source && <span className="text-muted-foreground"> · {reason.source}</span>}
              </span>
            </li>
          ))}
        </ul>
        {card.concerns.length > 0 && (
          <ul className="space-y-1" aria-label="Worth knowing">
            {card.concerns.map((concern) => (
              <li key={concern.text} className="flex items-start gap-1.5 text-xs text-amber-800">
                <AlertTriangle className="mt-0.5 size-3 shrink-0" aria-hidden />
                {concern.text}
              </li>
            ))}
          </ul>
        )}
        {card.negotiationHint && (
          <p className="text-xs text-muted-foreground">Tip: {card.negotiationHint}</p>
        )}
      </div>
    </article>
  );
}
