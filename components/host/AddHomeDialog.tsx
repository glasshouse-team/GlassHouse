"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { amenityLabel } from "@/components/listing/format";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NewHomeSchema, PROPERTY_TYPES, SUGGESTED_CITIES } from "@/lib/new-home";
import { dollarsToCents } from "@/lib/policy-form";
import type { Amenity } from "@/lib/schemas/core";

const fieldClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-base shadow-xs sm:text-sm focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none";

/** The amenities offered as checkboxes; the rest can come later from the narration draft. */
const AMENITY_CHOICES: Amenity[] = [
  "wifi",
  "kitchen",
  "washer",
  "dedicated_workspace",
  "heating",
  "air_conditioning",
  "free_parking",
  "tv",
  "balcony",
  "fireplace",
  "self_check_in",
  "crib",
];

const COUNTS = [
  { key: "max_guests", label: "Guests", start: "2" },
  { key: "bedrooms", label: "Bedrooms", start: "1" },
  { key: "beds", label: "Beds", start: "1" },
  { key: "baths", label: "Baths", start: "1" },
] as const;
type CountKey = (typeof COUNTS)[number]["key"];

/** A typed count as a number; blank is NaN, so the form says what is missing instead of 0. */
const count = (value: string) => (value.trim() === "" ? Number.NaN : Number(value));

/**
 * "Add a home" on the host dashboard (D-043): the basics a guest needs to find and price the
 * home. POST /api/listings publishes it with default agent rules, then the host goes to the
 * capture page to film it for the 3D.
 */
export function AddHomeDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [city, setCity] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [type, setType] = useState<(typeof PROPERTY_TYPES)[number]>("apartment");
  const [counts, setCounts] = useState<Record<CountKey, string>>(
    Object.fromEntries(COUNTS.map((c) => [c.key, c.start])) as Record<CountKey, string>,
  );
  const [price, setPrice] = useState("");
  const [cleaning, setCleaning] = useState("0");
  const [description, setDescription] = useState("");
  const [amenities, setAmenities] = useState<Amenity[]>([]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const parsed = NewHomeSchema.safeParse({
      title,
      city,
      neighborhood,
      description,
      property_type: type,
      max_guests: count(counts.max_guests),
      bedrooms: count(counts.bedrooms),
      beds: count(counts.beds),
      baths: count(counts.baths),
      base_price_cents: dollarsToCents(price) ?? Number.NaN,
      cleaning_fee_cents: dollarsToCents(cleaning) ?? 0,
      amenities,
    });
    if (!parsed.success) {
      toast.error(
        parsed.error.issues[0]?.message ??
          "Check the fields: whole numbers for rooms, prices in dollars.",
      );
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/listings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const body = (await response.json().catch(() => ({}))) as {
        id?: string;
        message?: string;
      };
      if (!response.ok || !body.id) {
        toast.error(body.message ?? "Could not list the home. Try again.");
        return;
      }
      toast.success(`${parsed.data.title} is listed. Now film it for the 3D tour.`);
      setOpen(false);
      router.push(`/host/capture/${body.id}`);
    } catch {
      toast.error("Network error. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="h-11 sm:h-9">
          <Plus aria-hidden /> Add a home
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add a home</DialogTitle>
          <DialogDescription>
            The basics guests search by. Next you film each room for the 3D tour, and you can
            redraft the text from a spoken walkthrough.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid min-w-0 gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="home-title">Title</Label>
            <Input
              id="home-title"
              required
              maxLength={80}
              placeholder="Sunny flat by the Dry Bridge"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="home-city">City</Label>
              <Input
                id="home-city"
                required
                list="home-cities"
                maxLength={60}
                value={city}
                onChange={(e) => setCity(e.target.value)}
              />
              <datalist id="home-cities">
                {SUGGESTED_CITIES.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="home-area">Neighborhood (optional)</Label>
              <Input
                id="home-area"
                maxLength={60}
                value={neighborhood}
                onChange={(e) => setNeighborhood(e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="home-type">Type</Label>
            <select
              id="home-type"
              className={fieldClass}
              value={type}
              onChange={(e) => setType(e.target.value as (typeof PROPERTY_TYPES)[number])}
            >
              {PROPERTY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t[0].toUpperCase() + t.slice(1)}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {COUNTS.map((c) => (
              <div key={c.key} className="grid gap-1.5">
                <Label htmlFor={`home-${c.key}`}>{c.label}</Label>
                <Input
                  id={`home-${c.key}`}
                  inputMode={c.key === "baths" ? "decimal" : "numeric"}
                  value={counts[c.key]}
                  onChange={(e) => setCounts((all) => ({ ...all, [c.key]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="home-price">Price per night ($)</Label>
              <Input
                id="home-price"
                required
                inputMode="decimal"
                placeholder="85"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="home-cleaning">Cleaning fee ($)</Label>
              <Input
                id="home-cleaning"
                inputMode="decimal"
                value={cleaning}
                onChange={(e) => setCleaning(e.target.value)}
              />
            </div>
          </div>
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">What the home has</legend>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              {AMENITY_CHOICES.map((a) => (
                <label key={a} className="flex min-h-11 items-center gap-2 text-sm sm:min-h-0">
                  <input
                    type="checkbox"
                    className="size-4 shrink-0 accent-[var(--brand)]"
                    checked={amenities.includes(a)}
                    onChange={(e) =>
                      setAmenities((current) =>
                        e.target.checked ? [...current, a] : current.filter((x) => x !== a),
                      )
                    }
                  />
                  {amenityLabel(a)}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid gap-1.5">
            <Label htmlFor="home-description">Description (optional)</Label>
            <Textarea
              id="home-description"
              rows={3}
              maxLength={1000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Your agent starts with safe rules: it may negotiate, never below your nightly price, and
            always asks you before booking. Change them under Agent rules.
          </p>
          <Button type="submit" disabled={saving} className="h-11 sm:h-9">
            {saving ? "Listing..." : "List this home"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
