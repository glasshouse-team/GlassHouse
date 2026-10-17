/**
 * CONTRACT FILE (GH-5 / GH-12, owner: Beka).
 * Every agent tool call and every human action writes one line to the activity feed.
 */
import { EventInputSchema, type EventInput } from "./schemas/core";
import { hasSupabaseEnv, supabaseAdmin } from "./supabase";

const MAX_SUMMARY = 140;

/**
 * Writes one event to `events`. Server only. Never throws: a failed log must not break
 * the action it describes. Without Supabase env it prints to the console instead.
 */
export async function logEvent(input: EventInput): Promise<void> {
  const parsed = EventInputSchema.safeParse(input);
  if (!parsed.success) {
    console.warn("[logEvent] invalid event, not logged:", parsed.error.issues);
    return;
  }
  const event = parsed.data;
  const summary =
    event.summary.length > MAX_SUMMARY
      ? `${event.summary.slice(0, MAX_SUMMARY - 1)}…`
      : event.summary;

  if (!hasSupabaseEnv() || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.info(`[event] ${event.actor_name}: ${summary}`);
    return;
  }

  try {
    const { error } = await supabaseAdmin()
      .from("events")
      .insert({ ...event, summary, payload: event.payload ?? {} });
    if (error) console.warn("[logEvent] insert failed:", error.message);
  } catch (error) {
    console.warn("[logEvent] insert failed:", error);
  }
}
