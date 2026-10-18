"use client";

import { Lock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { defaultPolicy } from "@/lib/new-home";
import {
  ALLOWED_TERMS,
  centsToDollars,
  dollarsToCents,
  PolicyFormSchema,
  type PolicyForm,
} from "@/lib/policy-form";

export interface AgentRulesFormProps {
  listingId: string;
  /** The saved rules, or null when the host has none yet. */
  initial: PolicyForm | null;
  /** Used for the default floor when there are no rules yet. */
  basePriceCents: number;
}

type TermKey = PolicyForm["allowed_terms"][number];

/**
 * The host's agent rules: how the host agent may negotiate for this home. Private to the host
 * side; saved through PUT /api/host-policies/[listingId]. Money is entered in dollars and
 * sent as integer cents.
 */
export function AgentRulesForm({ listingId, initial, basePriceCents }: AgentRulesFormProps) {
  const router = useRouter();
  const start: PolicyForm = initial ?? defaultPolicy(basePriceCents);
  const [negotiable, setNegotiable] = useState(start.negotiable);
  const [floor, setFloor] = useState(centsToDollars(start.floor_nightly_cents));
  const [maxDiscount, setMaxDiscount] = useState(String(start.max_discount_pct));
  const [autoAccept, setAutoAccept] = useState(centsToDollars(start.auto_accept_total_cents));
  const [terms, setTerms] = useState<TermKey[]>(start.allowed_terms);
  const [saving, setSaving] = useState(false);
  const id = (field: string) => `${listingId}-${field}`;

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const parsed = PolicyFormSchema.safeParse({
      negotiable,
      floor_nightly_cents: dollarsToCents(floor),
      max_discount_pct: Number(maxDiscount),
      auto_accept_total_cents: dollarsToCents(autoAccept),
      allowed_terms: terms,
    });
    if (!parsed.success) {
      toast.error(
        "Check the numbers: prices above $0 in dollars and cents, a discount from 0 to 100%.",
      );
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(`/api/host-policies/${listingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const body = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) toast.error(body.message ?? "Could not save the rules. Try again.");
      else {
        toast.success("Agent rules saved");
        router.refresh();
      }
    } catch {
      toast.error("Network error. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-4 rounded-xl border bg-card p-4">
      <div>
        <h3 className="font-medium">Agent rules</h3>
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <Lock className="size-3" aria-hidden /> Private: guests and their agent never see these.
        </p>
      </div>
      <div className="flex items-center justify-between gap-4">
        <Label htmlFor={id("negotiable")}>Let my agent negotiate the price</Label>
        <Switch id={id("negotiable")} checked={negotiable} onCheckedChange={setNegotiable} />
      </div>
      <div className="grid gap-4 sm:grid-cols-3 sm:items-end">
        <div className="grid gap-1.5">
          <Label htmlFor={id("floor")}>Lowest price per night ($)</Label>
          <Input
            id={id("floor")}
            inputMode="decimal"
            value={floor}
            onChange={(e) => setFloor(e.target.value)}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={id("discount")}>Largest discount (%)</Label>
          <Input
            id={id("discount")}
            inputMode="numeric"
            value={maxDiscount}
            onChange={(e) => setMaxDiscount(e.target.value)}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={id("auto")}>Book without asking from ($)</Label>
          <Input
            id={id("auto")}
            inputMode="decimal"
            placeholder="Always ask me"
            value={autoAccept}
            onChange={(e) => setAutoAccept(e.target.value)}
          />
        </div>
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Extras my agent may offer instead</legend>
        <div className="flex flex-wrap gap-4">
          {ALLOWED_TERMS.map((term) => (
            <label key={term.key} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-[var(--brand)]"
                checked={terms.includes(term.key)}
                onChange={(e) =>
                  setTerms((current) =>
                    e.target.checked
                      ? [...current, term.key]
                      : current.filter((t) => t !== term.key),
                  )
                }
              />
              {term.label}
            </label>
          ))}
        </div>
      </fieldset>
      <Button type="submit" disabled={saving}>
        {saving ? "Saving…" : "Save rules"}
      </Button>
    </form>
  );
}
