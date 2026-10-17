# Demo

Three minutes: one guest journey and one host journey, with the activity feed always visible. Everything runs on saved data in demo mode; the only live camera moment is a 10-second recording.

## Stage setup

- **Projector:** one laptop in split screen: guest view left, host dashboard right, feed in the guest sidebar (or `/feed` full screen).
- **Phone:** the host's phone, mirrored to the laptop, for the live recording and the Approve tap.
- **Before going on:** `pnpm demo:reset`, `DEMO_MODE=true`, `/demo/check` all green, other tabs closed, notifications off.
- **Backup:** the full demo as a video on the desktop; switch to it after one failed retry.

## Script

| Time      | Who                                | On screen                                                                                                                                                                           |
| --------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0:00-0:20 | Temuri                             | Hook: "Ever arrived somewhere that didn't look like the photos?" One line on the problem, one on Glasshouse.                                                                        |
| 0:20-0:45 | Beka                               | Types the trip brief. The guest agent returns a shortlist with cited reasons. The X-ray flags another listing's fake "sea view".                                                    |
| 0:45-1:25 | Temuri                             | Opens the hero home's 3D, walks in; the minimap follows. "Where would I work?" flies the camera to the desk. "Show what's real" tints the AI-filled corner; coverage score visible. |
| 1:25-2:05 | Beka (Temuri holds the host phone) | "Can I pay $50 less?" The deal room fills live: $470, $495, $480. The phone shows "Approve $480 for Nov 9-13?"; tap; "Booked" in the feed.                                          |
| 2:05-2:40 | Temuri with the phone              | Host side, cooking-show style: record 10 seconds live, then open the saved version with its gap note ("Kitchen corner is blank") and the fill-in version with the higher score.     |
| 2:40-3:00 | Beka                               | Close: "Three agents, one rule: show what's real." Map back to the three judging criteria.                                                                                          |

Demo brief: _"4 friends, Kazbegi or Tbilisi, early November, about $60 each per night, one of us works remotely, we want a fireplace or a cozy living room and a mountain view."_

## Questions judges will ask

| Question                           | Answer                                                                                                                                                        |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Isn't the 3D just hallucinated?    | Partly, and we show exactly where: the gap check finds blank spots, the overlay marks them, the coverage score counts them, and hosts are asked to film them. |
| Can the agent give the house away? | No. Floors and limits are enforced in code, and anything below the host's auto-accept level needs a person's tap.                                             |
| How long and how much per 3D home? | About 5 minutes and about $1.20-1.28 per standard world; each version is generated once and saved.                                                            |
| How accurate is the floor plan?    | Approximate: the scale comes from the 3D model's metric estimate, and the host can calibrate with one known width.                                            |
| Why not just Airbnb's AI?          | Airbnb's AI ranks and summarizes. Ours acts for both sides, negotiates within rules, and verifies the home at check-in.                                       |
| Privacy?                           | Owners consent, personal items are removed before filming, check-in videos stay in a private bucket.                                                          |
| What did you build vs use?         | We used Marble for reconstruction. We built the agents, validators, pipeline, gap check, floor plan geometry, capture flow and Verifier.                      |

## Slides (5 at most)

1. Problem. 2. Glasshouse: three agents and the honest 3D. 3. Live demo. 4. How we keep it honest. 5. What's next: stay concierge, deposit escrow, native capture.
