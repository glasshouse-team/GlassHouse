"use client";

import { Handshake, Lock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { stayRangeLabel } from "@/lib/booking";
import { centsToDollars, dollarsToCents } from "@/lib/policy-form";
import { formatCents } from "@/lib/utils";

export interface NegotiateButtonProps {
  listingId: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  /** computeQuote's host subtotal (nights + cleaning) for these dates; null while dates are invalid. */
  listTotalCents?: number | null;
  /** False in the host view: only guests negotiate. */
  canNegotiate?: boolean;
}

const roundTo5 = (cents: number) => Math.round(cents / 500) * 500;

/**
 * "Negotiate": the guest sets a target and a private maximum; the guest agent then negotiates
 * with the host agent in the deal room (POST /api/deals starts it). Shown on every listing:
 * whether a host negotiates is private to the host side.
 */
export function NegotiateButton(props: NegotiateButtonProps) {
  const router = useRouter();
  const list = props.listTotalCents ?? null;
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState("");
  const [max, setMax] = useState("");
  const [saving, setSaving] = useState(false);
  const usable =
    props.canNegotiate !== false && list !== null && !!props.checkIn && !!props.checkOut;

  function onOpenChange(next: boolean) {
    if (next && list !== null) {
      // Starting points the guest can change: 10% and 4% under the list.
      setTarget(centsToDollars(roundTo5(list * 0.9)));
      setMax(centsToDollars(roundTo5(list * 0.96)));
    }
    setOpen(next);
  }

  async function start(event: React.FormEvent) {
    event.preventDefault();
    const targetCents = dollarsToCents(target);
    const maxCents = dollarsToCents(max);
    if (
      maxCents === null ||
      Number.isNaN(maxCents) ||
      (targetCents !== null && Number.isNaN(targetCents))
    ) {
      toast.error("Enter prices in dollars, like 470 or 470.50.");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/deals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingId: props.listingId,
          checkIn: props.checkIn,
          checkOut: props.checkOut,
          guests: props.guests,
          targetCents,
          maxCents,
        }),
      });
      const body = (await response.json().catch(() => ({}))) as { id?: string; message?: string };
      if (!response.ok || !body.id) {
        toast.error(body.message ?? "Couldn't start the negotiation. Try again.");
        return;
      }
      router.push(`/deal/${body.id}`);
    } catch {
      toast.error("Network error. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="w-full"
          disabled={!usable}
          title={props.canNegotiate === false ? "Switch to the guest view to negotiate" : undefined}
        >
          <Handshake /> Negotiate
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={start} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Let your agent negotiate</DialogTitle>
            <DialogDescription>
              {props.checkIn && props.checkOut ? stayRangeLabel(props.checkIn, props.checkOut) : ""}{" "}
              · {props.guests} guests · list price {list !== null ? formatCents(list) : "-"} before
              the service fee
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="deal-target">What would you like to pay? ($)</Label>
            <Input
              id="deal-target"
              inputMode="decimal"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="deal-max">Most you&apos;d pay ($)</Label>
            <Input
              id="deal-max"
              inputMode="decimal"
              value={max}
              onChange={(e) => setMax(e.target.value)}
            />
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <Lock className="size-3" aria-hidden /> Private: only your agent knows this. The host
              never sees it.
            </p>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={saving}>
              {saving ? "Starting…" : "Start negotiating"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
