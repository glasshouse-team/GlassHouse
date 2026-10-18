---
name: demo-readiness
description: Get Glasshouse demo-ready - the hour-13 MVP checkpoint, demo mode, reset script, pre-flight page, QA checklist, backup video, cut order, pitch slides, the 3-minute script and judge Q&A. Use for GH-17, GH-26 and GH-27, and whenever someone asks "are we ready to demo?".
when_to_use: The user mentions "MVP checkpoint", "demo mode", "reset the demo", "pre-flight", "QA checklist", "backup video", "what do we cut", "pitch", "slides", "demo script", "rehearse", "judge questions", "are we ready".
---

# Demo readiness

Full script, stage setup and Q&A: docs/DEMO.md. Judging criteria: a clear problem, a creative solution, it really solves the problem. Business model and pricing are not judged; don't spend time on them.

## GH-17 MVP checkpoint (hour 13, both developers)

Run on the deployed Vercel URL, not localhost, with Beka's phone as the host:

1. Trip brief: the hero home ranks first with cited reasons.
2. Another listing: the X-ray shows the "sea view" contradiction.
3. Hero home 1: X-ray panel, then "Walk through this home": doorway arrows between rooms, Jump to room (D-009).
4. Ask this home: "Can I bring my dog?" gets a sourced answer; "Is there a hair dryer?" is forwarded.
5. Negotiate: target -$50, max $500: $470, $495, $480, Approve on the phone, "Booked".
6. `/feed` lists every step above with the right actors.
   Then record backup video #1 (under 3 minutes) and write cut decisions in GH-17. **Cut order if behind: GH-21, then GH-20, then GH-19.** Floor plan v1 stays. Stretch tickets start only if every should-have is done.

## GH-26 Demo mode, reset, QA (Beka)

- `DEMO_MODE=true`: no World Labs calls (generation returns saved versions), 1.5 s pause between negotiation turns, fixed demo dates.
- `pnpm demo:reset` (scripts/reset-demo.ts): delete every deal, reservation, Q&A conversation and trip brief (the seed makes none, D-032) and the events after the latest `seed.completed`; restore hero-1's policy and manual (drops the hair-dryer answer); publish Hero 2 v1 (the gap version, D-026); print "Demo ready". `--dry-run` prints the plan only. QA checklist with how to run each line: docs/QA.md.
- `/demo/check`: green or red for env vars, Supabase, both hero worlds loading, X-ray rows, a Claude ping (`/api/health` covers the env part).
- QA checklist on the deployed URL:
  - [ ] `pnpm check` passes; the lowball is blocked
  - [ ] "$50 less" passes 5 runs in a row
  - [ ] X-ray catches both lies
  - [ ] Brief returns the hero home first in under 10 s
  - [ ] Hero 3D works on laptop, iPhone and Android; every doorway arrow leads to the right room
  - [ ] Jump to room and the minimap work
  - [ ] Gap pin at the kitchen photo-frame wall (D-026); v2 has a higher coverage score
  - [ ] Feed shows each action within 2 s
  - [ ] Network tab: no World Labs requests on page views
  - [ ] Reset, run, reset, run works twice

## GH-27 Pitch (Temuri)

Slides (5 at most): 1) Problem: "You can't trust or picture a home before you book it." 2) Glasshouse: three agents plus the honest 3D. 3) Live demo. 4) How we keep it honest: gap check, overlay, money rules in code, human approval. 5) What's next, one line each: stay concierge, deposit escrow, native capture.

3-minute script (details in docs/DEMO.md): hook (Temuri), brief and X-ray (Beka), 3D walk, "Where would I work?", "Show what's real" (Temuri), "$50 less" with the phone approval (Beka), host side cooking-show style: record 10 s live, then the saved gap note and v2 (Temuri), close and map to the judging criteria (Beka).

Rehearse three times under 3:00. Record the final backup video after the last code change. Stage kit: laptop charged, HDMI/USB-C adapter, phone mirroring tested, notifications off, `pnpm demo:reset` just run, other tabs closed, backup video on the desktop. Switch to the video after one failed retry.
