---
name: realtime-activity-feed
description: Build and use the live activity feed that shows every agent and human action - logEvent and withEvent conventions, summary style, Supabase Realtime subscription, the ActivityFeed component and the full-screen projector view. Use for GH-12, and whenever a feature needs to log what it did.
when_to_use: The user mentions "activity feed", "log this action", "logEvent", "withEvent", "who did what", "events table", "realtime updates", "feed is not updating", "projector view", "/feed".
---

# Activity feed (GH-12)

"Everyone can see who did what" is a literal Track 01 requirement, and the feed is how judges see the agents act.

## Logging (every feature)

- Agent tools are logged automatically by `createAgent` (agents/core.ts). Return `{ summary }` from the tool for a good line.
- Anything else: `logEvent({ actor_type, actor_name, agent?, action, summary, listing_id?, deal_id?, payload? })` from lib/events.ts, or wrap a function with `withEvent` (tools/_withEvent.ts). Server only; never throws.
- `action`: dot-separated and stable, e.g. `deal.offer`, `deal.approved`, `world.ready`, `xray.done`, `qa.forwarded`, `gap.requested`.
- `summary` style: actor first, past tense, concrete, at most 140 characters, no host secrets.
  - "Guest agent offered $470 for Nov 9-13 (-$50)"
  - "Host agent countered at $495"
  - "Giorgi approved $480 for Nov 9-13"
  - "Verifier checked 18 photos: 1 contradiction found"
  - "Host agent asked Giorgi for 2 more clips"

## The component

`components/feed/ActivityFeed.tsx` (stub in the starter; props are a contract: `filter`, `listingId?`, `dealId?`, `compact?`).

1. Load the last 50 events (server component or an API route), newest first.
2. Subscribe with `supabaseBrowser()` to `INSERT` on `events`, with a filter matching the props (`listing_id=eq.<id>` or `deal_id=eq.<id>`); prepend new rows with a short slide-in.
3. Each row: actor icon and color (guest agent, host agent, Verifier, person, system), the summary, relative time ("12s ago", date-fns `formatDistanceToNowStrict`). Click a row to open the payload in a drawer.
4. Unsubscribe on unmount (`removeChannel`).

Places: listing page sidebar (`filter="listing"`), deal room (`filter="deal"`), host dashboard (`filter="all"`), and `/feed`: full screen, large type, dark, readable from 5 meters on a projector.

## Check

Insert a test event (SQL editor or a tiny script) and watch it appear in an open browser within 2 seconds with no refresh. If nothing arrives: the `events` table must be in the `supabase_realtime` publication and have the public read policy (both are in the migration).
