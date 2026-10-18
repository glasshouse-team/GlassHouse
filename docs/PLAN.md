# Glasshouse plan

Condensed from the team plan ("Glasshouse — Hackathon Project Plan" Claude doc). Tickets: [tickets/INDEX.md](tickets/INDEX.md).

## The pitch in one line

Three agents search, check and negotiate for people, and every home comes with a 3D tour of its rooms (one world per room spot, Zillow-style) and a floor plan built from the host's own photos, with AI-filled areas flagged instead of hidden.

## Problem

- Guests can't trust listing photos and can't picture the layout from a gallery.
- Price negotiation happens by hand in chat.
- Hosts answer the same questions again and again and reshoot photos without knowing what is missing.
- Airbnb already added conversational AI search, review summaries and AI listing comparison in 2026, so "AI search" alone is not our edge.

## The three agents

| Agent       | Works for        | Does                                                                                                                                                      |
| ----------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Guest agent | The guest        | Turns a trip brief into a ranked shortlist with cited reasons, asks the host questions, flies the 3D camera, negotiates within the guest's private budget |
| Host agent  | The host         | Answers questions from facts, rules and the manual (forwards unknowns), counters within the host's rules, asks the host for missing footage               |
| Verifier    | Nobody (neutral) | Checks listings for contradictions (X-ray), finds blank spots in the 3D, names rooms for the floor plan, compares check-in footage with the listing       |

Every action lands in a live activity feed: "everyone can see who did what".

## Judging

1. **A clear problem:** you can't trust or picture a home before you book it.
2. **A creative solution:** a 3D home with an honesty overlay and a floor plan, plus agents that negotiate within rules enforced by code.
3. **It really solves the problem:** the Verifier checks listings, and at check-in compares what the guest sees with what was listed.

Not judged: business model, pricing, global expansion.

## Features and tiers

| Feature                                       | Ticket                 | Owner  | Tier       |
| --------------------------------------------- | ---------------------- | ------ | ---------- |
| Foundation, pages, booking box                | GH-2, GH-5, GH-7, GH-8 | Beka   | Must       |
| F1 Listing X-ray                              | GH-9                   | Temuri | Must       |
| F2 Trip brief search                          | GH-14                  | Beka   | Must       |
| F3 3D pipeline + per-spot room tour           | GH-10, GH-11           | Temuri | Must       |
| F4 Activity feed                              | GH-12                  | Beka   | Must       |
| F5 Negotiation + deal room                    | GH-15                  | Beka   | Must       |
| F5b Host Q&A                                  | GH-16                  | Temuri | Must       |
| F7 Floor plan v1                              | GH-18                  | Temuri | Should     |
| F6 Gap check v1                               | GH-19                  | Temuri | Should     |
| F8 Ask the space                              | GH-20                  | Beka   | Should     |
| F9 Honesty overlay + coverage score           | GH-21                  | Beka   | Should     |
| F10 Guided capture                            | GH-22                  | Temuri | Stretch    |
| F11 Check-in verification                     | GH-23                  | Beka   | Stretch    |
| F12 Spatial reviews, F13 Narration to listing | GH-24, GH-25           | Both   | Nice       |
| F14 Stay concierge, F15 Deposit escrow        | none                   |        | Slide only |

## Timeline (two developers)

| Hours | Temuri (3D, capture, Verifier)                                                   | Beka (app, agents, data)                                       | Gate                              |
| ----- | -------------------------------------------------------------------------------- | -------------------------------------------------------------- | --------------------------------- |
| 0-1   | World Labs key; go/no-go walkthrough; start generation                           | Repo, Supabase, Vercel, keys, ngrok                            | Keys work                         |
| 1-3   | Judge go/no-go, pick the path; photograph 2 hero homes; start generations        | Airbnb teardown (1h); contracts, schema, CLAUDE.md, brand      | Contracts merged by hour 4        |
| 3-9   | X-ray while worlds generate; 3D pipeline; spot viewer with scale, doorway arrows | Seed data, listing page, computeQuote, feed, trip brief search | Hero worlds saved                 |
| 9-13  | Jump to room, anchors; host Q&A                                                  | Negotiation + deal room + approvals                            | **MVP checkpoint** + backup video |
| 13-18 | Floor plan v1; gap check v1                                                      | Ask the space; honesty overlay                                 | **Feature freeze**                |
| 18-22 | Sleep 18-20; polish, slides                                                      | Fixes; sleep 20-22; demo reset                                 | Reset script ready                |
| 22-24 | Rehearse 3x; stage setup                                                         | Rehearse 3x; final backup video                                | Ready                             |

Cut order if behind: GH-21, then GH-20, then GH-19. Floor plan v1 stays.

## Risks and fallbacks

| Risk                                   | Fallback                                                                   |
| -------------------------------------- | -------------------------------------------------------------------------- |
| Spot world blurs far from its 8 photos | Keep visitors at each spot; doorway arrows switch to the next spot (D-009) |
| Walkthrough over 30 s or 20 MB         | `pnpm video:prepare` speeds it up to 29 s and under 20 MB (D-009)          |
| Generation slower than expected        | Start hero generations in hour 1; demo only saved versions                 |
| Floor plan slicing noisy               | Sonnet room rectangles on the top-down render, or show the render itself   |
| Spark splat tinting unclear            | Translucent amber spheres at gap positions                                 |
| Agents drift in negotiation            | One money action per turn, validators, tighter prompts, fixed demo seed    |
| iPhone camera or compass blocked       | HTTPS via ngrok; permission button; Android backup phone                   |
| Venue Wi-Fi fails                      | Run locally; cached splats; backup video                                   |
| Two developers for the whole scope     | Cut order above; two Claude Code sessions each                             |

## Gaps in the idea, and how the plan closes them

AI-invented 3D (gap check + overlay + coverage score); trust (neutral Verifier); leaked limits (separate secret tables and context builders); LLM money math (computeQuote + validators); unwanted commitments (human approval below auto-accept); real units (Marble metric scale); room names (capture room list + top-down labels); 20 MB inputs (video prep); one input type per generation (join clips or frames); minutes per generation (generate once, save versions); photos-only hosts (multi-image or HY World); bad captures (guided capture); privacy (consent, private bucket); phone HTTPS (ngrok); prompt injection (guest text is data); hosts who never answer (deals expire, questions wait); weak phones (photos, facts and plan work without 3D); "isn't this Airbnb?" (agents that act, verification, honest 3D).

## After the hackathon

Separate staging and production Supabase projects with backups; a job runner (Inngest or Trigger.dev) instead of polling; a CDN for splats; Supabase Auth; a marketplace payment provider; the right World Labs plan for commercial use; terms, privacy policy and filming consent reviewed by a lawyer; Sentry and PostHog; Georgian, English and Russian.
