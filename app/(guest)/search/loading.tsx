import { Skeleton } from "@/components/ui/skeleton";

// Shown at once while the search page loads its homes.
export default function SearchLoading() {
  return (
    <div className="space-y-6">
      <p className="sr-only">Loading homes…</p>
      <Skeleton className="h-40 w-full rounded-2xl" />
      <Skeleton className="h-9 w-64" />
      <div className="grid grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="aspect-[4/3] w-full rounded-xl" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/3" />
          </div>
        ))}
      </div>
    </div>
  );
}
