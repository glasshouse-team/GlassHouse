"use client";

import { Clock, Loader2, MessageCircleQuestion, Send } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { hasSupabaseEnv, supabaseBrowser } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { SourceChips } from "./SourceChips";
import {
  MESSAGE_COLUMNS,
  mergeMessages,
  parseMessages,
  SUGGESTED_QUESTIONS,
  type QaMessage,
} from "./thread";

interface AskResult {
  conversationId: string;
  messageId: string;
  answer: string | null;
  sources: QaMessage["sources"];
  forwarded: boolean;
}

const storageKey = (listingId: string) => `gh-qa-${listingId}`;

function readThreadId(listingId: string): string | null {
  try {
    return window.localStorage.getItem(storageKey(listingId));
  } catch {
    return null;
  }
}

function saveThreadId(listingId: string, id: string) {
  try {
    window.localStorage.setItem(storageKey(listingId), id);
  } catch {
    // Private mode or blocked storage: the thread just starts fresh next visit.
  }
}

/** Rows to show when the browser has no Supabase env (no Realtime): built from the reply. */
function localRows(question: string, result: AskResult): QaMessage[] {
  const now = new Date().toISOString();
  const base = { conversation_id: result.conversationId, answered_by: null, created_at: now };
  return [
    {
      ...base,
      id: `${result.messageId}-q`,
      actor: "guest",
      body: question,
      sources: [],
      needs_host: result.forwarded,
    },
    ...(result.answer
      ? [
          {
            ...base,
            id: result.messageId,
            actor: "host_agent" as const,
            body: result.answer,
            sources: result.sources,
            needs_host: false,
            created_at: `${now}~`,
          },
        ]
      : []),
  ];
}

function Bubble({ message }: { message: QaMessage }) {
  const mine = message.actor === "guest" || message.actor === "guest_agent";
  const who =
    message.actor === "host"
      ? "Reply from the host"
      : message.actor === "host_agent"
        ? "Host agent"
        : message.actor === "guest_agent"
          ? "Your agent asked"
          : null;
  return (
    <li className={cn("flex flex-col gap-1.5", mine ? "items-end" : "items-start")}>
      {who && <span className="text-xs font-medium text-muted-foreground">{who}</span>}
      <p
        className={cn(
          "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed",
          mine ? "bg-primary text-primary-foreground" : "bg-muted",
          message.actor === "host" && "border border-primary/40 bg-background",
        )}
      >
        {message.body}
      </p>
      {message.actor === "host_agent" && <SourceChips sources={message.sources} />}
      {mine && message.needs_host && (
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="size-3" aria-hidden /> Asked the host, we&apos;ll notify you
        </span>
      )}
    </li>
  );
}

/** Listing page slot (GH-5 contract, built in GH-16). Keep the name and props. */
export function AskThisHome({ listingId }: { listingId: string }) {
  const channelName = `qa-${useId()}`;
  const configured = hasSupabaseEnv();
  // The thread id is never rendered, so reading localStorage here cannot break hydration.
  const [threadId, setThreadId] = useState<string | null>(() =>
    typeof window === "undefined" ? null : readThreadId(listingId),
  );
  const [messages, setMessages] = useState<QaMessage[]>([]);
  const [question, setQuestion] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLOListElement>(null);

  const load = useCallback(
    async (id: string) => {
      if (!configured) return;
      const { data } = await supabaseBrowser()
        .from("messages")
        .select(MESSAGE_COLUMNS)
        .eq("conversation_id", id)
        .order("created_at", { ascending: true });
      if (data) setMessages((current) => mergeMessages(current, parseMessages(data)));
    },
    [configured],
  );

  // Live thread: the host's reply and the cleared "waiting" flag arrive through Realtime.
  useEffect(() => {
    if (!configured || !threadId) return;
    const db = supabaseBrowser();
    const channel = db
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${threadId}`,
        },
        (payload) => setMessages((current) => mergeMessages(current, parseMessages([payload.new]))),
      )
      .subscribe((state) => {
        if (state === "SUBSCRIBED") void load(threadId);
      });
    return () => {
      db.removeChannel(channel);
    };
  }, [configured, threadId, channelName, load]);

  useEffect(() => {
    listRef.current?.lastElementChild?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [messages.length, pending]);

  async function ask(text: string) {
    const q = text.trim();
    if (q.length < 2 || pending) return;
    setPending(q);
    setError(null);
    setQuestion("");
    try {
      const response = await fetch("/api/qa", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ listingId, question: q, conversationId: threadId ?? undefined }),
      });
      if (!response.ok) throw new Error(String(response.status));
      const result = (await response.json()) as AskResult;
      if (result.conversationId !== threadId) {
        saveThreadId(listingId, result.conversationId);
        setThreadId(result.conversationId);
      }
      if (configured) await load(result.conversationId);
      else setMessages((current) => mergeMessages(current, localRows(q, result)));
    } catch {
      setError("The host agent could not answer just now. Try again in a moment.");
      setQuestion(q);
    } finally {
      setPending(null);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void ask(question);
  }

  return (
    <section className="space-y-4 rounded-xl border p-4 sm:p-5" aria-labelledby="ask-home-title">
      <div className="space-y-1">
        <h2 id="ask-home-title" className="flex items-center gap-2 font-semibold">
          <MessageCircleQuestion className="size-4 text-brand" aria-hidden />
          Ask this home
        </h2>
        <p className="text-sm text-muted-foreground">
          The host agent answers from the house rules, the house manual and what the Verifier saw in
          the photos. If it doesn&apos;t know, it asks the host instead of guessing.
        </p>
      </div>

      {(messages.length > 0 || pending) && (
        <ol ref={listRef} className="max-h-96 space-y-3 overflow-y-auto pr-1" aria-live="polite">
          {messages.map((m) => (
            <Bubble key={m.id} message={m} />
          ))}
          {pending && (
            <>
              <li className="flex justify-end">
                <p className="max-w-[85%] rounded-2xl bg-primary px-3.5 py-2 text-sm text-primary-foreground">
                  {pending}
                </p>
              </li>
              <li className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Host agent is checking the house rules and manual…
              </li>
            </>
          )}
        </ol>
      )}

      <div className="flex flex-wrap gap-2">
        {SUGGESTED_QUESTIONS.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => void ask(q)}
            disabled={Boolean(pending)}
            className="rounded-full border px-3 py-1 text-sm transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50"
          >
            {q}
          </button>
        ))}
      </div>

      <form onSubmit={onSubmit} className="flex gap-2">
        <label htmlFor="ask-home-input" className="sr-only">
          Your question about this home
        </label>
        <Input
          id="ask-home-input"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask about pets, parking, wifi, check-in…"
          maxLength={500}
          disabled={Boolean(pending)}
        />
        <Button type="submit" disabled={Boolean(pending) || question.trim().length < 2}>
          <Send className="size-4" aria-hidden />
          <span className="sr-only sm:not-sr-only">Ask</span>
        </Button>
      </form>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
