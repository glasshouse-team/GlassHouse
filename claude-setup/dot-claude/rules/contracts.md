---
paths:
  - "lib/schemas/**"
  - "lib/events.ts"
  - "agents/core.ts"
  - "agents/context.ts"
  - "components/tour/TourContext.tsx"
  - "components/xray/XrayPanel.tsx"
  - "components/tour/TourLauncher.tsx"
  - "components/tour/WorldVersions.tsx"
  - "components/floorplan/FloorPlanCard.tsx"
  - "components/ask-home/AskThisHome.tsx"
  - "components/ask-home/QuestionsWaiting.tsx"
  - "components/gaps/GapTasks.tsx"
  - "components/capture/CaptureLauncher.tsx"
  - "supabase/migrations/**"
---

# Contract files

This file is part of the shared contract between Temuri and Beka (GH-5, docs/CONTRACTS.md).

- Implementation inside it may change freely. Exported names, props, function signatures, Zod fields and table columns may not change without both developers agreeing.
- Slot components keep their name and props: `({ listingId })` or `({ hostId })`. Replace the stub body, never the interface.
- Database changes go in a NEW migration file `supabase/migrations/000N_<name>.sql`. Never edit a migration that was applied. After a migration: `pnpm db:push`, then `pnpm db:types`.
- After changing a contract: update docs/CONTRACTS.md in the same PR and tell the other developer what changed.
