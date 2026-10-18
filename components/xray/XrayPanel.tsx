import { CircleAlert, Eye, ImageOff, MessageSquareWarning, ScanSearch } from "lucide-react";
import Image from "next/image";
import { z } from "zod";
import { firstName } from "@/components/tour/review-pins";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getListingPhotos } from "@/lib/data/listings";
import { ContradictionSchema, FactSchema } from "@/lib/schemas/verifier";
import { supabaseAdmin } from "@/lib/supabase";
import { factLabel } from "./fact-label";
import { isRealCheck } from "./real-check";

/** Facts below this confidence stay out of the chips. */
const MIN_CONFIDENCE = 0.5;

const CHIP =
  "rounded-full border px-3 py-1 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";
/** Green: the photos show it. */
const CHIP_SEEN =
  "border-emerald-300 bg-emerald-50 text-emerald-900 hover:bg-emerald-100 dark:border-emerald-700/60 dark:bg-emerald-950/40 dark:text-emerald-100 dark:hover:bg-emerald-900/50";
/** Grey: the photos show it is not there ("No fireplace seen"). */
const CHIP_ABSENT = "bg-muted text-muted-foreground hover:bg-muted/70";

const Facts = z.array(FactSchema).catch([]);
const Contradictions = z.array(ContradictionSchema).catch([]);
const Missing = z.array(z.string()).catch([]);

const checkedAt = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Tbilisi",
});

type PhotoUrls = Map<string, { url: string; label: string | null }>;

function Thumbs({ ids, photos, size }: { ids: string[]; photos: PhotoUrls; size: number }) {
  const shown = ids.flatMap((id) => {
    const photo = photos.get(id);
    return photo ? [{ id, ...photo }] : [];
  });
  if (shown.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {shown.map((photo) => (
        <div
          key={photo.id}
          className="relative shrink-0 overflow-hidden rounded-md bg-muted"
          style={{ width: size, height: size }}
        >
          <Image
            src={photo.url}
            alt={photo.label ?? "Listing photo"}
            fill
            sizes={`${size}px`}
            className="object-cover"
          />
        </div>
      ))}
    </div>
  );
}

interface Complaint {
  claim: string;
  room: string | null;
  author: string;
}

/**
 * Negative review claims (GH-24, `pnpm reviews:split`): counted and listed, not matched to the
 * listing text. No table or a failed read means none.
 */
async function reviewComplaints(listingId: string): Promise<Complaint[]> {
  try {
    const { data, error } = await supabaseAdmin()
      .from("reviews")
      .select("author_name, review_claims(claim, room, sentiment)")
      .eq("listing_id", listingId)
      .order("created_at");
    if (error) return [];
    return (data ?? []).flatMap((r) =>
      (r.review_claims ?? [])
        .filter((c) => c.sentiment === "negative")
        .map((c) => ({ claim: c.claim, room: c.room, author: firstName(r.author_name) })),
    );
  } catch {
    return [];
  }
}

/**
 * Listing page slot (GH-5 contract, built in GH-9). What the neutral Verifier saw in the photos:
 * facts with evidence, contradictions with the text, and what no photo shows.
 */
export async function XrayPanel({ listingId }: { listingId: string }) {
  const [{ data: row }, photoRows, complaints] = await Promise.all([
    supabaseAdmin().from("listing_facts").select("*").eq("listing_id", listingId).maybeSingle(),
    getListingPhotos(listingId),
    reviewComplaints(listingId),
  ]);

  const facts = Facts.parse(row?.facts ?? []);
  const contradictions = Contradictions.parse(row?.contradictions ?? []);
  const photoIds = new Set(photoRows.map((p) => p.id));

  // A seed placeholder (model "seed") or a row citing photos the listing no longer has is not
  // a Verifier check: never show "Checked by Verifier" over facts with no photos behind them.
  if (!row || !isRealCheck({ model: row.model, facts, contradictions }, photoIds)) {
    return (
      <section className="flex items-center gap-2 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
        <ScanSearch className="size-4 shrink-0" aria-hidden />
        The Verifier has not checked this home&apos;s photos yet.
      </section>
    );
  }

  const photos: PhotoUrls = new Map(
    photoRows.map((p) => [p.id, { url: p.url, label: p.room_label }]),
  );
  const shownFacts = facts.filter((f) => f.confidence >= MIN_CONFIDENCE);
  const missing = Missing.parse(row.missing_photos);

  return (
    <section className="space-y-4 rounded-xl border p-4 sm:p-5" aria-labelledby="xray-title">
      <div className="flex items-start gap-3">
        <ScanSearch className="mt-0.5 size-5 shrink-0" aria-hidden />
        <div>
          <h2 id="xray-title" className="font-semibold">
            Listing X-ray
          </h2>
          <p className="text-sm text-muted-foreground">
            A neutral Verifier compared the photos with what the listing says.
          </p>
        </div>
      </div>

      {contradictions.length > 0 && (
        <ul className="space-y-2">
          {contradictions.map((c, i) => (
            <li
              key={i}
              className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-100"
            >
              <div className="flex items-start gap-2">
                <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                <div className="min-w-0 space-y-1">
                  <p className="font-medium">
                    Says &ldquo;{c.claim}&rdquo;
                    {c.severity !== "low" && (
                      <span className="ml-2 rounded-full bg-amber-200/70 px-1.5 py-0.5 text-[11px] font-medium uppercase dark:bg-amber-800/60">
                        {c.severity}
                      </span>
                    )}
                  </p>
                  <p>{c.finding}</p>
                </div>
              </div>
              <Thumbs ids={c.evidence} photos={photos} size={56} />
            </li>
          ))}
        </ul>
      )}

      {shownFacts.length > 0 && (
        <div className="space-y-2">
          <h3 className="flex items-center gap-1.5 text-sm font-medium">
            <Eye className="size-4" aria-hidden /> Seen in photos
          </h3>
          <ul className="flex flex-wrap gap-2">
            {shownFacts.map((fact) => (
              <li key={fact.key}>
                <Popover>
                  <PopoverTrigger
                    className={
                      fact.value === false ? `${CHIP} ${CHIP_ABSENT}` : `${CHIP} ${CHIP_SEEN}`
                    }
                  >
                    {factLabel(fact.key, fact.value)}
                  </PopoverTrigger>
                  <PopoverContent className="w-auto max-w-72 space-y-2 p-3" align="start">
                    <p className="text-xs text-muted-foreground">
                      Seen in {fact.evidence.length}{" "}
                      {fact.evidence.length === 1 ? "photo" : "photos"} · confidence{" "}
                      {Math.round(fact.confidence * 100)}%
                    </p>
                    <Thumbs ids={fact.evidence} photos={photos} size={72} />
                  </PopoverContent>
                </Popover>
              </li>
            ))}
          </ul>
        </div>
      )}

      {missing.length > 0 && (
        <div className="space-y-2">
          <h3 className="flex items-center gap-1.5 text-sm font-medium">
            <ImageOff className="size-4" aria-hidden /> Not shown in photos
          </h3>
          <ul className="list-disc space-y-0.5 pl-5 text-sm text-muted-foreground">
            {missing.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {complaints.length > 0 && (
        <div className="space-y-2">
          <h3 className="flex items-center gap-1.5 text-sm font-medium">
            <MessageSquareWarning className="size-4" aria-hidden />
            {complaints.length} {complaints.length === 1 ? "thing" : "things"} guests flagged in
            reviews
          </h3>
          <ul className="space-y-0.5 pl-5 text-sm text-muted-foreground">
            {complaints.map((c, i) => (
              <li key={i} className="list-disc">
                {c.room && <span className="font-medium text-foreground">{c.room}: </span>}
                {c.claim} <span className="text-xs">({c.author})</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Checked by Verifier · {checkedAt.format(new Date(row.created_at))}
      </p>
    </section>
  );
}
