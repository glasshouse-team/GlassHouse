/**
 * Host photo uploads for a listing's gallery (D-045). Photos come from the phone's gallery or
 * camera (a plain file picker, no `capture`), are shrunk in the browser, re-encoded on the
 * server (which also drops EXIF, GPS included) and stored like the seed's photos:
 * `listings/<id>/photos/NN-room.jpg`, one `listing_photos` row each, so `pnpm seed` and the
 * X-ray (photo_NN) read them the same way.
 */

/** Photos sent in one request (each about 0.3 MB after shrinking, under the 4.5 MB body cap). */
export const MAX_BATCH = 6;
/** Photos a listing can hold: the file names carry a two-digit number. */
export const MAX_PHOTOS = 60;
/** The longest side after shrinking, in pixels (the seed's photos are 1600 px too). */
export const MAX_SIDE_PX = 1600;
/** Largest file the server accepts per photo, after the browser shrank it. */
export const MAX_FILE_BYTES = 4 * 1024 * 1024;

export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

/** "Living room" -> "living-room"; "photo" when nothing usable is left. */
export function roomSlug(room: string | null | undefined): string {
  const slug = (room ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30)
    .replace(/-+$/, "");
  return slug || "photo";
}

/**
 * Positions and file names for `count` new photos after the listing's existing ones:
 * `NN-room.jpg`, numbered on from the highest sort, or null when they would not fit.
 */
export function nextPhotoSlots(
  existingSorts: number[],
  count: number,
  room: string | null,
): { sort: number; name: string }[] | null {
  const start = existingSorts.length === 0 ? 1 : Math.max(...existingSorts) + 1;
  if (existingSorts.length + count > MAX_PHOTOS || start + count - 1 > 99) return null;
  const slug = roomSlug(room);
  return Array.from({ length: count }, (_, i) => {
    const sort = start + i;
    return { sort, name: `${String(sort).padStart(2, "0")}-${slug}.jpg` };
  });
}
