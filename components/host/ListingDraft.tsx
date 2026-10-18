"use client";

import { Camera, Loader2, Mic, MicOff, Sparkles, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { CountField, CurrentListing, ListingDraft as Draft } from "@/tools/host/draft";

const EXAMPLE =
  "This is the living room, the TV is new. Here is my desk with the big monitor by the window, good for working. The kitchen has a gas hob, a fridge and a dishwasher; the washer is in the bathroom. One double bed in the bedroom, so it sleeps two. No parties and no pets please, quiet after eleven. Check-in from two, check-out by eleven. The heating switch is in the hall.";

const LANGUAGES = [
  { code: "en-US", label: "English" },
  { code: "ka-GE", label: "Georgian" },
] as const;

/** The parts of the Web Speech API the mic uses (Chrome ships it as webkitSpeechRecognition). */
interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  start(): void;
  stop(): void;
}
type RecognitionClass = new () => Recognition;

function recognitionClass(): RecognitionClass | undefined {
  const w = window as unknown as Record<string, RecognitionClass | undefined>;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}
const noop = () => () => {};

const COUNT_LABELS: Record<CountField, string> = {
  max_guests: "Guests",
  bedrooms: "Bedrooms",
  beds: "Beds",
  baths: "Baths",
};

const RULE_LABELS: Record<string, string> = {
  pets: "Pets",
  smoking: "Smoking",
  parties: "Parties",
  quiet_hours: "Quiet hours",
  check_in_after: "Check-in after",
  check_out_before: "Check-out before",
};

type ApplyField = "title" | "description" | "amenities";

function words(key: string) {
  return key.replace(/_/g, " ");
}

function ruleText(value: unknown) {
  if (value === true) return "allowed";
  if (value === false) return "not allowed";
  return String(value);
}

/** One field: what the listing says now, next to the draft. Amber when the draft needs a look. */
function DiffRow({
  label,
  now,
  draft,
  note,
}: {
  label: string;
  now: React.ReactNode;
  draft: React.ReactNode;
  note?: string;
}) {
  return (
    <div className="space-y-1.5 border-t pt-3 first:border-t-0 first:pt-0">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="min-w-0 text-sm">
          <span className="text-xs text-muted-foreground sm:hidden">Now: </span>
          {now}
        </div>
        <div
          className={cn(
            "min-w-0 rounded-md text-sm",
            note && "border border-honesty/70 bg-honesty/10 px-2 py-1",
          )}
        >
          <span className="text-xs text-muted-foreground sm:hidden">Draft: </span>
          {draft}
          {note && (
            <p className="mt-1 flex items-start gap-1 text-xs">
              <TriangleAlert className="mt-0.5 size-3 shrink-0" aria-hidden />
              {note}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export interface ListingDraftProps {
  listingId: string;
  current: CurrentListing;
}

/**
 * "Draft from narration" (GH-25): the host speaks or types a walkthrough of the home, the host
 * agent drafts the listing (POST /api/listing-draft), and the draft shows next to the listing.
 * Amenities say whether the X-ray saw them in the photos; claims the photos don't show are
 * amber. Nothing saves until the host applies the title, description or amenities.
 */
export function ListingDraft({ listingId, current }: ListingDraftProps) {
  const router = useRouter();
  const [narration, setNarration] = useState("");
  const [lang, setLang] = useState<(typeof LANGUAGES)[number]["code"]>("en-US");
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [ms, setMs] = useState<number | null>(null);
  const [chosen, setChosen] = useState<ApplyField[]>([]);
  const [applying, setApplying] = useState(false);
  const recognition = useRef<Recognition | null>(null);
  const abort = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      abort.current?.abort();
      recognition.current?.stop();
    },
    [],
  );
  const canSpeak = useSyncExternalStore(
    noop,
    () => recognitionClass() !== undefined,
    () => false,
  );
  const id = (field: string) => `${listingId}-draft-${field}`;

  function toggleMic() {
    if (listening) {
      recognition.current?.stop();
      return;
    }
    const Speech = recognitionClass();
    if (!Speech) return;
    const r = new Speech();
    r.lang = lang;
    r.interimResults = false;
    r.continuous = true;
    const before = narration.trim();
    r.onresult = (event) => {
      const said = Array.from(event.results)
        .map((alternatives) => alternatives[0]?.transcript ?? "")
        .join(" ")
        .trim();
      if (said) setNarration(before ? `${before} ${said}` : said);
    };
    r.onend = () => setListening(false);
    r.onerror = (event) => {
      setListening(false);
      setError(
        event.error === "not-allowed"
          ? "Allow the microphone in your browser to narrate, or type instead."
          : "Couldn't hear that. Try again or type the walkthrough.",
      );
    };
    recognition.current = r;
    setError(null);
    setListening(true);
    r.start();
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    recognition.current?.stop();
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/listing-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId, narration }),
        signal: controller.signal,
      });
      const body = (await response.json().catch(() => ({}))) as {
        draft?: Draft;
        ms?: number;
        message?: string;
        error?: string;
      };
      if (!response.ok || !body.draft) {
        setError(
          body.error === "invalid_input"
            ? "Say a little more about the home (a sentence or two at least)."
            : (body.message ?? "The host agent couldn't draft this time. Try again."),
        );
        return;
      }
      setDraft(body.draft);
      setMs(body.ms ?? null);
      setChosen([]);
    } catch (caught) {
      if ((caught as Error).name !== "AbortError") setError("Network error. Try again.");
    } finally {
      if (abort.current === controller) setBusy(false);
    }
  }

  async function apply() {
    if (!draft || chosen.length === 0) return;
    setApplying(true);
    try {
      const body: Record<string, unknown> = { listingId };
      if (chosen.includes("title")) body.title = draft.title;
      if (chosen.includes("description")) body.description = draft.description;
      if (chosen.includes("amenities")) body.amenities = draft.amenities.map((a) => a.key);
      const response = await fetch("/api/listing-draft/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) toast.error(result.message ?? "Could not save. Try again.");
      else {
        toast.success("Listing updated from the draft");
        setChosen([]);
        router.refresh();
      }
    } catch {
      toast.error("Network error. Try again.");
    } finally {
      setApplying(false);
    }
  }

  const noteFor = (field: CountField) =>
    draft?.numberNotes
      .filter((n) => n.field === field)
      .map((n) => n.note)
      .join("; ") || undefined;
  const rules = draft ? Object.entries(draft.house_rules) : [];
  const narrationOnly = draft?.amenities.filter((a) => a.source === "narration").length ?? 0;

  return (
    <div className="space-y-4 rounded-xl border bg-card p-4">
      <div>
        <h3 className="flex items-center gap-2 font-medium">
          <Sparkles className="size-4 text-brand-accent" aria-hidden />
          Draft from narration
        </h3>
        <p className="text-xs text-muted-foreground">
          Walk through the home and talk. The host agent drafts the listing from what you say and
          what the photos show. Nothing changes until you apply it.
        </p>
      </div>

      <form onSubmit={submit} className="space-y-3">
        <label htmlFor={id("narration")} className="sr-only">
          Your walkthrough narration
        </label>
        <Textarea
          id={id("narration")}
          rows={4}
          className="resize-y"
          placeholder={EXAMPLE}
          value={narration}
          onChange={(e) => setNarration(e.target.value)}
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="text-xs text-muted-foreground underline-offset-4 hover:underline"
              onClick={() => setNarration(EXAMPLE)}
            >
              Use the example
            </button>
            {canSpeak && (
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                Speaking
                <select
                  className="rounded-md border bg-background px-1.5 py-1 text-xs text-foreground"
                  value={lang}
                  onChange={(e) => setLang(e.target.value as typeof lang)}
                  disabled={listening}
                >
                  {LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <div className="flex gap-2">
            {canSpeak && (
              <Button
                type="button"
                variant={listening ? "default" : "outline"}
                size="icon"
                onClick={toggleMic}
                aria-pressed={listening}
                aria-label={listening ? "Stop narrating" : "Narrate with the microphone"}
              >
                {listening ? <MicOff /> : <Mic />}
              </Button>
            )}
            <Button type="submit" disabled={busy || narration.trim().length === 0}>
              {busy && <Loader2 className="animate-spin" aria-hidden />}
              {busy ? "Drafting" : "Draft listing"}
            </Button>
          </div>
        </div>
      </form>

      {error && (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 p-3 text-sm text-destructive"
        >
          {error}
        </p>
      )}

      {draft && (
        <div className="space-y-4" aria-live="polite">
          <div className="hidden grid-cols-2 gap-2 text-xs font-medium text-muted-foreground sm:grid">
            <span>Now</span>
            <span>Host agent draft{ms !== null && ` (${(ms / 1000).toFixed(1)} s)`}</span>
          </div>
          <div className="space-y-3">
            <DiffRow label="Title" now={current.title} draft={draft.title} />
            <DiffRow
              label="Description"
              now={<span className="line-clamp-6">{current.description}</span>}
              draft={draft.description}
              note={
                draft.unsupportedClaims.length > 0
                  ? `The photos don't show: ${draft.unsupportedClaims.join("; ")}`
                  : undefined
              }
            />
            <DiffRow label="Type" now={current.property_type} draft={draft.property_type} />
            {(Object.keys(COUNT_LABELS) as CountField[]).map((field) => (
              <DiffRow
                key={field}
                label={COUNT_LABELS[field]}
                now={current[field]}
                draft={draft[field] ?? <span className="text-muted-foreground">not said</span>}
                note={noteFor(field)}
              />
            ))}
            <DiffRow
              label="Amenities"
              now={
                <ul className="flex flex-wrap gap-1">
                  {current.amenities.map((a) => (
                    <li key={a} className="rounded-full border px-2 py-0.5 text-xs">
                      {words(a)}
                    </li>
                  ))}
                </ul>
              }
              draft={
                <ul className="flex flex-wrap gap-1">
                  {draft.amenities.map((a) => (
                    <li
                      key={a.key}
                      className={cn(
                        "flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs",
                        a.source === "photos"
                          ? "border-brand/40 text-brand"
                          : "border-honesty/70 bg-honesty/10",
                      )}
                      title={a.source === "photos" ? "Seen in photos" : "From narration only"}
                    >
                      {a.source === "photos" ? (
                        <Camera className="size-3" aria-hidden />
                      ) : (
                        <TriangleAlert className="size-3" aria-hidden />
                      )}
                      {words(a.key)}
                      <span className="sr-only">
                        {a.source === "photos" ? "(seen in photos)" : "(from narration only)"}
                      </span>
                    </li>
                  ))}
                </ul>
              }
              note={
                narrationOnly > 0
                  ? `${narrationOnly} from narration only: the photos don't show ${narrationOnly === 1 ? "it" : "them"} yet`
                  : undefined
              }
            />
            <DiffRow
              label="House rules"
              now={
                <ul className="space-y-0.5">
                  {Object.entries(current.house_rules).map(([k, v]) => (
                    <li key={k}>
                      {RULE_LABELS[k] ?? words(k)}: {ruleText(v)}
                    </li>
                  ))}
                </ul>
              }
              draft={
                rules.length > 0 ? (
                  <ul className="space-y-0.5">
                    {rules.map(([k, v]) => (
                      <li key={k}>
                        {RULE_LABELS[k] ?? words(k)}: {ruleText(v)}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span className="text-muted-foreground">none said</span>
                )
              }
            />
          </div>

          {draft.house_manual.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                House manual lines (private, for booked guests)
              </p>
              <ul className="list-disc space-y-0.5 pl-5 text-sm">
                {draft.house_manual.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          )}

          {draft.missingPhotos.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Photos to add
              </p>
              <ul className="list-disc space-y-0.5 pl-5 text-sm">
                {draft.missingPhotos.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          )}

          {draft.droppedAmenities.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Left out (not an amenity Glasshouse lists): {draft.droppedAmenities.join(", ")}
            </p>
          )}

          <fieldset className="space-y-2 border-t pt-3">
            <legend className="sr-only">Apply to the listing</legend>
            <p className="text-sm font-medium">Apply to the listing</p>
            <div className="flex flex-wrap gap-4">
              {(["title", "description", "amenities"] as const).map((field) => (
                <label key={field} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-4 accent-[var(--brand)]"
                    checked={chosen.includes(field)}
                    onChange={(e) =>
                      setChosen((c) =>
                        e.target.checked ? [...c, field] : c.filter((f) => f !== field),
                      )
                    }
                  />
                  {field[0].toUpperCase() + field.slice(1)}
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Counts, house rules and manual lines stay a preview for now.
            </p>
            <Button
              type="button"
              variant="outline"
              disabled={applying || chosen.length === 0}
              onClick={apply}
            >
              {applying && <Loader2 className="animate-spin" aria-hidden />}
              Apply selected
            </Button>
          </fieldset>
        </div>
      )}
    </div>
  );
}
