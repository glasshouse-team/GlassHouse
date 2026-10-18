# Agent design

Agents act only through tools; code enforces every money rule; a person approves anything that books below the host's auto-accept level. Each agent is one `createAgent(...)` (agents/core.ts, on AI SDK v7 `ToolLoopAgent`); every tool call is written to `events` (tool inputs only for the fields listed in `logInputs`, D-024, since events are public).

## The agents

| Agent       | Model                                      | Sees                                                                               | Never sees                            | Tools                                                                                                                                    |
| ----------- | ------------------------------------------ | ---------------------------------------------------------------------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Guest agent | Sonnet 5.5; search: Haiku 5.5 (D-027)      | Trip brief, guest target and max, listings, X-ray facts, anchors, floor plans      | Host floor, max discount, auto-accept | `search_listings`, `get_listing_facts`, `ask_host`, `fly_to`, `look_toward`, `highlight_room`, `make_offer`, `accept_offer`, `ask_guest` |
| Host agent  | Sonnet 5.5                                 | Listing, house rules, house manual, X-ray facts; host policy only when negotiating | Guest's max                           | `answer_question`, `forward_to_host`, `make_offer`, `accept_offer`, `decline`, `escalate_to_host`, `request_footage`, `draft_listing`    |
| Verifier    | Haiku 5.5 (bulk), Sonnet 5.5 (hard vision) | Photos, captures, world screenshots, reviews                                       | Any policy or budget                  | X-ray, gap check, room labels, object anchors, review claims, check-in comparison                                                        |

## Guardrails (in code, not prompts)

- **Secrets stay separate.** `host_policies` and `deal_secrets` have no public read policy. `buildHostContext` adds the policy only in "negotiate" mode; `buildGuestContext` adds the guest's limits and never the policy. Server-only values reach tools through AI SDK `toolsContext`.
- **Money math is code.** `computeQuote` produces every price line.
- **Validators on every money tool.** `validateOffer` rejects below-floor accepts, above-list amounts, terms the host did not allow, guest accepts above the guest's max, and anything past `max_rounds`. The rejection goes back to the agent, and a grey `rejected` note goes in the deal room without host numbers.
- **People approve.** Below auto-accept, a deal waits in `agreed_pending_host`; only the host's tap creates the reservation.
- **No invented facts.** `answer_question` needs at least one source (fact key, house-rule key, manual line); otherwise `forward_to_host`.
- **Guest text is data.** No tool can change a policy; "ignore your rules" changes nothing.
- **Limits.** One open deal per guest per listing; `max_rounds` 6; deals expire after 24 hours (off in demo mode).
- **Everything is logged** to the activity feed.

## Negotiation protocol

Each deal message (`deal_messages`):

```json
{
  "deal_id": "uuid",
  "actor": "guest_agent | host_agent | guest | host | system",
  "type": "offer | counter | accept | decline | escalate | question | info | rejected",
  "amount_cents": 48000,
  "terms": { "late_checkout": false },
  "body": "4 weekday nights in low season"
}
```

States: `open`, then offers and counters, then `agreed_pending_host` or `approved` (at or above auto-accept), then a reservation. Side exits: `declined`, `escalated`, `expired`.

## Worked example: "Can I pay $50 less?"

Hero home 1, **Mon Nov 9 to Fri Nov 13, 2026** (four weekday nights), 4 guests (the brief's four friends). List total: 4 x $120 + $40 cleaning = **$520** (the 10% service fee is added afterwards).

Host policy (private): floor $100 a night (4 x $100 + $40 = $440), max discount 15% (min $442), auto-accept at $490. Effective floor **$442**. Guest limits (private): target $470, max $500.

| Round | Who           | Message                                                           | Code check  | Feed line                                         |
| ----- | ------------- | ----------------------------------------------------------------- | ----------- | ------------------------------------------------- |
| 1     | Guest agent   | Offer **$470**: "4 weekday nights, low season, flexible check-in" | valid       | "Guest agent offered $470 for Nov 9-13 (-$50)"    |
| 2     | Host agent    | Counter **$495**: "Can do $25 off for 4 nights"                   | >= $442     | "Host agent countered at $495"                    |
| 3     | Guest agent   | Counter **$480**                                                  | <= $500     | "Guest agent countered at $480"                   |
| 4     | Host agent    | Accepts **$480**; below $490, so `agreed_pending_host`            | >= $442     | "Host agent agreed to $480, waiting for the host" |
| 5     | Host (person) | Taps **Approve**                                                  | people only | "Giorgi approved $480 for Nov 9-13"               |

Reservation: nights $480, cleaning $40, discount -$40, service fee $48, total **$528**. These numbers are tests (lib/pricing.test.ts, lib/validators.test.ts).

(An earlier draft used Nov 6-10. Those nights include Friday and Saturday, which would use the weekend rate if the host set one, so the demo uses Nov 9-13.)

Other branches: lowball $400 (host accept refused, counter >= $442 or decline); not negotiable (keep $520, offer late checkout); round limit (expired, guest may accept the last offer); over budget (guest agent asks the guest); instant (>= $490 approved with no person).

## Prompts

Drafts in `agents/prompts/`: `guest.md`, `host.md`, `host-qa.md`, `verifier-xray.md`, `verifier-gaps.md`. Load with `loadPrompt(name, vars)`; it throws if a placeholder is missing.
