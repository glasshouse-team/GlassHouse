import { ComingSoon } from "@/components/ui/coming-soon";

export interface ActivityFeedProps {
  filter: "listing" | "deal" | "all";
  listingId?: string;
  dealId?: string;
  compact?: boolean;
}

/**
 * Live activity feed (contract from GH-5, built by Beka in GH-12).
 * Loads the last 50 events, then subscribes to Supabase Realtime inserts on `events`.
 */
export function ActivityFeed({ filter, listingId, dealId }: ActivityFeedProps) {
  return (
    <ComingSoon title="Activity feed" ticket="GH-12" owner="Beka">
      <p className="mt-2 text-xs text-neutral-400">
        Filter: {filter}
        {listingId ? `, listing ${listingId}` : ""}
        {dealId ? `, deal ${dealId}` : ""}
      </p>
    </ComingSoon>
  );
}
