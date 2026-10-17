# Shared contracts

The few interfaces both developers depend on. Reviewed and frozen in GH-5 (target: hour 4). After the freeze, implementation inside these files can change freely; **exported names, props, signatures, Zod fields and table columns change only when both developers agree.** Additive changes (a new optional field, a new export) need a heads-up. Process: the shared-contracts skill.

The starter already contains drafts of everything below.

## 1. Database: `supabase/migrations/0001_core.sql` (Beka)

22 tables, RLS on all, public read on non-secret tables, Realtime on events, deal_messages, deals, worlds, gaps. Details: [DATABASE.md](DATABASE.md). New columns or tables go in `000N_<name>.sql`; never edit an applied migration.

## 2. Types: `lib/schemas/`

| File          | Owner  | Defines                                                                                                                                                                                         |
| ------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `core.ts`     | Beka   | `Cents`, `IsoDate`, `EventInputSchema`, `ListingSchema`, `HostPolicySchema`, `TripBriefSchema`, `QuoteSchema`, `DealSchema`, `DealMessageSchema` (types include `rejected`), `OfferTermsSchema` |
| `world.ts`    | Temuri | `Vec3Schema`, `WorldSchema`, `AnchorSchema`, `GapSchema`, `FloorPlanSchema`, `CaptureSchema` (meters, floor at y = 0)                                                                           |
| `verifier.ts` | Temuri | `XrayResultSchema`, `GapCheckResultSchema`, `RoomLabelsSchema`, `KNOWN_FACT_KEYS`                                                                                                               |

## 3. Activity feed: `lib/events.ts` (Beka)

```ts
logEvent(e: {
  actor_type: "human" | "agent" | "system"; actor_name: string;
  agent?: "guest" | "host" | "verifier"; action: string; summary: string;  // <= 140 chars
  listing_id?: string; deal_id?: string; payload?: unknown;
}): Promise<void>   // server only, never throws
```

Plus `withEvent(options, fn)` in `tools/_withEvent.ts` for plain functions.

## 4. Money: `lib/pricing.ts`, `lib/validators.ts` (Beka)

```ts
computeQuote({ listing, checkIn, checkOut, discountCents?, overrides? }): Quote
// Quote = { nights, nightlyTotalCents, cleaningCents, hostSubtotalCents, discountCents, serviceFeeCents, totalCents }
validateOffer({ by, kind, amountCents, listTotalCents, nights, cleaningCents, round, maxRounds, terms?, policy?, guestMaxCents? }): { ok: true } | { ok: false, code, reason }
effectiveFloorCents(policy, { listTotalCents, nights, cleaningCents }): number
acceptanceOutcome(amountCents, policy): "approved" | "agreed_pending_host"
```

Agents negotiate over `hostSubtotalCents` (nights + cleaning). The 10% service fee is added after. Demo numbers: `seed/fixtures.ts`.

## 5. Agents: `agents/core.ts`, `agents/context.ts` (Beka)

```ts
createAgent({ name: "guest" | "host" | "verifier", system, tools, model?: "agent" | "bulk",
              maxSteps?, listingId?, dealId?, toolsContext? }): ToolLoopAgent  // .generate() and .stream()
buildHostContext(listingId, mode: "qa" | "negotiate"): Promise<HostContext>  // policy only in "negotiate"
buildGuestContext(dealId): Promise<GuestContext>                              // includes the guest's limits
loadPrompt(name, vars): string                                                // agents/prompts/<name>.md
```

Tool results may include `summary` to set the feed line.

## 6. Page slots (Temuri's components rendered in Beka's pages)

| Slot              | Component (Temuri)                                         | Rendered in (Beka) | Built in |
| ----------------- | ---------------------------------------------------------- | ------------------ | -------- |
| X-ray panel       | `components/xray/XrayPanel.tsx` `({ listingId })`          | Listing page       | GH-9     |
| 3D launcher       | `components/tour/TourLauncher.tsx` `({ listingId })`       | Listing page       | GH-11    |
| Floor plan card   | `components/floorplan/FloorPlanCard.tsx` `({ listingId })` | Listing page       | GH-18    |
| Ask this home     | `components/ask-home/AskThisHome.tsx` `({ listingId })`    | Listing page       | GH-16    |
| Questions waiting | `components/ask-home/QuestionsWaiting.tsx` `({ hostId })`  | Host dashboard     | GH-16    |
| Gap tasks         | `components/gaps/GapTasks.tsx` `({ listingId })`           | Host dashboard     | GH-19    |
| 3D versions       | `components/tour/WorldVersions.tsx` `({ listingId })`      | Host dashboard     | GH-10    |
| Capture launcher  | `components/capture/CaptureLauncher.tsx` `({ listingId })` | Host dashboard     | GH-22    |

Slots take ids only and fetch their own data.

## 7. Tour extension API: `components/tour/TourContext.tsx` (Temuri)

```ts
useTour(): {
  ready: boolean; worldId: string | null; scene: Scene | null; camera: Camera | null;
  anchors: Anchor[]; gaps: Gap[];
  flyTo(anchorId: string): Promise<void>; lookAt(point: Vec3): Promise<void>;
  highlightRoom(name: string | null): void;
  addOverlay(object: Object3D): () => void;   // returns a remove function
}
```

Temuri implements `<TourProvider>` in GH-11. Beka's add-ons (Ask the space, honesty overlay) live in `components/tour-ext/` and use only this hook.

## 8. Activity feed component: `components/feed/ActivityFeed.tsx` (Beka)

`<ActivityFeed filter="listing" | "deal" | "all" listingId? dealId? compact? />`, rendered in the listing page, deal room, host dashboard and `/feed`.

## Change log

| Date       | Change                 | Agreed by        |
| ---------- | ---------------------- | ---------------- |
| 2026-10-17 | Starter drafts created | (review in GH-5) |
