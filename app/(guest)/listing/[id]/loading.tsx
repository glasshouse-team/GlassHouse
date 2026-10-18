import { Skeleton } from "@/components/ui/skeleton";

// Shown at once while a listing page loads (same layout as the page).
export default function ListingLoading() {
  return (
    <div className="space-y-6">
      <p className="sr-only">Loading this home…</p>
      <div className="space-y-2">
        <Skeleton className="h-8 w-3/4 max-w-xl" />
        <Skeleton className="h-4 w-48" />
      </div>
      <Skeleton className="aspect-[4/3] w-full rounded-2xl sm:aspect-[21/9]" />
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-28 w-full" />
        </div>
        <Skeleton className="hidden h-80 rounded-2xl lg:block" />
      </div>
    </div>
  );
}
