import { describe, expect, it } from "vitest";
import {
  ACTOR_STYLES,
  actorKind,
  feedScope,
  FeedEventSchema,
  groupByDeal,
  inScope,
  mergeEvents,
  realtimeFilter,
  timeAgo,
  type FeedEvent,
} from "./feed";

const LISTING = "00000000-0000-4000-8000-0000000000b1";
const OTHER = "00000000-0000-4000-8000-0000000000b2";
const DEAL = "11111111-1111-4111-8111-111111111111";

function event(id: number, extra: Partial<FeedEvent> = {}): FeedEvent {
  return {
    id,
    created_at: "2026-11-09T10:00:00Z",
    actor_type: "system",
    actor_name: "System",
    agent: null,
    action: "test.ping",
    listing_id: null,
    deal_id: null,
    payload: {},
    summary: `event ${id}`,
    ...extra,
  };
}

describe("actorKind", () => {
  it("tells the five actor types apart", () => {
    expect(actorKind({ actor_type: "agent", agent: "guest" })).toBe("guest-agent");
    expect(actorKind({ actor_type: "agent", agent: "host" })).toBe("host-agent");
    expect(actorKind({ actor_type: "agent", agent: "verifier" })).toBe("verifier");
    expect(actorKind({ actor_type: "system", agent: "verifier" })).toBe("verifier");
    expect(actorKind({ actor_type: "human", agent: null })).toBe("human");
    expect(actorKind({ actor_type: "system", agent: null })).toBe("system");
  });

  it("gives each type its own icon, label and color", () => {
    const styles = Object.values(ACTOR_STYLES);
    expect(new Set(styles.map((s) => s.icon)).size).toBe(5);
    expect(new Set(styles.map((s) => s.label)).size).toBe(5);
    expect(new Set(styles.map((s) => s.text)).size).toBe(5);
  });
});

describe("feedScope and realtimeFilter", () => {
  it("matches the props", () => {
    expect(realtimeFilter(feedScope({ filter: "listing", listingId: LISTING }))).toBe(
      `listing_id=eq.${LISTING}`,
    );
    expect(realtimeFilter(feedScope({ filter: "deal", dealId: DEAL }))).toBe(`deal_id=eq.${DEAL}`);
    expect(realtimeFilter(feedScope({ filter: "all", listingIds: [LISTING, OTHER] }))).toBe(
      `listing_id=in.(${LISTING},${OTHER})`,
    );
    expect(feedScope({ filter: "all" })).toBeNull();
    expect(realtimeFilter(feedScope({ filter: "deal" }))).toBeUndefined();
  });

  it("keeps live rows that belong to the feed", () => {
    expect(
      inScope(
        event(1, { listing_id: LISTING }),
        feedScope({ filter: "listing", listingId: LISTING }),
      ),
    ).toBe(true);
    expect(
      inScope(
        event(1, { listing_id: OTHER }),
        feedScope({ filter: "listing", listingId: LISTING }),
      ),
    ).toBe(false);
    expect(inScope(event(1), feedScope({ filter: "deal" }))).toBe(false);
    expect(inScope(event(1, { deal_id: DEAL }), feedScope({ filter: "deal" }))).toBe(true);
    expect(inScope(event(1), feedScope({ filter: "all" }))).toBe(true);
  });
});

describe("mergeEvents", () => {
  it("puts the newest first, drops duplicates and keeps the limit", () => {
    const merged = mergeEvents([event(3), event(2)], [event(4), event(3)], 3);
    expect(merged.map((e) => e.id)).toEqual([4, 3, 2]);
    expect(mergeEvents(merged, [event(1)], 3).map((e) => e.id)).toEqual([4, 3, 2]);
  });
});

describe("groupByDeal", () => {
  it("groups rows by deal in order of their newest row", () => {
    const groups = groupByDeal([
      event(5, { deal_id: "b" }),
      event(4, { deal_id: "a" }),
      event(3, { deal_id: "b" }),
    ]);
    expect(groups.map((g) => [g.dealId, g.events.map((e) => e.id)])).toEqual([
      ["b", [5, 3]],
      ["a", [4]],
    ]);
  });
});

describe("timeAgo", () => {
  const now = Date.parse("2026-11-09T10:00:00Z");
  it("reads like a feed", () => {
    expect(timeAgo("2026-11-09T10:00:00Z", now)).toBe("just now");
    expect(timeAgo("2026-11-09T09:59:48Z", now)).toBe("12s ago");
    expect(timeAgo("2026-11-09T09:55:00Z", now)).toBe("5m ago");
    expect(timeAgo("2026-11-09T07:00:00Z", now)).toBe("3h ago");
    expect(timeAgo("2026-11-07T10:00:00Z", now)).toBe("2d ago");
    expect(timeAgo("2026-11-09T10:00:03Z", now)).toBe("just now");
  });
});

describe("FeedEventSchema", () => {
  it("accepts an events row and tolerates an unknown agent", () => {
    expect(FeedEventSchema.parse({ ...event(1), agent: "robot" }).agent).toBeNull();
    expect(FeedEventSchema.safeParse({ id: 1 }).success).toBe(false);
  });
});
