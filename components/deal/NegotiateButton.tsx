"use client";

import { Handshake } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface NegotiateButtonProps {
  listingId: string;
  checkIn: string;
  checkOut: string;
  guests: number;
}

/**
 * Opens the negotiation (GH-15 fills it in: guest target and max, then the deal room).
 * Shown on every listing: whether a host negotiates is private to the host side.
 */
export function NegotiateButton({ listingId, checkIn, checkOut, guests }: NegotiateButtonProps) {
  return (
    <Button
      type="button"
      variant="outline"
      className="w-full"
      disabled
      title="Agents negotiate the price for you (coming soon)"
      data-listing-id={listingId}
      data-stay={`${checkIn}/${checkOut}/${guests}`}
    >
      <Handshake /> Negotiate
    </Button>
  );
}
