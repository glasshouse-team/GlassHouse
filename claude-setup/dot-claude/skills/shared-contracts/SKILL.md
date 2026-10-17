---
name: shared-contracts
description: Define, freeze and change the shared contracts between Temuri's and Beka's code - database schema, Zod types, logEvent, page slots, useTour() and the agent core. Use for GH-5, and whenever a change touches a contract file or the other developer's folder.
when_to_use: GH-5, "contracts", "freeze the schema", "add a column", "new migration", "change a slot", "I need something in the other developer's folder", "change useTour", "change createAgent signature", "regenerate database types".
---

# Shared contracts (GH-5)

Contracts are the few files both developers depend on. They are defined in hours 2-4, approved by both, then frozen. After that, either developer can build without touching the other's folders. The full list and the reasoning: docs/CONTRACTS.md. Folder owners: docs/OWNERSHIP.md.

## The contract files

| Contract                                                | File                                                          | Owner  |
| ------------------------------------------------------- | ------------------------------------------------------------- | ------ |
| Database schema                                         | supabase/migrations/0001_core.sql                             | Beka   |
| Core types (money, listings, deals, events)             | lib/schemas/core.ts                                           | Beka   |
| 3D types (worlds, anchors, gaps, floor plans, captures) | lib/schemas/world.ts                                          | Temuri |
| Verifier output types                                   | lib/schemas/verifier.ts                                       | Temuri |
| Activity feed                                           | lib/events.ts `logEvent()`                                    | Beka   |
| Agent factory                                           | agents/core.ts `createAgent()`                                | Beka   |
| Private agent context                                   | agents/context.ts `buildHostContext()`, `buildGuestContext()` | Beka   |
| Tour extension API                                      | components/tour/TourContext.tsx `useTour()`                   | Temuri |
| Page slots (8 components)                               | components/xray, tour, floorplan, ask-home, gaps, capture     | Temuri |

The starter already contains drafts of all of these, plus `computeQuote` and `validateOffer` with tests. GH-5 means: review them together, adjust, apply the migration, generate types, and freeze.

## GH-5 steps

1. Both developers read docs/CONTRACTS.md and the files above (about 20 minutes). Write down changes.
2. Beka edits `0001_core.sql` and the core types; Temuri edits world and verifier types and the slot stubs. Same branch `GH-5-contracts`.
3. Apply: `pnpm supabase link --project-ref <ref>` (once), then `pnpm db:push`. Then `pnpm db:types` writes `lib/database.types.ts`; type the clients in lib/supabase.ts with it.
4. Check in the Supabase dashboard: Realtime is on for events, deal_messages, deals, worlds, gaps; buckets `media` (public) and `captures` (private) exist.
5. Both slot stubs and pages render (`pnpm dev`, open /listing/demo and /host/dashboard).
6. PR approved by both. After merge, comment "Contracts frozen at <commit>" on GH-5.

## Changing a contract after the freeze

1. Do not edit the other developer's file. Write the request: what to add or change, why, which ticket needs it, and a proposed snippet.
2. **New database column or table:** a new file `supabase/migrations/000N_<name>.sql` (never edit an applied one), then `pnpm db:push` and `pnpm db:types`. Either developer may add a migration; tell the other one.
3. **Type or signature change:** additive changes (new optional field, new export) are fine with a heads-up. Renames, removals and required fields need both developers' OK.
4. Update docs/CONTRACTS.md in the same PR, and name the change in the PR description.

## Adding a new slot

A slot is a component owned by one developer that the other's page renders. Add the stub (name + props + ComingSoon body) in the owner's folder, render it in the page, and list it in docs/CONTRACTS.md. Props are plain ids (`listingId`, `hostId`); the component fetches its own data.
