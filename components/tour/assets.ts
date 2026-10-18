/**
 * Browser cache of the tour's splat and collider files (GH-11). Each URL is fetched once per
 * page; neighbours are preloaded so a doorway arrow switches rooms without a second download.
 * Only URLs in our storage get here (spots.ts servedFromOurStorage): never World Labs.
 */

type Progress = (fraction: number) => void;

interface Entry {
  promise: Promise<Uint8Array>;
  listeners: Set<Progress>;
  fraction: number;
}

const cache = new Map<string, Entry>();
/** Keep about this many files: web splats are 5-30 MB each, phones have little memory. */
const MAX_ENTRIES = 12;

async function download(url: string, entry: Entry): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const total = Number(res.headers.get("content-length")) || 0;
  if (!res.body || !total) {
    const bytes = new Uint8Array(await res.arrayBuffer());
    report(entry, 1);
    return bytes;
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    report(entry, Math.min(received / total, 0.99));
  }
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  report(entry, 1);
  return bytes;
}

function report(entry: Entry, fraction: number) {
  entry.fraction = fraction;
  for (const listener of entry.listeners) listener(fraction);
}

/** Bytes of a file, from the cache when it was fetched or preloaded before. */
export function fetchBytes(url: string, onProgress?: Progress): Promise<Uint8Array> {
  let entry = cache.get(url);
  if (!entry) {
    entry = { promise: Promise.resolve(new Uint8Array()), listeners: new Set(), fraction: 0 };
    const e = entry;
    e.promise = download(url, e).catch((error: unknown) => {
      cache.delete(url); // a failed download may be retried
      throw error;
    });
    cache.set(url, e);
    while (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value!);
  }
  if (onProgress) {
    const listener = onProgress;
    entry.listeners.add(listener);
    listener(entry.fraction);
    entry.promise.finally(() => entry.listeners.delete(listener)).catch(() => {});
  }
  return entry.promise;
}

/** Starts downloads in the background; errors are ignored (the real load retries). */
export function preload(urls: (string | null | undefined)[]): void {
  for (const url of urls) if (url) fetchBytes(url).catch(() => {});
}
