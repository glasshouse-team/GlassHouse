"use client";

import { Loader2, Mic, MicOff, Sparkles } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { readLines, type SearchLine } from "@/components/search/search-stream";
import { SearchResults } from "@/components/search/SearchResults";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const DEMO_BRIEF =
  "4 friends, Kazbegi or Tbilisi, early November, about $60 each per night, one of us works remotely, we want a fireplace or a cozy living room and a mountain view.";

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

type Result = Extract<SearchLine, { type: "result" }>;

/**
 * The trip brief box (GH-14): type or speak the trip, and the guest agent streams its steps,
 * then a ranked shortlist whose every reason cites a real fact (POST /api/search).
 */
export function BriefBox() {
  const [brief, setBrief] = useState("");
  const [steps, setSteps] = useState<string[]>([]);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const recognition = useRef<Recognition | null>(null);
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

  async function search(event: React.FormEvent) {
    event.preventDefault();
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setBusy(true);
    setSteps([]);
    setResult(null);
    setError(null);
    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brief }),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) throw new Error("search failed");
      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      let answered = false;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const { lines, rest } = readLines(buffer);
        buffer = rest;
        for (const line of lines) {
          if (line.type === "step") setSteps((current) => [...current, line.text]);
          else {
            answered = true;
            if (line.type === "result") setResult(line);
            else setError(line.message);
          }
        }
      }
      if (!answered && !controller.signal.aborted)
        setError("The search ended before an answer came back. Try again.");
    } catch (caught) {
      if ((caught as Error).name !== "AbortError")
        setError("The search didn't go through. Check your connection and try again.");
    } finally {
      if (abort.current === controller) setBusy(false);
    }
  }

  function toggleMic() {
    if (listening) {
      recognition.current?.stop();
      return;
    }
    const Speech = recognitionClass();
    if (!Speech) return;
    const r = new Speech();
    r.lang = "en-US";
    r.interimResults = false;
    r.continuous = false;
    const before = brief.trim();
    r.onresult = (event) => {
      const said = Array.from(event.results)
        .map((alternatives) => alternatives[0]?.transcript ?? "")
        .join(" ")
        .trim();
      if (said) setBrief(before ? `${before} ${said}` : said);
    };
    r.onend = () => setListening(false);
    r.onerror = (event) => {
      setListening(false);
      setError(
        event.error === "not-allowed"
          ? "Allow the microphone in your browser to speak your brief."
          : "Couldn't hear that. Try again or type your brief.",
      );
    };
    recognition.current = r;
    setListening(true);
    r.start();
  }

  return (
    <div className="space-y-6">
      <form onSubmit={search} className="rounded-2xl border bg-card p-4 shadow-sm">
        <label htmlFor="brief" className="flex items-center gap-2 text-sm font-medium">
          <Sparkles className="size-4 text-brand-accent" aria-hidden />
          Describe your trip in your own words
        </label>
        <Textarea
          id="brief"
          rows={3}
          className="mt-2 resize-none"
          placeholder={DEMO_BRIEF}
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey))
              e.currentTarget.form?.requestSubmit();
          }}
        />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            className="text-xs text-muted-foreground underline-offset-4 hover:underline"
            onClick={() => setBrief(DEMO_BRIEF)}
          >
            Use the example
          </button>
          <div className="flex gap-2">
            {canSpeak && (
              <Button
                type="button"
                variant={listening ? "default" : "outline"}
                size="icon"
                onClick={toggleMic}
                aria-pressed={listening}
                aria-label="Speak your brief"
              >
                {listening ? <MicOff /> : <Mic />}
              </Button>
            )}
            <Button type="submit" disabled={busy || brief.trim().length === 0}>
              {busy && <Loader2 className="animate-spin" aria-hidden />}
              Find homes
            </Button>
          </div>
        </div>
      </form>

      {(busy || steps.length > 0) && !result && (
        <ol
          className="space-y-1 text-sm text-muted-foreground"
          aria-live="polite"
          aria-label="Agent steps"
        >
          {steps.map((step, i) => (
            <li key={`${i}-${step}`} className="flex items-center gap-2">
              {busy && i === steps.length - 1 ? (
                <Loader2 className="size-3.5 animate-spin text-brand-accent" aria-hidden />
              ) : (
                <span className="size-3.5 text-center text-brand" aria-hidden>
                  ✓
                </span>
              )}
              Guest agent: {step}
            </li>
          ))}
        </ol>
      )}
      {error && (
        <p
          role="alert"
          className="rounded-xl border border-destructive/30 p-4 text-sm text-destructive"
        >
          {error}
        </p>
      )}
      {result && <SearchResults result={result} />}
    </div>
  );
}
