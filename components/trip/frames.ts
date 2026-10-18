/**
 * Arrival frames are taken in the browser (D-015: no ffmpeg in Vercel functions): about one
 * frame a second, at most 8, JPEG at 1024 px on the long side. The pure helpers are tested;
 * the canvas functions run only in the browser.
 */
import { MAX_CHECKIN_FRAMES } from "@/lib/schemas/checkin";

export const FRAME_PX = 1024;
export const FRAME_QUALITY = 0.75;

/** Up to `max` items spread evenly from first to last. */
export function pickEvenly<T>(items: T[], max = MAX_CHECKIN_FRAMES): T[] {
  if (items.length <= max) return items;
  if (max <= 1) return items.slice(0, max);
  const step = (items.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => items[Math.round(i * step)]);
}

/** Seek times for a video: one a second (from 0.5 s), at most `max`, spread over the clip. */
export function frameTimes(duration: number, max = MAX_CHECKIN_FRAMES): number[] {
  if (!Number.isFinite(duration) || duration <= 0) return [0];
  const times: number[] = [];
  for (let t = Math.min(0.5, duration / 2); t < duration; t += 1) times.push(t);
  return pickEvenly(times, max).map((t) => Math.round(t * 100) / 100);
}

/** Width and height that fit inside `max` px on the long side, never enlarged. */
export function fitSize(width: number, height: number, max = FRAME_PX) {
  const scale = Math.min(1, max / Math.max(width, height, 1));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/** Draws an image, video frame or bitmap into a JPEG data URL. Browser only. */
export function toJpeg(source: CanvasImageSource, width: number, height: number): string {
  const size = fitSize(width, height);
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  canvas.getContext("2d")?.drawImage(source, 0, 0, size.width, size.height);
  return canvas.toDataURL("image/jpeg", FRAME_QUALITY);
}

function once(target: EventTarget, event: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = () => {
      target.removeEventListener("error", fail);
      resolve();
    };
    const fail = () => {
      target.removeEventListener(event, done);
      reject(new Error("The video could not be read. Try photos instead."));
    };
    target.addEventListener(event, done, { once: true });
    target.addEventListener("error", fail, { once: true });
  });
}

/** Frames from a video file: seek to each time, await `seeked`, draw. Browser only. */
export async function framesFromVideo(file: Blob): Promise<string[]> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = url;
  try {
    await once(video, "loadeddata");
    let duration = video.duration;
    if (!Number.isFinite(duration)) {
      // Recorded webm has no duration until the browser seeks to the end.
      video.currentTime = 1e7;
      await once(video, "seeked");
      duration = video.duration;
    }
    const frames: string[] = [];
    for (const t of frameTimes(duration)) {
      video.currentTime = t;
      await once(video, "seeked");
      frames.push(toJpeg(video, video.videoWidth, video.videoHeight));
    }
    return frames;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Frames from photos (at most 8, spread over the selection). Browser only. */
export async function framesFromImages(files: Blob[]): Promise<string[]> {
  const frames: string[] = [];
  for (const file of pickEvenly(files)) {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    frames.push(toJpeg(bitmap, bitmap.width, bitmap.height));
    bitmap.close();
  }
  return frames;
}
