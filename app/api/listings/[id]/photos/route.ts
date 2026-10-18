import { addListingPhotos, getListingById, TooManyPhotosError } from "@/lib/data/listings";
import { logEvent } from "@/lib/events";
import { errorResponse, jsonError } from "@/lib/http";
import { MAX_BATCH, MAX_FILE_BYTES } from "@/lib/listing-photos";
import { getViewer } from "@/lib/viewer";

/**
 * POST /api/listings/[id]/photos: the host adds photos to a home's gallery (D-045), from the
 * phone's gallery or camera. Multipart: `photos` (1 to MAX_BATCH image files, shrunk in the
 * browser first) and an optional `room`. The listing's host only. Owner: Beka.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/listings/[id]/photos">) {
  try {
    const { id } = await ctx.params;
    const viewer = await getViewer();
    if (viewer.role !== "host")
      return jsonError(403, "hosts_only", "Switch to the host view to add photos.");
    const listing = await getListingById(id);
    if (!listing) return jsonError(404, "not_found", "This home does not exist.");
    if (listing.host_id !== viewer.profileId)
      return jsonError(403, "not_your_listing", "Only this home's host can add photos.");

    const form = await request.formData().catch(() => null);
    if (!form) return jsonError(400, "invalid_input", "Send the photos as a form upload.");
    const files = form.getAll("photos").filter((f): f is File => f instanceof File);
    if (files.length === 0 || files.length > MAX_BATCH)
      return jsonError(400, "invalid_input", `Send 1 to ${MAX_BATCH} photos at a time.`);
    if (files.some((f) => !f.type.startsWith("image/")))
      return jsonError(400, "invalid_input", "Only photos can be added here.");
    if (files.some((f) => f.size > MAX_FILE_BYTES))
      return jsonError(413, "too_large", "One of the photos is too large. Try a smaller one.");
    const roomValue = form.get("room");
    const room = typeof roomValue === "string" ? roomValue.trim().slice(0, 40) || null : null;

    const images = await Promise.all(files.map(async (f) => Buffer.from(await f.arrayBuffer())));
    let added: number;
    try {
      added = await addListingPhotos(listing.id, images, room);
    } catch (error) {
      if (error instanceof TooManyPhotosError) return jsonError(409, "too_many", error.message);
      if (error instanceof Error && /unsupported image|Input buffer|corrupt/i.test(error.message))
        return jsonError(400, "not_an_image", "One of the files couldn't be read as a photo.");
      throw error;
    }
    await logEvent({
      actor_type: "human",
      actor_name: `${viewer.name} (host)`,
      action: "listing.photos_added",
      listing_id: listing.id,
      summary: `${viewer.name} added ${added} ${added === 1 ? "photo" : "photos"}${room ? ` of the ${room.toLowerCase()}` : ""} to ${listing.title}`,
      payload: { count: added, room },
    });
    return Response.json({ added }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
