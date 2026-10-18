"use client";

import { Check, House, Info, Luggage, ShieldAlert, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { approvalPrompt, differenceFromList } from "@/components/deal/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { dollarsToCents } from "@/lib/policy-form";
import { DealSchema, type Deal } from "@/lib/schemas/core";
import { hasSupabaseEnv, supabaseBrowser } from "@/lib/supabase";
import { cn, formatCents } from "@/lib/utils";

export const DealMessageViewSchema = z.object({
  id: z.string(),
  actor: z.string(),
  type: z.string(),
  amount_cents: z.number().nullable(),
  body: z.string(),
  created_at: z.string(),
});
export type DealMessageView = z.infer<typeof DealMessageViewSchema>;

export interface DealRoomProps {
  initialDeal: Deal;
  initialMessages: DealMessageView[];
  stay: string;
  guestName: string;
  hostName: string;
  /** The viewer is this deal's guest / this home's host. */
  isGuest: boolean;
  isHost: boolean;
}

const STATUS: Record<Deal["status"], { label: string; tone: string }> = {
  open: { label: "Agents negotiating", tone: "bg-actor-guest/15 text-actor-guest" },
  agreed_pending_host: {
    label: "Agreed, waiting for the host",
    tone: "bg-amber-100 text-amber-900",
  },
  approved: { label: "Booked", tone: "bg-brand/15 text-brand" },
  declined: { label: "Ended without a deal", tone: "bg-muted text-muted-foreground" },
  escalated: { label: "Waiting for a person", tone: "bg-amber-100 text-amber-900" },
  expired: { label: "Round limit reached", tone: "bg-muted text-muted-foreground" },
};

function who(actor: string, names: { guest: string; host: string }) {
  if (actor === "guest_agent")
    return { label: "Guest agent", icon: Luggage, tone: "text-actor-guest" };
  if (actor === "host_agent") return { label: "Host agent", icon: House, tone: "text-actor-host" };
  if (actor === "guest") return { label: names.guest, icon: UserRound, tone: "text-actor-human" };
  if (actor === "host") return { label: names.host, icon: UserRound, tone: "text-actor-human" };
  return { label: "Glasshouse", icon: Info, tone: "text-actor-system" };
}

const VERB: Record<string, string> = {
  offer: "offered",
  counter: "countered",
  accept: "accepted",
  decline: "declined",
  escalate: "asked the host",
  question: "asked",
  info: "",
};

/** The live deal room (GH-15): offers as they happen, the rules' refusals, and the next step. */
export function DealRoom(props: DealRoomProps) {
  const [deal, setDeal] = useState(props.initialDeal);
  const [messages, setMessages] = useState(props.initialMessages);
  const [busy, setBusy] = useState(false);
  const [counter, setCounter] = useState("");
  const names = { guest: props.guestName, host: props.hostName };

  useEffect(() => {
    if (!hasSupabaseEnv()) return;
    const db = supabaseBrowser();
    const channel = db
      .channel(`deal-${deal.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "deal_messages",
          filter: `deal_id=eq.${deal.id}`,
        },
        (payload) => {
          const row = DealMessageViewSchema.safeParse(payload.new);
          if (row.success)
            setMessages((current) =>
              current.some((m) => m.id === row.data.id) ? current : [...current, row.data],
            );
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "deals", filter: `id=eq.${deal.id}` },
        (payload) => {
          const row = DealSchema.safeParse(payload.new);
          if (row.success) setDeal(row.data);
        },
      )
      .subscribe();
    return () => {
      db.removeChannel(channel);
    };
  }, [deal.id]);

  async function send(path: "action" | "approve", body: Record<string, unknown>, done: string) {
    setBusy(true);
    try {
      const response = await fetch(`/api/deals/${deal.id}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) toast.error(result.message ?? "That didn't work. Try again.");
      else toast.success(done);
    } catch {
      toast.error("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const status = STATUS[deal.status];
  const hostOffered = messages.some(
    (m) =>
      (m.actor === "host_agent" || m.actor === "host") &&
      (m.type === "offer" || m.type === "counter"),
  );
  const guestCanAct = props.isGuest && ["open", "escalated", "expired"].includes(deal.status);
  const hostCanCounter =
    props.isHost && ["open", "escalated", "agreed_pending_host"].includes(deal.status);

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {props.stay} · {deal.guests} guests · list {formatCents(deal.list_total_cents)} · round{" "}
          {deal.rounds}
        </p>
        <span
          className={cn("rounded-full px-3 py-1 text-xs font-semibold", status.tone)}
          role="status"
        >
          {status.label}
        </span>
      </div>

      <ol className="space-y-3" aria-label="Offers" aria-live="polite">
        {messages.length === 0 && (
          <li className="text-sm text-muted-foreground">
            The guest agent is preparing its first offer…
          </li>
        )}
        {messages.map((m) => {
          if (m.type === "rejected")
            return (
              <li key={m.id} className="flex items-start gap-2 pl-2 text-xs text-muted-foreground">
                <ShieldAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                Rules check: {m.body}
              </li>
            );
          const actor = who(m.actor, names);
          const Icon = actor.icon;
          const money = m.amount_cents !== null;
          return (
            <li key={m.id} className="flex gap-3 rounded-2xl border bg-card p-4">
              <Icon className={cn("mt-0.5 size-5 shrink-0", actor.tone)} aria-hidden />
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-sm">
                  <span className={cn("font-semibold", actor.tone)}>{actor.label}</span>{" "}
                  {VERB[m.type] ?? ""}
                  {money && (
                    <>
                      {" "}
                      <span className="text-lg font-semibold">
                        {formatCents(m.amount_cents!)}
                      </span>{" "}
                      <span className="text-muted-foreground">
                        {differenceFromList(m.amount_cents!, deal.list_total_cents) || "list price"}
                      </span>
                    </>
                  )}
                </p>
                {m.body && <p className="text-sm text-muted-foreground">{m.body}</p>}
              </div>
              {m.type === "accept" && <Check className="size-5 text-brand" aria-hidden />}
            </li>
          );
        })}
      </ol>

      {deal.status === "agreed_pending_host" && deal.final_total_cents !== null && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          {props.isHost
            ? approvalPrompt(deal.final_total_cents, deal.list_total_cents, props.stay)
            : `Agreed at ${formatCents(deal.final_total_cents)}. Waiting for ${props.hostName} to approve.`}
          {props.isHost && (
            <div className="mt-3 flex gap-2">
              <Button
                disabled={busy}
                onClick={() => send("approve", { decision: "approve" }, "Approved: it's booked")}
              >
                Approve
              </Button>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => send("approve", { decision: "decline" }, "Declined")}
              >
                Decline
              </Button>
            </div>
          )}
        </div>
      )}
      {deal.status === "approved" && (
        <p className="rounded-2xl border border-brand/40 bg-brand/10 p-4 text-sm font-medium text-brand">
          Booked at {formatCents(deal.final_total_cents ?? deal.list_total_cents)} before the
          service fee.
        </p>
      )}

      {(guestCanAct || hostCanCounter) && (
        <div className="flex flex-wrap items-end gap-2 border-t pt-4">
          {guestCanAct && (
            <>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => send("action", { action: "stop" }, "Stopped")}
              >
                Stop
              </Button>
              <Button
                disabled={busy || !hostOffered}
                onClick={() =>
                  send("action", { action: "accept_last" }, "Accepted the host's last offer")
                }
              >
                Accept last offer
              </Button>
            </>
          )}
          {hostCanCounter && (
            <form
              className="flex items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const cents = dollarsToCents(counter);
                if (!cents || Number.isNaN(cents)) return toast.error("Enter a price in dollars.");
                void send("action", { action: "counter", amountCents: cents }, "Counter sent");
              }}
            >
              <label className="grid gap-1 text-xs font-medium">
                Counter myself ($)
                <Input
                  className="w-28"
                  inputMode="decimal"
                  value={counter}
                  onChange={(e) => setCounter(e.target.value)}
                />
              </label>
              <Button type="submit" variant="outline" disabled={busy}>
                Send
              </Button>
            </form>
          )}
        </div>
      )}
    </section>
  );
}
