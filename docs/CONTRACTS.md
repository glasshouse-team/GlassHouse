# Shared contracts

The few interfaces both developers depend on. Reviewed and frozen in GH-5 (target: hour 4). After the freeze, implementation inside these files can change freely; **exported names, props, signatures, Zod fields and table columns change only when both developers agree.** Additive changes (a new optional field, a new export) need a heads-up. Process: the shared-contracts skill.

The starter already contains drafts of everything below.

## 1. Database: `supabase/migrations/0001_core.sql` (Beka)

22 tables, RLS on all, public read on non-secret tables, Realtime on events, deal_messages, deals, worlds, gaps, messages. Details: [DATABASE.md](DATABASE.md). New columns or tables go in `000N_<name>.sql`; never edit an applied migration.

Applied in GH-5. Generated types: `lib/database.types.ts` (rerun `pnpm db:types` after every migration and commit it). `supabaseAdmin()` and `supabaseBrowser()` in `lib/supabase.ts` return `Db` (`SupabaseClient<Database>`), so queries are typed by table; use `Tables<"reviews">` and friends for rows read back.

## 2. Types: `lib/schemas/`

| File          | Owner  | Defines                                                                                                                                                                                                                                              |
| ------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `core.ts`     | Beka   | `Cents`, `IsoDate`, `EventInputSchema`, `ListingSchema`, `HostPolicySchema`, `TripBriefSchema`, `QuoteSchema`, `DealSchema`, `DealMessageSchema` (types include `rejected`), `OfferTermsSchema`, `Amenity`, `ReviewSubRatingsSchema`, `ReviewSchema` |
| `world.ts`    | Temuri | `Vec3Schema`, `WorldSchema`, `AnchorSchema`, `GapSchema`, `FloorPlanSchema`, `CaptureSchema` (meters, floor at y = 0)                                                                                                                                |
| `verifier.ts` | Temuri | `XrayResultSchema`, `GapCheckResultSchema`, `RoomLabelsSchema`, `KNOWN_FACT_KEYS`, `ReviewClaimsResultSchema` and `ClaimSentiment` (GH-24)                                                                                                         |

## 3. Activity feed: `lib/events.ts` (Beka)

```ts
logEvent(e: {
  actor_type: "human" | "agent" | "system"; actor_name: string;
  agent?: "guest" | "host" | "verifier"; action: string; summary: string;  // <= 140 chars
  listing_id?: string; deal_id?: string; payload?: unknown;
}): Promise<void>   // server only, never throws
```

Plus `withEvent(options, fn)` in `tools/_withEvent.ts` for plain functions (optional `payload(result, ...args)` since GH-12).

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
              maxSteps?, stopWhen?, output?, effort?: "low" | "medium" | "high", thinking?: "adaptive" | "off",
              listingId?, dealId?, toolsContext?, logInputs? }): ToolLoopAgent  // .generate() and .stream()
buildHostContext(listingId, mode: "qa" | "negotiate"): Promise<HostContext>  // policy only in "negotiate"; manual only in "qa" (D-025)
buildGuestContext(dealId): Promise<GuestContext>                              // includes the guest's limits; house_manual blank
loadPrompt(name, vars): string                                                // agents/prompts/<name>.md
```

Also exported: `toHostContext(rows, mode)` and `toGuestContext(rows)` (the pure halves of the builders), `hostPrompt(context, hostName)` and `guestPrompt(context, guestName)` (system prompts from a context; the host one carries no policy numbers), `loggableInput(input, fields)` (agents/core.ts). Tool results may include `summary` to set the feed line; it is public like the payload, so it never names a policy value or a guest limit. Feed payloads are public: a tool's input is logged only for the fields listed in `logInputs` (`{ search_listings: ["city", "guests"] }`), otherwise not at all (D-024). `asData(label, value)` (agents/data.ts) wraps guest, host and listing text for the user message. `toolsContext` is keyed by tool name (`{ make_offer: { policy } }`). `stopWhen` adds to the `maxSteps` cap; `output` is `Output.object({ schema })`. Prompts carry no policy numbers; listing text and facts go in the user message as quoted JSON.

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

`<ActivityFeed filter="listing" | "deal" | "all" listingId? dealId? compact? />`, rendered in the listing page, deal room, host dashboard and `/feed`. GH-12 added two optional props: `listingIds?` (with `filter="all"`, only those listings; the host dashboard passes the host's homes) and `projector?` (very large type for `/feed`). It is a client component that loads the last 50 events and subscribes to Realtime inserts.

## 9. Host Q&A: `tools/host-qa/askHome.ts` (Temuri, GH-16)

```ts
askHome(input: {
  listingId: string; question: string; askedBy: "guest" | "guest_agent";
  guestId?: string; dealId?: string; conversationId?: string;
}): Promise<{
  conversationId: string; messageId: string;
  answer: string | null;      // null = forwarded to the host
  sources: { type: "fact" | "rule" | "manual"; key: string; quote?: string }[];
  forwarded: boolean;
}>
```

Server only. `/api/qa` and Beka's guest-agent tool `ask_host` (GH-14, GH-15) both call it; built in GH-16. A declined price or private-setting question returns fixed text with `sources: []` and `forwarded: false` (D-036). With `askedBy: "guest_agent"` the feed shows "Guest agent asked the host agent a question" (no question text, D-024) and the host agent's reply. The host's reply to a forwarded question: `POST /api/qa/reply { messageId, answer, saveToManual }`.

## 10. Browser uploads: `createSignedUpload()` in `lib/supabase.ts` (Beka)

```ts
createSignedUpload(bucket: "media" | "captures", path: string):
  Promise<{ bucket: string; path: string; signedUrl: string; token: string }>
```

RLS gives the browser no write access, so every browser upload (rig screenshots GH-18/GH-19, walkthroughs GH-22) goes: a server route calls this, the browser PUTs the file to `signedUrl` (XMLHttpRequest for a progress bar) or calls `uploadToSignedUrl(path, token, file)`. Never send file bytes through a route body (Vercel caps bodies at 4.5 MB). One exception: GH-23 sends at most 8 small JPEG check-in frames inline (D-033).

## 11. Demo ids: `seed/fixtures.ts` (Beka)

`DEMO_PROFILES` (Nino guest, Giorgi and Ana hosts), `HERO_LISTINGS` (hero-1, hero-2, both hosted by Giorgi) with fixed uuids, `SEED_COMPLETED_ACTION` (the event the seed logs last; the demo reset deletes events after it), `LIE_LISTING_SLUGS` (the two listings the X-ray must catch), `HERO_QA_FIXTURES` (the Ask-this-home checks and the source each answer must cite), plus the hero price, policy and demo deal (4 guests). The seed, role switcher, deals, reset and tests import these instead of looking rows up by name.

## 12. Viewer: `lib/viewer.ts` (Beka)

```ts
ROLE_COOKIE = "gh_role"                     // "guest" | "host", set by the role switcher
getViewer(): Promise<{ role: "guest" | "host"; profileId: string; name: string }>  // no cookie: Nino
```

Server only. Pages, `/api/qa`, deals and the dashboard use it instead of a login. One cookie per browser: use two browser profiles to play guest and host side by side.

## 13. Tour add-ons: `components/tour-ext/` (Beka)

```ts
TourExtensions({ listingId, worldId }): ReactNode   // index.tsx: GH-20 and GH-21 mount inside it
TourActionSchema / TourAction                        // actions.ts: fly_to, look_toward, highlight_room, show_fact
runTourAction(tour: TourApi, action: TourAction): Promise<void>
AskSpacePanel({ listingId, worldId?, version? }): ReactNode  // AskSpacePanel.tsx (GH-20), mounted by TourExtensions
```

`POST /api/ask-space` (GH-20) takes `{ listingId, worldId?, version?, messages }` (useChat UI messages) and streams UI messages. The version comes from `version`, else the spot world `worldId`, else the published or newest viewable world. Tool outputs are `{ ok: true, summary, action, shown, honestyNote? }` or `{ ok: false, summary, error }`.

Temuri's tour page renders `<TourExtensions>` inside `<TourProvider>` and outside the `<Canvas>`. Deep link: `/tour/{listingId}?version={n}&anchor={anchorId}`.

## 14. Coordinates and anchors: `lib/geometry/frame.ts` (Temuri)

```ts
marbleToThree(metricScaleFactor: number, floorY?: number): Matrix4   // flips OpenCV axes, meters, floor at 0
floorHeight(positions, index?): number                                // lowest large horizontal surface below the camera
```

The only Marble-to-three transform; the viewer, floor plan and gap check all use it. Every position in `anchors`, `gaps` and floor plans is in these meters. An anchor's `position` is where the camera stands and `look_at` what it looks at (or null). A gap counts as AI-filled while its status is `open` or `requested`.

## Change log

| Date       | Change                                                                                                                                                  | Agreed by    |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| 2026-10-17 | Starter drafts created                                                                                                                                  | Beka, Temuri |
| 2026-10-17 | Sections 9-14 added after the ticket review (askHome, uploads, demo ids, viewer, tour add-ons, coordinates); createAgent gains stopWhen, output, effort | Beka, Temuri |
| 2026-10-18 | `core.ts` adds `Amenity` (the 26-word vocabulary from docs/teardown.md) and `ReviewSchema` with the six sub-ratings (additive)                          | Beka, Temuri |
| 2026-10-18 | Frozen at `a6ba574` (PR #3): migration applied, `lib/database.types.ts` generated, clients typed as `Db` (new export, type-level only)                  | Beka, Temuri |
| 2026-10-18 | Section 14: `floorHeight` takes the lowest large layer below the camera, so a big ceiling or a bed top is not the floor (D-009); signature unchanged    | Temuri       |
| 2026-10-18 | Migration 0002 (D-009): `worlds` gains `spot`, `spot_label`, `links`, unique on (listing, version, spot); `captures.kind` adds `ring`                   | Beka, Temuri |
| 2026-10-18 | Section 13: `TourExtensions` mounts `AskSpacePanel`; `/api/ask-space` body and tool output documented (additive, GH-20)                                 | Beka         |
| 2026-10-18 | `verifier.ts` adds `ReviewClaimsResultSchema` and `ClaimSentiment` (additive, GH-24); `review_claims` columns unchanged                                   | Temuri       |
