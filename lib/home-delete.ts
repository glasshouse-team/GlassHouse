/**
 * When a host may delete a home (D-044). Deleting a listing cascades to everything under it
 * (photos, reviews, rules, 3D versions, captures, deals, reservations, its feed events), so it
 * is refused while guests depend on it, and for the seeded demo homes.
 */

export interface DeleteState {
  /** The listing is one of SEED_LISTINGS (the demo homes `pnpm seed` creates). */
  isSeed: boolean;
  /** Deals still open, waiting for the host or handed to a person. */
  liveDeals: number;
  /** Confirmed stays that haven't ended yet. */
  upcomingStays: number;
}

export type DeleteBlock = { code: string; message: string };

/** Why this home can't be deleted now, or null when it can. */
export function deleteBlocker(state: DeleteState): DeleteBlock | null {
  if (state.isSeed)
    return {
      code: "demo_home",
      message: "This is one of the demo homes, so it stays. Homes you added can be deleted.",
    };
  if (state.upcomingStays > 0)
    return {
      code: "has_bookings",
      message: `This home has ${state.upcomingStays} upcoming ${state.upcomingStays === 1 ? "stay" : "stays"}. It can be deleted after ${state.upcomingStays === 1 ? "it ends" : "they end"}.`,
    };
  if (state.liveDeals > 0)
    return {
      code: "live_deals",
      message: "Guests are negotiating for this home. Decline or finish those deals first.",
    };
  return null;
}
