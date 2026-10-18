"use client";

import { useEffect, useId, useMemo, useState } from "react";
import {
  ACTOR_STYLES,
  actorKind,
  FEED_LIMIT,
  FeedEventSchema,
  feedScope,
  groupByDeal,
  inScope,
  mergeEvents,
  realtimeFilter,
  timeAgo,
  type FeedEvent,
} from "@/components/feed/feed";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { hasSupabaseEnv, supabaseBrowser } from "@/lib/supabase";
import { cn } from "@/lib/utils";

export interface ActivityFeedProps {
  filter: "listing" | "deal" | "all";
  listingId?: string;
  dealId?: string;
  compact?: boolean;
  /** With filter "all": only these listings (the host dashboard passes the host's homes). */
  listingIds?: string[];
  /** Very large type for the /feed projector view. */
  projector?: boolean;
}

type Status = "loading" | "live" | "offline" | "off";

/**
 * Live activity feed (contract from GH-5, built in GH-12). Subscribes to Realtime inserts on
 * `events` first, then loads the last 50, so nothing falls between the two. Rows are public
 * data: summaries never carry host policies or guest limits.
 */
export function ActivityFeed(props: ActivityFeedProps) {
  const { filter, listingId, dealId, listingIds } = props;
  const idsKey = listingIds?.join(",");
  const scope = useMemo(
    () => feedScope({ filter, listingId, dealId, listingIds: idsKey?.split(",") }),
    [filter, listingId, dealId, idsKey],
  );
  const channelName = `feed-${useId()}`;
  const configured = hasSupabaseEnv();
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [fresh, setFresh] = useState<Set<number>>(new Set());
  const [status, setStatus] = useState<Status>(configured ? "loading" : "off");
  const [loaded, setLoaded] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [selected, setSelected] = useState<FeedEvent | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!configured) return;
    const db = supabaseBrowser();
    let cancelled = false;
    const filterString = realtimeFilter(scope);
    const channel = db
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "events",
          ...(filterString ? { filter: filterString } : {}),
        },
        (payload) => {
          const parsed = FeedEventSchema.safeParse(payload.new);
          if (!parsed.success || !inScope(parsed.data, scope)) return;
          setNow(Date.now());
          setEvents((current) => mergeEvents(current, [parsed.data]));
          setFresh((current) => new Set(current).add(parsed.data.id));
        },
      )
      .subscribe((state) => {
        if (cancelled) return;
        if (state === "SUBSCRIBED") setStatus("live");
        if (state === "CHANNEL_ERROR" || state === "TIMED_OUT") setStatus("offline");
      });

    let query = db.from("events").select("*").order("id", { ascending: false }).limit(FEED_LIMIT);
    if (scope)
      query =
        scope.ids === "any"
          ? query.not(scope.column, "is", null)
          : query.in(scope.column, scope.ids);
    query.then(({ data, error }) => {
      if (cancelled) return;
      if (error) {
        setStatus("offline");
        return;
      }
      const rows = (data ?? []).flatMap((row) => {
        const parsed = FeedEventSchema.safeParse(row);
        return parsed.success ? [parsed.data] : [];
      });
      setNow(Date.now());
      setEvents((current) => mergeEvents(current, rows));
      setLoaded(true);
    });

    return () => {
      cancelled = true;
      db.removeChannel(channel);
    };
  }, [configured, scope, channelName]);

  const big = props.projector;
  const groups = filter === "deal" && !dealId ? groupByDeal(events) : [{ dealId: null, events }];

  return (
    <section className={cn("space-y-3", big && "space-y-6")} aria-label="Activity feed">
      {!big && (
        <div className="flex items-center justify-between gap-2">
          <h2 className={cn("font-semibold", props.compact ? "text-sm" : "text-lg")}>
            Live activity
          </h2>
          <StatusDot status={status} />
        </div>
      )}
      {big && (
        <div className="flex justify-end">
          <StatusDot status={status} big />
        </div>
      )}

      {status === "off" && (
        <p className="text-sm text-muted-foreground">
          The feed is off: Supabase isn&apos;t configured on this machine.
        </p>
      )}
      {configured && !loaded && events.length === 0 && (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className={cn("w-full", big ? "h-20" : "h-10")} />
          ))}
        </div>
      )}
      {loaded && events.length === 0 && (
        <p className={cn("text-muted-foreground", big ? "text-3xl" : "text-sm")}>
          Nothing yet. Agent and people actions show up here the moment they happen.
        </p>
      )}

      {groups.map((group) => (
        <div key={group.dealId ?? "all"} className="space-y-1">
          {group.dealId && (
            <p className="text-xs font-medium text-muted-foreground">
              Deal {group.dealId.slice(0, 8)}
            </p>
          )}
          <ol className={cn("divide-y", big && "divide-y-0 space-y-4")} aria-live="polite">
            {group.events.map((event) => (
              <FeedRow
                key={event.id}
                event={event}
                now={now}
                compact={props.compact}
                big={big}
                fresh={fresh.has(event.id)}
                onOpen={() => setSelected(event)}
              />
            ))}
          </ol>
        </div>
      ))}

      <Sheet open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          {selected && <EventDetails event={selected} />}
        </SheetContent>
      </Sheet>
    </section>
  );
}

function StatusDot({ status, big }: { status: Status; big?: boolean }) {
  const label = { loading: "Connecting", live: "Live", offline: "Offline", off: "Off" }[status];
  return (
    <span
      className={cn(
        "flex items-center gap-1.5 text-muted-foreground",
        big ? "text-2xl" : "text-xs",
      )}
    >
      <span
        className={cn(
          "rounded-full",
          big ? "size-3.5" : "size-2",
          status === "live" ? "bg-actor-host motion-safe:animate-pulse" : "bg-muted-foreground",
        )}
        aria-hidden
      />
      {label}
    </span>
  );
}

function FeedRow(props: {
  event: FeedEvent;
  now: number;
  compact?: boolean;
  big?: boolean;
  fresh: boolean;
  onOpen: () => void;
}) {
  const { event, big, compact } = props;
  const style = ACTOR_STYLES[actorKind(event)];
  const Icon = style.icon;
  return (
    <li className={cn(props.fresh && "motion-safe:animate-feed-in")}>
      <button
        type="button"
        onClick={props.onOpen}
        className={cn(
          "flex w-full items-start gap-3 rounded-lg text-left hover:bg-muted",
          big ? "gap-4 bg-card p-4 sm:gap-6 sm:p-5" : compact ? "px-1 py-2" : "px-2 py-3",
        )}
      >
        <span
          className={cn(
            "flex shrink-0 items-center justify-center rounded-full",
            style.badge,
            big ? "size-12 sm:size-16" : compact ? "size-7" : "size-9",
          )}
          title={style.label}
        >
          <Icon
            className={big ? "size-6 sm:size-8" : compact ? "size-3.5" : "size-4"}
            aria-hidden
          />
        </span>
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              "block",
              big
                ? "text-2xl leading-tight font-medium sm:text-4xl"
                : compact
                  ? "text-xs"
                  : "text-sm",
            )}
          >
            {event.summary}
          </span>
          <span
            className={cn(
              "mt-0.5 block text-muted-foreground",
              big ? "mt-2 text-lg sm:text-2xl" : "text-xs",
            )}
          >
            <span className={cn("font-medium", style.text)}>{style.label}</span>
            {" · "}
            <time dateTime={event.created_at}>{timeAgo(event.created_at, props.now)}</time>
          </span>
        </span>
      </button>
    </li>
  );
}

function EventDetails({ event }: { event: FeedEvent }) {
  const style = ACTOR_STYLES[actorKind(event)];
  const rows: [string, string | null][] = [
    ["Action", event.action],
    ["When", new Date(event.created_at).toLocaleString("en-US")],
    ["Listing", event.listing_id],
    ["Deal", event.deal_id],
  ];
  return (
    <>
      <SheetHeader>
        <SheetTitle>{event.summary}</SheetTitle>
        <SheetDescription>
          {style.label} · {event.actor_name}
        </SheetDescription>
      </SheetHeader>
      <div className="space-y-4 px-4 pb-6 text-sm">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          {rows
            .filter(([, value]) => value)
            .map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="break-all">{value}</dd>
              </div>
            ))}
        </dl>
        <div className="space-y-1">
          <p className="font-medium">Payload</p>
          <pre className="overflow-x-auto rounded-lg bg-muted p-3 text-xs">
            {JSON.stringify(event.payload ?? {}, null, 2)}
          </pre>
        </div>
      </div>
    </>
  );
}
