---
name: mobile-capture
description: Capture homes - the photo-ring checklist for hero homes (one 8-photo ring per room spot), plus the in-browser phone recorder (getUserMedia, MediaRecorder, iOS compass permission, coverage ring, brightness warnings, resumable upload, ffmpeg preparation). Use for GH-3 and GH-6 filming, GH-22 guided capture, the GH-23 check-in recorder and GH-25 narration audio.
when_to_use: The user mentions "film the home", "walkthrough video", "how to record", "capture page", "camera in the browser", "MediaRecorder", "compass", "DeviceOrientation", "iPhone camera does not open", "upload video", "fill-in clip", "check-in video", "narration".
---

# Mobile capture

## Photographing a home (GH-6)

Before: owner's consent (screenshot it into the ticket); remove personal items, photos of people, documents and private screens; lights on, curtains open, interior doors open, nobody in frame.

One spot per room (two in a big or L-shaped room), 8 photos per spot (D-009):

- Stand in the middle of the room, phone at chest height and level, 0.5x lens, portrait.
- Take 8 photos turning right about 45 degrees each time, a full circle; turn around the phone and keep it in one place.
- Centre each doorway in one photo: its direction becomes the arrow to the next room.
- Name one folder per room. Extra rings tilted up or down don't fit World Labs' 8-photo limit.

For the gap demo on Hero 1: version 1 skips one corner on purpose (for example left of the fridge); version 2 re-shoots that spot's ring with the corner covered. Optionally move a chair or lamp and record a 30-second "check-in" clip for GH-23.

Then `pnpm worlds generate --images ... --azimuths 0,45,...,315 --reconstruct --wait` per spot (marble-world-pipeline skill). A video of one spot (at most 30 s) still works through `pnpm video:prepare`.

## The phone recorder (GH-22, reused by GH-23)

- **HTTPS only.** Phones refuse the camera on http. Use the Vercel preview URL or `ngrok http 3000`.
- **Instructions screen** first, with an "Allow camera and motion" button. On iOS, compass access needs `DeviceOrientationEvent.requestPermission()` called from that tap:
  ```ts
  const D = DeviceOrientationEvent as unknown as {
    requestPermission?: () => Promise<"granted" | "denied">;
  };
  if (typeof D.requestPermission === "function") await D.requestPermission();
  ```
- **Camera:** `navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } }, audio: true })`.
- **Recorder:** pick a type with `MediaRecorder.isTypeSupported` (Safari: `video/mp4`; Chrome: `video/webm;codecs=vp9` or `vp8`); `recorder.start(1000)` collects 1-second chunks; build a Blob on stop.
- **Heading:** iOS gives `event.webkitCompassHeading`; Android gives `360 - event.alpha` from `deviceorientationabsolute`. Save `{ t, heading }` samples into `heading_track`.
- **Coverage ring:** 36 bins of 10 degrees per room; fill a bin when a heading sample lands in it; the ring shows the filled share; aim for at least 330 degrees per room.
- **Warnings:** turning too fast (more than about 60 degrees per second), too dark (draw a small video frame to a canvas every 500 ms, average luminance under about 40/255), shaky (`devicemotion` acceleration spikes).
- **"Next room"** saves `{ room, t }` into `room_markers`.
- **Upload:** ask a server route for `createSignedUpload()` (lib/supabase.ts), then PUT the file to `signedUrl` with XMLHttpRequest for a progress bar (or `uploadToSignedUrl`); retry the whole file on failure. No resumable (TUS) upload: it needs a logged-in user or an anon write policy, and RLS gives neither. World Labs takes videos up to 30 s and the server has no ffmpeg (D-015): stop a recording at 30 s, or speed a longer walkthrough up with `pnpm video:prepare` before generating (D-009). `videoBitsPerSecond` near 1_500_000 keeps 30 s near 6 MB. Raw files go to the private `captures` bucket.
- **Prepare with `pnpm video:prepare`,** not in a Vercel function (no ffmpeg there, D-015): lib/media.ts (`prepareVideoArgs`, `extractFramesArgs`, `joinClipsArgs`, `probeVideo`), output to `media`.
- **Fill-in mode:** the same recorder for one spot, with the gap's screenshot shown faintly over the camera so the host can aim.
- **Fallback until GH-22 exists:** `<input type="file" accept="video/*" capture="environment">` plus a typed room list.

## Audio (GH-25)

Keep `audio: true` in the recording for narration. Transcribe with the browser Web Speech API for English, or ElevenLabs Scribe (`ELEVENLABS_API_KEY`) for Georgian.

## Done when (GH-22)

Works on iPhone Safari and Android Chrome over HTTPS; a full capture uploads and starts a generation; room markers saved; the compass ring works on both phones, or the page still works without it if permission is denied.
