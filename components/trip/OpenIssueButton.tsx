"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/** "Open an issue": tells the host about the severe differences (a feed event). */
export function OpenIssueButton({ reservationId }: { reservationId: string }) {
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");

  async function open() {
    setState("sending");
    const response = await fetch("/api/checkin/issue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reservationId }),
    }).catch(() => null);
    if (response?.ok) {
      setState("sent");
      toast.success("Issue opened. Your host has been told.");
    } else {
      setState("idle");
      const body = (await response?.json().catch(() => null)) as { message?: string } | null;
      toast.error(body?.message ?? "Could not open the issue. Try again.");
    }
  }

  return (
    <Button
      variant="outline"
      className="w-full border-amber-400 sm:w-auto"
      disabled={state !== "idle"}
      onClick={open}
    >
      {state === "sent" ? "Issue opened" : state === "sending" ? "Opening..." : "Open an issue"}
    </Button>
  );
}
