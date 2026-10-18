import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SEARCH_CITIES } from "@/components/search/filters";

const fieldClass =
  "h-9 rounded-md border border-input bg-background px-3 text-base shadow-xs sm:text-sm focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none";

/** City and guests filters: a plain GET form, so it works before any JavaScript loads. */
export function SearchFilters({ city, guests }: { city?: string; guests?: number }) {
  return (
    <form method="get" className="flex flex-wrap items-end gap-3" aria-label="Filter homes">
      <label className="grid gap-1 text-xs font-medium">
        City
        <select name="city" defaultValue={city ?? ""} className={fieldClass}>
          <option value="">Anywhere</option>
          {SEARCH_CITIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-xs font-medium">
        Guests
        <input
          type="number"
          name="guests"
          min={1}
          max={16}
          defaultValue={guests ?? ""}
          placeholder="Any"
          className={`${fieldClass} w-24`}
        />
      </label>
      <Button type="submit" variant="secondary">
        Apply
      </Button>
      {(city || guests) && (
        <Link
          href="/search"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          Clear
        </Link>
      )}
    </form>
  );
}
