"use client";

import { format, parseISO } from "date-fns";
import { CalendarDays, Minus, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { DateRange } from "react-day-picker";
import { toast } from "sonner";
import { NegotiateButton } from "@/components/deal/NegotiateButton";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { bookingProblem, stayRangeLabel } from "@/lib/booking";
import { computeQuote, type PriceableListing, type PriceOverride } from "@/lib/pricing";
import type { Quote } from "@/lib/schemas/core";
import { formatCents } from "@/lib/utils";

export interface BookingBoxProps {
  listingId: string;
  title: string;
  pricing: PriceableListing;
  maxGuests: number;
  blockedDates: string[];
  overrides: PriceOverride[];
  /** Today as "YYYY-MM-DD" from the server, so the calendar and the API agree. */
  today: string;
  initial: { checkIn: string; checkOut: string; guests: number };
  /** False in the host view: only guests book. */
  canBook: boolean;
}

const toIso = (date: Date) => format(date, "yyyy-MM-dd");

function priceLines(quote: Quote): [string, number][] {
  return [
    [`${quote.nights} ${quote.nights === 1 ? "night" : "nights"}`, quote.nightlyTotalCents],
    ["Cleaning fee", quote.cleaningCents],
    ...(quote.discountCents > 0 ? [["Discount", -quote.discountCents] as [string, number]] : []),
    ["Service fee", quote.serviceFeeCents],
  ];
}

function PriceLines({ quote }: { quote: Quote }) {
  return (
    <dl className="space-y-2 text-sm">
      {priceLines(quote).map(([label, cents]) => (
        <div key={label} className="flex justify-between">
          <dt className="text-muted-foreground">{label}</dt>
          <dd>{cents < 0 ? `-${formatCents(-cents)}` : formatCents(cents)}</dd>
        </div>
      ))}
      <Separator />
      <div className="flex justify-between font-semibold">
        <dt>Total</dt>
        <dd>{formatCents(quote.totalCents)}</dd>
      </div>
    </dl>
  );
}

/**
 * Dates, guests and the price from computeQuote; Reserve books at the list price after a
 * confirm dialog (POST /api/reservations recomputes the price on the server). A sticky card
 * on wide screens, a bottom bar with a sheet on phones.
 */
export function BookingBox(props: BookingBoxProps) {
  const router = useRouter();
  const [range, setRange] = useState<DateRange | undefined>({
    from: parseISO(props.initial.checkIn),
    to: parseISO(props.initial.checkOut),
  });
  const [guests, setGuests] = useState(props.initial.guests);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);

  const checkIn = range?.from ? toIso(range.from) : "";
  const checkOut = range?.to ? toIso(range.to) : "";
  const problem =
    !checkIn || !checkOut
      ? "Pick your check-in and check-out dates"
      : bookingProblem({
          checkIn,
          checkOut,
          guests,
          maxGuests: props.maxGuests,
          blockedDates: props.blockedDates,
          today: props.today,
        });
  let quote: Quote | null = null;
  if (!problem) {
    try {
      quote = computeQuote({
        listing: props.pricing,
        checkIn,
        checkOut,
        overrides: props.overrides,
      });
    } catch {
      quote = null;
    }
  }

  async function reserve() {
    setSaving(true);
    try {
      const response = await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId: props.listingId, checkIn, checkOut, guests }),
      });
      const body = (await response.json().catch(() => ({}))) as { id?: string; message?: string };
      if (!response.ok || !body.id) {
        toast.error(body.message ?? "Could not book this stay. Try again.");
        return;
      }
      const tripId = body.id;
      setConfirming(false);
      setSheetOpen(false);
      toast.success("Booked. Your trip is confirmed.", {
        action: { label: "View trip", onClick: () => router.push(`/trip/${tripId}`) },
      });
      router.refresh();
    } catch {
      toast.error("Network error. Try again.");
    } finally {
      setSaving(false);
    }
  }

  const form = (
    <div className="space-y-4">
      <p className="text-lg">
        <span className="font-semibold">{formatCents(props.pricing.base_price_cents)}</span>{" "}
        <span className="text-sm text-muted-foreground">night</span>
      </p>
      <div className="grid grid-cols-2 overflow-hidden rounded-lg border">
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="col-span-2 flex items-center gap-2 border-b px-3 py-2 text-left text-sm hover:bg-muted"
            >
              <CalendarDays className="size-4 text-muted-foreground" aria-hidden />
              <span>
                <span className="block text-[10px] font-semibold uppercase">Dates</span>
                {checkIn && checkOut ? stayRangeLabel(checkIn, checkOut) : "Add dates"}
              </span>
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="range"
              selected={range}
              onSelect={setRange}
              defaultMonth={range?.from}
              disabled={[
                { before: parseISO(props.today) },
                ...props.blockedDates.map((d) => parseISO(d)),
              ]}
            />
          </PopoverContent>
        </Popover>
        <div className="col-span-2 flex items-center justify-between px-3 py-2 text-sm">
          <span>
            <span className="block text-[10px] font-semibold uppercase">Guests</span>
            {guests} {guests === 1 ? "guest" : "guests"}
          </span>
          <span className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-8 rounded-full"
              aria-label="Fewer guests"
              disabled={guests <= 1}
              onClick={() => setGuests((g) => g - 1)}
            >
              <Minus />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-8 rounded-full"
              aria-label="More guests"
              disabled={guests >= props.maxGuests}
              onClick={() => setGuests((g) => g + 1)}
            >
              <Plus />
            </Button>
          </span>
        </div>
      </div>

      <Button
        type="button"
        className="w-full"
        size="lg"
        disabled={!quote || !props.canBook}
        onClick={() => setConfirming(true)}
      >
        Reserve
      </Button>
      <NegotiateButton
        listingId={props.listingId}
        checkIn={checkIn}
        checkOut={checkOut}
        guests={guests}
        listTotalCents={quote?.hostSubtotalCents ?? null}
        canNegotiate={props.canBook}
      />
      {!props.canBook && (
        <p className="text-center text-xs text-muted-foreground">
          Switch to the guest view to book.
        </p>
      )}
      {/* Announced to screen readers when the dates or guests change. */}
      <div aria-live="polite">
        {problem ? (
          <p className="text-sm text-destructive">{problem}</p>
        ) : (
          quote && <PriceLines quote={quote} />
        )}
      </div>
    </div>
  );

  return (
    <>
      <div className="hidden rounded-2xl border bg-card p-5 shadow-md lg:block">{form}</div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background px-4 py-3 lg:hidden">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <div className="text-sm">
            <p className="font-semibold">
              {quote
                ? `${formatCents(quote.totalCents)} total`
                : `${formatCents(props.pricing.base_price_cents)} night`}
            </p>
            <p className="text-xs text-muted-foreground">
              {checkIn && checkOut ? stayRangeLabel(checkIn, checkOut) : "Add dates"}
            </p>
          </div>
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetTrigger asChild>
              <Button size="lg">Reserve</Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto px-4 pb-6">
              <SheetHeader className="px-0">
                <SheetTitle>{props.title}</SheetTitle>
              </SheetHeader>
              {form}
            </SheetContent>
          </Sheet>
        </div>
      </div>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm your stay</DialogTitle>
            <DialogDescription>
              {props.title} · {checkIn && checkOut ? stayRangeLabel(checkIn, checkOut) : ""} ·{" "}
              {guests} {guests === 1 ? "guest" : "guests"}
            </DialogDescription>
          </DialogHeader>
          {quote && <PriceLines quote={quote} />}
          <p className="text-xs text-muted-foreground">Payment is mocked: nothing is charged.</p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirming(false)}>
              Back
            </Button>
            <Button type="button" onClick={reserve} disabled={saving}>
              {saving ? "Booking…" : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
