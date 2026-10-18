/** The home a step from `index` (arrows wrap around), for the dashboard's home tabs. */
export function stepHome(index: number, delta: number, count: number): number {
  if (count <= 0) return 0;
  return (((index + delta) % count) + count) % count;
}

/** The tab to open first: the home named in `?home=` (slug or id), otherwise the first one. */
export function initialHome(homes: { id: string; slug: string }[], wanted: unknown): number {
  if (typeof wanted !== "string" || wanted === "") return 0;
  const index = homes.findIndex((h) => h.slug === wanted || h.id === wanted);
  return index < 0 ? 0 : index;
}
