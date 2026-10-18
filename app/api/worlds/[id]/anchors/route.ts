import { z } from "zod";
import { logEvent } from "@/lib/events";
import { errorResponse, jsonError, parseJson } from "@/lib/http";
import { AnchorKind, AnchorSchema, Vec3Schema } from "@/lib/schemas/world";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * Anchor mode of the tour (GH-11, `?anchors=1`): save or delete a named camera point.
 * Dev only: 403 in production (RLS blocks browser writes, so this route writes with the
 * service role). `position` is the camera eye, `look_at` the clicked point (D-014).
 */
const Body = z.object({
  name: z.string().trim().min(1).max(60),
  kind: AnchorKind,
  room: z.string().trim().max(60).nullable().optional(),
  position: Vec3Schema,
  look_at: Vec3Schema.nullable(),
});

function devOnly(): Response | null {
  return process.env.NODE_ENV === "production"
    ? jsonError(403, "dev_only", "Anchor mode only works on a development server.")
    : null;
}

async function worldListing(worldId: string): Promise<string | null> {
  const { data } = await supabaseAdmin()
    .from("worlds")
    .select("listing_id")
    .eq("id", worldId)
    .maybeSingle();
  return data?.listing_id ?? null;
}

export async function POST(request: Request, ctx: RouteContext<"/api/worlds/[id]/anchors">) {
  const refused = devOnly();
  if (refused) return refused;
  try {
    const { id } = await ctx.params;
    if (!z.uuid().safeParse(id).success) return jsonError(400, "invalid_world", "Unknown world.");
    const body = await parseJson(request, Body);
    const listingId = await worldListing(id);
    if (!listingId) return jsonError(404, "world_not_found", "Unknown world.");
    const { data, error } = await supabaseAdmin()
      .from("anchors")
      .insert({
        world_id: id,
        name: body.name,
        kind: body.kind,
        room: body.room ?? null,
        position: body.position,
        look_at: body.look_at,
        source: "manual",
      })
      .select("*")
      .single();
    if (error || !data) throw new Error(`Anchor insert failed: ${error?.message}`);
    const anchor = AnchorSchema.parse(data);
    await logEvent({
      actor_type: "human",
      actor_name: "Host (anchor mode)",
      action: "anchor.created",
      summary: `Labelled "${anchor.name}" in the 3D ${anchor.room ?? "tour"}`.slice(0, 140),
      listing_id: listingId,
      payload: { world_id: id, anchor_id: anchor.id, kind: anchor.kind },
    });
    return Response.json({ anchor }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, ctx: RouteContext<"/api/worlds/[id]/anchors">) {
  const refused = devOnly();
  if (refused) return refused;
  try {
    const { id } = await ctx.params;
    const anchorId = new URL(request.url).searchParams.get("anchorId");
    if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(anchorId).success) {
      return jsonError(400, "invalid_input", "Pass a world id and ?anchorId=.");
    }
    const { data, error } = await supabaseAdmin()
      .from("anchors")
      .delete()
      .eq("id", anchorId!)
      .eq("world_id", id)
      .select("name")
      .maybeSingle();
    if (error) throw new Error(`Anchor delete failed: ${error.message}`);
    if (!data) return jsonError(404, "anchor_not_found", "No such anchor in this world.");
    const listingId = await worldListing(id);
    await logEvent({
      actor_type: "human",
      actor_name: "Host (anchor mode)",
      action: "anchor.deleted",
      summary: `Removed the 3D label "${data.name}"`.slice(0, 140),
      listing_id: listingId,
      payload: { world_id: id, anchor_id: anchorId },
    });
    return Response.json({ deleted: anchorId });
  } catch (error) {
    return errorResponse(error);
  }
}
