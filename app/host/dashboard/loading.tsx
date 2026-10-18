import { Skeleton } from "@/components/ui/skeleton";

// Shown at once while the host dashboard loads.
export default function DashboardLoading() {
  return (
    <div className="space-y-10">
      <p className="sr-only">Loading your dashboard…</p>
      <Skeleton className="h-8 w-64" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-28 rounded-xl" />
        <Skeleton className="h-28 rounded-xl" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-72 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    </div>
  );
}
