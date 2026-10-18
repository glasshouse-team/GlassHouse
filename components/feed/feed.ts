/**
 * Pure helpers for the activity feed (GH-12): who wrote a row, how it looks, which rows a
 * feed shows, and merging the first load with live inserts. No Supabase here, so it is tested.
 */
import { Cog, House, Luggage, ShieldCheck, UserRound, type LucideIcon } from "lucide-react";
import { z } from "zod";

/** One `events` row as the browser reads it (select * or a Realtime INSERT payload). */
export const FeedEventSchema = z.object({
  id: z.number().int(),
  created_at: z.string(),
  actor_type: z.enum(["human", "agent", "system"]),
  actor_name: z.string(),
  agent: z.enum(["guest", "host", "verifier"]).nullable().catch(null),
  action: z.string(),
  listing_id: z.string().nullable(),
  deal_id: z.string().nullable(),
  payload: z.unknown(),
  summary: z.string(),
});
export type FeedEvent = z.infer<typeof FeedEventSchema>;

export type ActorKind = "guest-agent" | "host-agent" | "verifier" | "human" | "system";

/** The five actor types the feed tells apart at a glance. */
export function actorKind(event: Pick<FeedEvent, "actor_type" | "agent">): ActorKind {
  if (event.actor_type === "human") return "human";
  if (event.actor_type === "agent" && event.agent === "guest") return "guest-agent";
  if (event.actor_type === "agent" && event.agent === "host") return "host-agent";
  if (event.agent === "verifier") return "verifier";
  return "system";
}

/** Icon, label and colors per actor (colors are theme tokens, so `/feed` gets dark tints). */
export const ACTOR_STYLES: Record<
  ActorKind,
  { label: string; icon: LucideIcon; badge: string; text: string }
> = {
  "guest-agent": {
    label: "Guest agent",
    icon: Luggage,
    badge: "bg-actor-guest/15 text-actor-guest",
    text: "text-actor-guest",
  },
  "host-agent": {
    label: "Host agent",
    icon: House,
    badge: "bg-actor-host/15 text-actor-host",
    text: "text-actor-host",
  },
  verifier: {
    label: "Verifier",
    icon: ShieldCheck,
    badge: "bg-actor-verifier/15 text-actor-verifier",
    text: "text-actor-verifier",
  },
  human: {
    label: "Person",
    icon: UserRound,
    badge: "bg-actor-human/15 text-actor-human",
    text: "text-actor-human",
  },
  system: {
    label: "System",
    icon: Cog,
    badge: "bg-actor-system/15 text-actor-system",
    text: "text-actor-system",
  },
};

export interface FeedScopeInput {
  filter: "listing" | "deal" | "all";
  listingId?: string;
  dealId?: string;
  listingIds?: string[];
}

/** Which rows a feed shows: one column matched against ids, or every row. */
export type FeedScope =
  { column: "listing_id" | "deal_id"; ids: string[] } | { column: "deal_id"; ids: "any" } | null;

export function feedScope(input: FeedScopeInput): FeedScope {
  if (input.filter === "listing" && input.listingId)
    return { column: "listing_id", ids: [input.listingId] };
  if (input.filter === "deal")
    return input.dealId
      ? { column: "deal_id", ids: [input.dealId] }
      : { column: "deal_id", ids: "any" };
  if (input.listingIds) return { column: "listing_id", ids: input.listingIds };
  return null;
}

/** The Realtime `filter` string for a scope (undefined = all inserts). */
export function realtimeFilter(scope: FeedScope): string | undefined {
  if (!scope || scope.ids === "any" || scope.ids.length === 0) return undefined;
  return scope.ids.length === 1
    ? `${scope.column}=eq.${scope.ids[0]}`
    : `${scope.column}=in.(${scope.ids.join(",")})`;
}

/** True when a live row belongs in this feed (Realtime can't filter "deal_id is not null"). */
export function inScope(event: FeedEvent, scope: FeedScope): boolean {
  if (!scope) return true;
  const value = event[scope.column];
  return scope.ids === "any" ? value !== null : value !== null && scope.ids.includes(value);
}

export const FEED_LIMIT = 50;

/** Newest first by id, without duplicates (a live insert can also arrive in the first load). */
export function mergeEvents(current: FeedEvent[], incoming: FeedEvent[], limit = FEED_LIMIT) {
  const byId = new Map<number, FeedEvent>();
  for (const event of [...incoming, ...current]) if (!byId.has(event.id)) byId.set(event.id, event);
  return [...byId.values()].sort((a, b) => b.id - a.id).slice(0, limit);
}

/** Rows of a deal feed, one group per deal, groups in order of their newest row. */
export function groupByDeal(events: FeedEvent[]): { dealId: string | null; events: FeedEvent[] }[] {
  const groups = new Map<string | null, FeedEvent[]>();
  for (const event of events)
    groups.set(event.deal_id, [...(groups.get(event.deal_id) ?? []), event]);
  return [...groups.entries()].map(([dealId, rows]) => ({ dealId, events: rows }));
}

/** "just now", "12s ago", "5m ago", "3h ago", "2d ago". */
export function timeAgo(createdAt: string, now: number): string {
  const seconds = Math.max(0, Math.floor((now - Date.parse(createdAt)) / 1000));
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86_400)}d ago`;
}
