"use client";

import { CheckCircle2, Inbox, Loader2 } from "lucide-react";
import { useCallback, useEffect, useId, useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { hasSupabaseEnv, supabaseBrowser } from "@/lib/supabase";

const WaitingSchema = z.object({
  id: z.string(),
  body: z.string(),
  created_at: z.string(),
  conversations: z.object({ listings: z.object({ title: z.string() }) }),
});
type Waiting = z.infer<typeof WaitingSchema>;

const askedAt = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Tbilisi",
});

function WaitingItem({ question, onDone }: { question: Waiting; onDone: (id: string) => void }) {
  const [answer, setAnswer] = useState("");
  const [save, setSave] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fieldId = useId();

  async function send() {
    if (!answer.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
      const response = await fetch("/api/qa/reply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messageId: question.id, answer, saveToManual: save }),
      });
      const body = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) throw new Error(body.message ?? "Could not send the reply.");
      onDone(question.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send the reply.");
    } finally {
      setSending(false);
    }
  }

  return (
    <li className="space-y-2 rounded-lg border p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{question.conversations.listings.title}</span>
        <time dateTime={question.created_at}>{askedAt.format(new Date(question.created_at))}</time>
      </div>
      <p className="text-sm">&ldquo;{question.body}&rdquo;</p>
      <label htmlFor={fieldId} className="sr-only">
        Your answer
      </label>
      <Textarea
        id={fieldId}
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        placeholder="Your answer to the guest"
        maxLength={600}
        rows={2}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-sm max-sm:min-h-11 max-sm:pr-2">
          <input
            type="checkbox"
            checked={save}
            onChange={(e) => setSave(e.target.checked)}
            className="size-4 accent-[var(--brand)] max-sm:size-5"
          />
          Save to house manual
        </label>
        <Button
          size="sm"
          onClick={() => void send()}
          disabled={sending || !answer.trim()}
          className="max-sm:h-11 max-sm:px-4"
        >
          {sending && <Loader2 className="size-4 animate-spin" aria-hidden />}
          Send reply
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </li>
  );
}

/** Host dashboard slot (GH-5 contract, built in GH-16). Keep the name and props. */
export function QuestionsWaiting({ hostId }: { hostId: string }) {
  const channelName = `qa-waiting-${useId()}`;
  const configured = hasSupabaseEnv();
  const [questions, setQuestions] = useState<Waiting[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [answered, setAnswered] = useState(0);

  const load = useCallback(async () => {
    const { data } = await supabaseBrowser()
      .from("messages")
      .select("id, body, created_at, conversations!inner(listings!inner(title, host_id))")
      .eq("needs_host", true)
      .eq("conversations.listings.host_id", hostId)
      .order("created_at", { ascending: true });
    setQuestions(
      (data ?? []).flatMap((row) => {
        const parsed = WaitingSchema.safeParse(row);
        return parsed.success ? [parsed.data] : [];
      }),
    );
    setLoaded(true);
  }, [hostId]);

  // A new forwarded question (or one answered in another tab) refreshes the list live.
  useEffect(() => {
    if (!configured) return;
    const db = supabaseBrowser();
    const channel = db
      .channel(channelName)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => {
        void load();
      })
      .subscribe((state) => {
        if (state === "SUBSCRIBED") void load();
      });
    return () => {
      db.removeChannel(channel);
    };
  }, [configured, channelName, load]);

  function done(id: string) {
    setQuestions((current) => current.filter((q) => q.id !== id));
    setAnswered((n) => n + 1);
  }

  return (
    <section className="space-y-3 rounded-xl border p-4" aria-labelledby="questions-waiting-title">
      <div className="flex items-center justify-between gap-2">
        <h2 id="questions-waiting-title" className="flex items-center gap-2 font-semibold">
          <Inbox className="size-4 text-brand" aria-hidden />
          Questions waiting
        </h2>
        {questions.length > 0 && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
            {questions.length}
          </span>
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        Your host agent forwards what the house rules and manual don&apos;t answer. Save a reply to
        the manual and the agent answers it next time.
      </p>
      {!configured && <p className="text-sm text-muted-foreground">Supabase is not configured.</p>}
      {configured && !loaded && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden /> Loading questions…
        </p>
      )}
      {loaded && questions.length === 0 && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <CheckCircle2 className="size-4 text-brand" aria-hidden />
          {answered > 0 ? "All caught up. The guest sees your reply now." : "No questions waiting."}
        </p>
      )}
      {questions.length > 0 && (
        <ul className="space-y-3">
          {questions.map((q) => (
            <WaitingItem key={q.id} question={q} onDone={done} />
          ))}
        </ul>
      )}
    </section>
  );
}
