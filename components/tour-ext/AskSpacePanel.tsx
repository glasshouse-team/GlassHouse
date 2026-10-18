"use client";

/**
 * Ask the space (GH-20, Beka): a chat overlay on the 3D tour. The guest agent answers from the
 * home's facts and anchors and moves the camera; each tool's action runs once, in order,
 * through runTourAction. Uses only useTour() (never components/tour/ internals).
 */
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { MessageCircleQuestion, Send, X } from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
} from "react";
import { useTour } from "@/components/tour/TourContext";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { runTourAction } from "./actions";
import { shownResults, SUGGESTED_QUESTIONS, takeNewActions } from "./ask-space";

export interface AskSpacePanelProps {
  /** Listing uuid or slug. */
  listingId: string;
  /** The spot world shown first; the panel follows useTour().worldId after that. */
  worldId?: string | null;
  /** Version of the home; optional, the server reads it from the spot world. */
  version?: number | null;
  suggestions?: string[];
}

/** Typing must not walk the camera (WASD, arrows): keep keys inside the panel. */
const keepKeys = (e: KeyboardEvent) => e.stopPropagation();

/** The panel starts open from the `sm` breakpoint up; on phones it starts closed so the tour shows. */
const WIDE = "(min-width: 640px)";
function subscribeWide(onChange: () => void) {
  const query = window.matchMedia(WIDE);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
const isWide = () => window.matchMedia(WIDE).matches;
// The server (and hydration) render it closed, so the markup always matches.
const wideOnServer = () => false;

export function AskSpacePanel({
  listingId,
  worldId = null,
  version = null,
  suggestions = SUGGESTED_QUESTIONS,
}: AskSpacePanelProps) {
  const tour = useTour();
  const wide = useSyncExternalStore(subscribeWide, isWide, wideOnServer);
  // null until the guest opens or closes it; until then it follows the screen width.
  const [chosen, setOpen] = useState<boolean | null>(null);
  const open = chosen ?? wide;
  const [input, setInput] = useState("");

  // Actions run after awaits, so they read the latest tour (a fly_to can switch spots).
  const tourRef = useRef(tour);
  const onCommit = useRef<(() => void) | null>(null);
  useEffect(() => {
    tourRef.current = tour;
    onCommit.current?.();
    onCommit.current = null;
  });
  // After a fly_to that switched spots, the next action must see the new spot's anchors:
  // wait for this panel's next render (or 300 ms, if it already happened).
  const nextCommit = () =>
    new Promise<void>((resolve) => {
      onCommit.current = resolve;
      setTimeout(resolve, 300);
    });

  const transport = useMemo(() => new DefaultChatTransport({ api: "/api/ask-space" }), []);
  const { messages, sendMessage, status, error } = useChat({ transport });
  const busy = status === "submitted" || status === "streaming";

  // Run each tool's camera action once, one after another (fly_to, then look_toward).
  const done = useRef(new Set<string>());
  const queue = useRef<Promise<void>>(Promise.resolve());
  useEffect(() => {
    for (const action of takeNewActions(messages, done.current)) {
      queue.current = queue.current
        .then(() => runTourAction(tourRef.current, action))
        .then(() => (action.type === "fly_to" ? nextCommit() : undefined))
        .catch((e) => console.warn("[ask-space] tour action failed", e));
    }
  }, [messages]);

  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages, status]);

  function ask(text: string) {
    const question = text.trim();
    if (!question || busy) return;
    setInput("");
    // The current spot goes with every question: it picks the version and look_toward vs fly_to.
    void sendMessage(
      { text: question },
      { body: { listingId, worldId: tour.worldId ?? worldId, version } },
    );
  }

  if (!open)
    return (
      <Button
        className="pointer-events-auto fixed right-4 bottom-4 z-30 h-11 rounded-full shadow-lg sm:h-9"
        onClick={() => setOpen(true)}
      >
        <MessageCircleQuestion /> Ask this space
      </Button>
    );

  return (
    <section
      aria-label="Ask this space"
      className="pointer-events-auto fixed right-4 bottom-4 z-30 flex max-h-[45vh] sm:max-h-[min(32rem,70vh)] w-[min(22rem,calc(100vw-2rem))] flex-col rounded-2xl border border-neutral-200 bg-white/95 text-sm text-neutral-900 shadow-xl backdrop-blur"
      onKeyDown={keepKeys}
      onKeyUp={keepKeys}
    >
      <header className="flex items-center justify-between border-b border-neutral-100 px-4 py-2">
        <h2 className="font-semibold">Ask this space</h2>
        <Button
          variant="ghost"
          size="icon-sm"
          className="size-11 sm:size-8"
          aria-label="Close Ask this space"
          onClick={() => setOpen(false)}
        >
          <X />
        </Button>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3" aria-live="polite">
        {messages.length === 0 && (
          <div className="space-y-2">
            <p className="text-neutral-500">
              Ask where things are. The guest agent shows you in the 3D.
            </p>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((q) => (
                <button
                  key={q}
                  type="button"
                  className="min-h-11 rounded-full border border-neutral-300 px-3 py-1 text-xs hover:bg-neutral-100 sm:min-h-0"
                  onClick={() => ask(q)}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => {
          const text = m.parts
            .map((p) => (p.type === "text" ? p.text : ""))
            .join("")
            .trim();
          const results = m.role === "assistant" ? shownResults(m.parts) : [];
          const notes = [...new Set(results.flatMap((r) => r.honestyNote ?? []))];
          return (
            <div key={m.id} className={cn("flex flex-col gap-1", m.role === "user" && "items-end")}>
              {text && (
                <p
                  className={cn(
                    "max-w-[90%] rounded-2xl px-3 py-2 whitespace-pre-wrap",
                    m.role === "user" ? "bg-neutral-900 text-white" : "bg-neutral-100",
                  )}
                >
                  {text}
                </p>
              )}
              {results.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {results.map((r) => (
                    <span
                      key={r.toolCallId}
                      className="rounded-full bg-sky-50 px-2 py-0.5 text-xs text-sky-800"
                    >
                      {r.action.type === "show_fact" ? `Checked: ${r.shown}` : `Showing ${r.shown}`}
                    </span>
                  ))}
                </div>
              )}
              {notes.map((n) => (
                <p key={n} className="rounded-lg bg-amber-50 px-2 py-1 text-xs text-amber-900">
                  {n}
                </p>
              ))}
            </div>
          );
        })}
        {status === "submitted" && <p className="text-neutral-400">Guest agent is looking...</p>}
        {error && <p className="text-red-600">The guest agent couldn&apos;t answer. Try again.</p>}
        <div ref={bottom} />
      </div>

      <form
        className="flex gap-2 border-t border-neutral-100 p-2"
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          maxLength={500}
          placeholder="Where would I work?"
          aria-label="Your question about this home"
          className="min-h-11 min-w-0 flex-1 rounded-full border border-neutral-300 px-3 py-1.5 text-base outline-none focus:border-neutral-500 sm:min-h-0 sm:text-sm"
        />
        <Button
          type="submit"
          size="icon-sm"
          className="size-11 sm:size-8"
          disabled={busy || !input.trim()}
          aria-label="Ask"
        >
          <Send />
        </Button>
      </form>
    </section>
  );
}
