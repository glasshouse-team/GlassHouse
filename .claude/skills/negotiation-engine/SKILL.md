---
name: negotiation-engine
description: Build the guest-host negotiation - deal state machine, money validators, turn loop with one money action per turn, deal room with Realtime, host approvals and reservation creation - around the "Can I pay $50 less?" demo. Use for GH-15, and for the validators in GH-13.
when_to_use: The user mentions "negotiation", "deal room", "make_offer", "counter offer", "accept offer", "can I pay less", "host approval", "auto-accept", "floor price", "round limit", "reservation from a deal", "the agent gave away the house".
---

# Negotiation engine (GH-15)

Money rules live in code. Already in the repo, with tests: `computeQuote` (lib/pricing.ts), `validateOffer`, `effectiveFloorCents`, `acceptanceOutcome` (lib/validators.ts), and the demo numbers (seed/fixtures.ts). Do not reimplement them.

## States

`open` -> offers and counters -> host agent accepts:

- at or above `auto_accept_total_cents`: `approved`, reservation created at once;
- between the floor and auto-accept: `agreed_pending_host`, the host must tap Approve.
  Side exits: `declined`, `escalated` (an agent hands over to a person), `expired` (round limit reached).

## The demo (must pass 5 runs in a row)

Hero home 1, Mon Nov 9 to Fri Nov 13, 2026, 4 guests (D-017). List total $520 (4 x $120 + $40 cleaning). Effective floor $442 (15% max discount beats $100/night). Auto-accept $490. Guest target $470, max $500.

| Round | Actor         | Action                                      | Check                                                                              |
| ----- | ------------- | ------------------------------------------- | ---------------------------------------------------------------------------------- |
| 1     | Guest agent   | offer $470 ("4 weekday nights, low season") | valid                                                                              |
| 2     | Host agent    | counter $495 ("$25 off for four nights")    | >= $442                                                                            |
| 3     | Guest agent   | counter $480                                | <= $500                                                                            |
| 4     | Host agent    | accept $480 -> `agreed_pending_host`        | < $490                                                                             |
| 5     | Host (person) | Approve                                     | reservation: nights $480, cleaning $40, discount -$40, service fee $48, total $528 |

The rounds also live in `DEMO_SCRIPT` (seed/fixtures.ts) and are asserted by lib/validators.test.ts.

## Build

1. **Open:** "Negotiate" on the listing page opens a sheet: dates, guests, "What would you like to pay?" (target), "Most you'd pay" (private). `POST /api/deals` computes the list total with `computeQuote(...).hostSubtotalCents`, inserts `deals` and `deal_secrets`, logs an event.
2. **Tools** in `tools/negotiation/`: `make_offer(amountCents, terms, reason)`, `accept_offer()`, `decline(reason)`, `escalate_to_host(reason)` (host side), `ask_guest(question)` (guest side). Each money tool calls `validateOffer` first. On failure: insert a `deal_messages` row with type `rejected` (body from the refusal code, never the `reason` text, which can contain host numbers; `amount_cents` null) and return `{ ok: false, code, summary }` as the tool result (not a thrown error) so the agent tries again. On success return `{ ok: true, summary, ... }`.
   Pass the policy and secrets through `toolsContext` (see agent-builder), never through the prompt.
3. **Run loop** `POST /api/deals/[id]/run`: alternate guest turn (context `buildGuestContext`) and host turn (`buildHostContext(listingId, "negotiate")`). Each turn is one `agent.generate()` from `createAgent({ ..., stopWhen })` where `stopWhen` is true once a money tool returned `{ ok: true }` (`hasToolCall` would also stop on a refused call, so the agent could never retry). Server code, not a tool, applies `acceptanceOutcome` after an accept. The route returns 202 and runs the loop inside `after()` (next/server) with `export const maxDuration = 300`; refuse a second run while one is going. Save each message to `deal_messages` (Realtime pushes it). In `isDemoMode()`, wait 1.5 s between turns. Stop on accept, decline, escalate, ask_guest or `max_rounds`.
4. **Approve** `POST /api/deals/[id]/approve` (host role only): `approved` creates a reservation with `computeQuote({ ..., discountCents: list - agreed })`; `declined` ends the deal. Log the event; the guest sees "Booked".
5. **Deal room** `/deal/[id]`: offer cards (actor, amount, difference from list, reason), grey notes for `rejected`, a status pill, the feed for this deal. Guest controls: Stop, Accept last offer. Host controls (role switcher): Approve, Decline, Counter myself. Approvals also appear on the host dashboard with a toast.

## Demo reliability (recommended)

The demo must pass 5 runs in a row. Give each turn a suggested move computed in code and passed through `toolsContext`: the midpoint of the last two offers rounded down to $5, accepting once the gap is $15 or less. From $520 and a $470 opening that gives $495, $480, accept. The model writes the reason and may only deviate within the validator's rules.

## Branch tests

- Lowball: guest offers $400; the host agent's accept is refused (below floor); it counters >= $442 or declines.
- Not negotiable: `negotiable = false`; the host keeps $520 and offers an allowed term (late checkout).
- Round limit: after 6 rounds the deal is `expired`; the guest can accept the last offer.
- Over budget: host's best above $500; the guest agent calls `ask_guest`.
- Instant: an agreed $490 or more is `approved` with no person.
- Secrets: search the logged prompts and tool inputs; the guest side never contains the floor or auto-accept, the host side never contains $500.
