/**
 * CONTRACT (GH-20, owner: Beka). What an Ask-the-space tool asks the tour to do.
 * Tools return `{ summary, action, honestyNote? }` on the server; the panel validates the
 * action with TourActionSchema and runs it in the browser through useTour().
 */
import { z } from "zod";
import type { TourApi } from "@/components/tour/TourContext";

export const TourActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("fly_to"), anchorId: z.string() }),
  z.object({ type: z.literal("look_toward"), anchorId: z.string() }),
  z.object({ type: z.literal("highlight_room"), room: z.string().nullable() }),
  z.object({
    type: z.literal("show_fact"),
    key: z.string(),
    value: z.union([z.string(), z.number(), z.boolean()]),
  }),
]);
export type TourAction = z.infer<typeof TourActionSchema>;

/** Runs one action. Unknown anchors are ignored; the tool should not have returned them. */
export async function runTourAction(tour: TourApi, action: TourAction): Promise<void> {
  switch (action.type) {
    case "fly_to":
      if (tour.anchors.some((a) => a.id === action.anchorId)) await tour.flyTo(action.anchorId);
      return;
    case "look_toward": {
      const anchor = tour.anchors.find((a) => a.id === action.anchorId);
      if (anchor) await tour.lookAt(anchor.look_at ?? anchor.position);
      return;
    }
    case "highlight_room":
      tour.highlightRoom(action.room);
      return;
    case "show_fact":
      // The panel shows the fact as a chip; the camera does not move.
      return;
  }
}
