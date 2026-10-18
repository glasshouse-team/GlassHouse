import { BriefBox } from "@/components/search/BriefBox";
import { parseSearchFilters } from "@/components/search/filters";
import { ListingCard } from "@/components/search/ListingCard";
import { SearchFilters } from "@/components/search/SearchFilters";
import { searchListings } from "@/lib/data/listings";

export const metadata = { title: "Find a home · Glasshouse" };

// Trip brief box (the guest agent's shortlist, GH-14) above the card grid and simple filters. Owner: Beka.
export default async function SearchPage(props: PageProps<"/search">) {
  const filters = parseSearchFilters(await props.searchParams);
  const listings = await searchListings(filters);

  return (
    <div className="space-y-6">
      <h1 className="sr-only">Find a home</h1>
      <BriefBox />
      <h2 className="pt-4 text-lg font-semibold">All homes</h2>
      <SearchFilters city={filters.city} guests={filters.guests} />
      <p className="text-sm text-muted-foreground">
        {listings.length === 1 ? "1 home" : `${listings.length} homes`}
        {filters.city ? ` in ${filters.city}` : ""}
        {filters.guests ? ` for ${filters.guests}+ guests` : ""}
      </p>
      {listings.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          No homes match these filters. Try another city or fewer guests.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
          {listings.map((listing) => (
            <ListingCard key={listing.id} listing={listing} />
          ))}
        </div>
      )}
    </div>
  );
}
