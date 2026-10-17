---
name: mobile-capture
description: Capture homes on video - the filming checklist for hero homes and the go/no-go test, plus the in-browser phone recorder (getUserMedia, MediaRecorder, iOS compass permission, coverage ring, brightness warnings, resumable upload, ffmpeg preparation). Use for GH-3 and GH-6 filming, GH-22 guided capture, the GH-23 check-in recorder and GH-25 narration audio.
when_to_use: The user mentions "film the home", "walkthrough video", "how to record", "capture page", "camera in the browser", "MediaRecorder", "compass", "DeviceOrientation", "iPhone camera does not open", "upload video", "fill-in clip", "check-in video", "narration".
---

# Mobile capture

## Filming a home (GH-3, GH-6)

Before: owner's consent (screenshot it into the ticket); remove personal items, photos of people, documents and private screens; lights on, curtains open, interior doors open, nobody in frame.

Walkthrough, 60-90 seconds:

- Walk slowly, phone at chest height, landscape or portrait but the same all the way.
- In the middle of each room, turn one slow full circle (about 10 seconds per circle).
- Pass through doorways straight, not at an angle. Don't point at mirrors or windows for long.
- Write the room list in the order you walked it; it becomes the room checklist and floor-plan labels.

Also take 15-25 photos per home: each room from 2-3 angles, the window view, the bathroom. For the gap demo on Hero 1: version 1 skips one corner on purpose (for example left of the fridge); a separate 10-second fill-in clip shows exactly that corner. Optionally move a chair or lamp and record a 30-second "check-in" clip for GH-23.

Then: `pnpm video:prepare walk.mov` (720p, 30 fps, no audio, under 20 MB) and upload to the public `media` bucket.

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
- **Upload:** ask the server for `createSignedUploadUrl` (Supabase), then `uploadToSignedUrl` from the browser with a progress bar; retry on failure. Raw files go to the private `captures` bucket.
- **Prepare on the server:** lib/media.ts (`prepareVideoArgs`, `extractFramesArgs`, `joinClipsArgs`, `probeDurationSec`), output to `media`.
- **Fill-in mode:** the same recorder for one spot, with the gap's screenshot shown faintly over the camera so the host can aim.
- **Fallback until GH-22 exists:** `<input type="file" accept="video/*" capture="environment">` plus a typed room list.

## Audio (GH-25)

Keep `audio: true` in the recording for narration. Transcribe with the browser Web Speech API for English, or ElevenLabs Scribe (`ELEVENLABS_API_KEY`) for Georgian.

## Done when (GH-22)

Works on iPhone Safari and Android Chrome over HTTPS; a full capture uploads and starts a generation; room markers saved; the compass ring works on both phones, or the page still works without it if permission is denied.
