"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { approvalPrompt } from "@/components/deal/format";
import { Button } from "@/components/ui/button";
import { stayRangeLabel } from "@/lib/booking";
import { DealSchema } from "@/lib/schemas/core";
import { hasSupabaseEnv, supabaseBrowser } from "@/lib/supabase";

export interface ApprovalItem {
  dealId: string;
  title: string;
  prompt: string;
}

export interface ApprovalsQueueProps {
  initial: ApprovalItem[];
  /** The host's homes, by id: what a live update is about. */
  listings: { id: string; title: string }[];
}

/**
 * The host's approvals (GH-15): prices the agents agreed below auto-accept. New ones arrive
 * live with a toast; Approve books the stay (POST /api/deals/[id]/approve).
 */
export function ApprovalsQueue({ initial, listings }: ApprovalsQueueProps) {
  const [items, setItems] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const idsKey = listings.map((l) => l.id).join(",");
  // A channel name of its own per mount: React dev mounts effects twice, and a shared topic
  // lets the first mount's leave close the second mount's channel.
  const channelId = useId();

  useEffect(() => {
    if (!hasSupabaseEnv() || !idsKey) return;
    const titles = new Map(listings.map((l) => [l.id, l.title]));
    const db = supabaseBrowser();
    const channel = db
      .channel(`approvals-${channelId}`)
      .on(
        // No server filter: Realtime didn't deliver UPDATEs through `listing_id=in.(...)`.
        // Deals are public-read, so the host's homes are picked here instead.
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "deals" },
        (payload) => {
          const deal = DealSchema.safeParse(payload.new);
          if (!deal.success || !titles.has(deal.data.listing_id)) return;
          const d = deal.data;
          if (d.status !== "agreed_pending_host" || d.final_total_cents === null) {
            setItems((current) => current.filter((i) => i.dealId !== d.id));
            return;
          }
          const item = {
            dealId: d.id,
            title: titles.get(d.listing_id) ?? "Your home",
            prompt: approvalPrompt(
              d.final_total_cents,
              d.list_total_cents,
              stayRangeLabel(d.check_in, d.check_out),
            ),
          };
          setItems((current) =>
            current.some((i) => i.dealId === d.id) ? current : [item, ...current],
          );
          toast(item.prompt, { description: item.title, duration: 15_000 });
        },
      )
      .subscribe(async (status) => {
        if (status !== "SUBSCRIBED") return;
        const { data, error } = await db
          .from("deals")
          .select("*")
          .eq("status", "agreed_pending_host")
          .in("listing_id", idsKey.split(","));
        // Keep what's shown if the reload fails; live updates still arrive.
        if (error) return;
        const fresh = (data ?? []).flatMap((row) => {
          const d = DealSchema.safeParse(row);
          if (!d.success || d.data.final_total_cents === null) return [];
          return [
            {
              dealId: d.data.id,
              title: titles.get(d.data.listing_id) ?? "Your home",
              prompt: approvalPrompt(
                d.data.final_total_cents,
                d.data.list_total_cents,
                stayRangeLabel(d.data.check_in, d.data.check_out),
              ),
            },
          ];
        });
        setItems(fresh);
      });
    return () => {
      db.removeChannel(channel);
    };
    // listings only changes with idsKey
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId, idsKey]);

  async function decide(dealId: string, decision: "approve" | "decline") {
    setBusy(dealId);
    try {
      const response = await fetch(`/api/deals/${dealId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const body = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) toast.error(body.message ?? "That didn't work. Try again.");
      else {
        toast.success(decision === "approve" ? "Approved: it's booked" : "Declined");
        setItems((current) => current.filter((i) => i.dealId !== dealId));
      }
    } catch {
      toast.error("Network error. Try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="space-y-3 rounded-xl border p-4" aria-label="Approvals">
      <h3 className="font-medium">Approvals</h3>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing to approve. Prices your agent agrees below your auto-accept level show up here.
        </p>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <li
              key={item.dealId}
              className="space-y-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-950"
            >
              <p className="font-medium">{item.prompt}</p>
              <p className="text-xs">
                {item.title} ·{" "}
                <Link href={`/deal/${item.dealId}`} className="underline underline-offset-2">
                  Open the deal room
                </Link>
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={busy === item.dealId}
                  onClick={() => decide(item.dealId, "approve")}
                >
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy === item.dealId}
                  onClick={() => decide(item.dealId, "decline")}
                >
                  Decline
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
