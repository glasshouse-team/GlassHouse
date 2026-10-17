---
paths:
  - "lib/pricing.ts"
  - "lib/validators.ts"
  - "tools/negotiation/**"
  - "app/api/deals/**"
  - "app/(guest)/deal/**"
  - "components/deal/**"
  - "seed/fixtures.ts"
---

# Money rules

- Money is integer cents everywhere ($120 = 12000). Format only at the edge with `formatCents`.
- Every price line comes from `computeQuote` (lib/pricing.ts). An LLM never computes a total.
- Every offer, counter and accept goes through `validateOffer` (lib/validators.ts) BEFORE it is saved. A rejection goes back to the agent as a tool error, and is stored as a `rejected` deal message (grey note, no amounts from the host policy).
- `acceptanceOutcome` decides between `approved` and `agreed_pending_host`. Only a human host action approves a pending deal.
- The guest side never receives `host_policies`. The host side never receives `deal_secrets`. Build contexts only with agents/context.ts.
- Demo numbers live in seed/fixtures.ts. If you change them, `pnpm test` must still pass.
