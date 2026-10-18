/**
 * GH-16 (owner: Temuri). Database access for Q&A threads (`conversations` kind "qa" and
 * `messages`). An interface, so askHome and hostReply are tested with an in-memory store.
 * Server only (service role).
 */
import type { Json } from "@/lib/database.types";
import { supabaseAdmin } from "@/lib/supabase";
import type { CheckedSource } from "./sources";

export type MessageActor = "guest" | "guest_agent" | "host" | "host_agent" | "system";

export interface NewMessage {
  conversationId: string;
  actor: MessageActor;
  body: string;
  sources?: CheckedSource[];
  needsHost?: boolean;
  answeredBy?: string | null;
}

export interface WaitingQuestion {
  id: string;
  body: string;
  conversationId: string;
  listingId: string;
  hostId: string;
  needsHost: boolean;
  houseManual: string;
}

export interface QaStore {
  /** Reuses `conversationId` when it is a Q&A thread of this listing, else creates one. */
  conversation(listingId: string, guestId?: string, conversationId?: string): Promise<string>;
  addMessage(message: NewMessage): Promise<string>;
  setNeedsHost(messageId: string, needsHost: boolean): Promise<void>;
  /** Clears `needs_host` only if it is still set; false when someone answered first. */
  markAnswered(messageId: string, answeredBy: string): Promise<boolean>;
  question(messageId: string): Promise<WaitingQuestion | null>;
  hostName(hostId: string): Promise<string>;
  setHouseManual(listingId: string, manual: string): Promise<void>;
}

function check(error: { message: string } | null, what: string) {
  if (error) throw new Error(`Could not ${what}: ${error.message}`);
}

export function supabaseQaStore(): QaStore {
  const db = supabaseAdmin();
  return {
    async conversation(listingId, guestId, conversationId) {
      if (conversationId) {
        const { data, error } = await db
          .from("conversations")
          .select("id")
          .eq("id", conversationId)
          .eq("listing_id", listingId)
          .eq("kind", "qa")
          .maybeSingle();
        check(error, "load the Q&A thread");
        if (data) return data.id;
      }
      const { data, error } = await db
        .from("conversations")
        .insert({ listing_id: listingId, guest_id: guestId ?? null, kind: "qa" })
        .select("id")
        .single();
      check(error, "start a Q&A thread");
      return data!.id;
    },

    async addMessage(m) {
      const { data, error } = await db
        .from("messages")
        .insert({
          conversation_id: m.conversationId,
          actor: m.actor,
          body: m.body,
          sources: (m.sources ?? []) as unknown as Json,
          needs_host: m.needsHost ?? false,
          answered_by: m.answeredBy ?? null,
        })
        .select("id")
        .single();
      check(error, "save the message");
      return data!.id;
    },

    async setNeedsHost(messageId, needsHost) {
      const { error } = await db
        .from("messages")
        .update({ needs_host: needsHost })
        .eq("id", messageId);
      check(error, "forward the question");
    },

    async markAnswered(messageId, answeredBy) {
      const { data, error } = await db
        .from("messages")
        .update({ needs_host: false, answered_by: answeredBy })
        .eq("id", messageId)
        .eq("needs_host", true)
        .select("id");
      check(error, "mark the question answered");
      return (data?.length ?? 0) > 0;
    },

    async question(messageId) {
      const { data, error } = await db
        .from("messages")
        .select(
          "id, body, needs_host, conversation_id, conversations!inner(listing_id, listings!inner(host_id, house_manual))",
        )
        .eq("id", messageId)
        .maybeSingle();
      check(error, "load the question");
      if (!data) return null;
      const conversation = data.conversations as unknown as {
        listing_id: string;
        listings: { host_id: string; house_manual: string };
      };
      return {
        id: data.id,
        body: data.body,
        needsHost: data.needs_host,
        conversationId: data.conversation_id,
        listingId: conversation.listing_id,
        hostId: conversation.listings.host_id,
        houseManual: conversation.listings.house_manual,
      };
    },

    async hostName(hostId) {
      const { data, error } = await db
        .from("profiles")
        .select("name")
        .eq("id", hostId)
        .maybeSingle();
      check(error, "load the host");
      return data?.name ?? "the host";
    },

    async setHouseManual(listingId, manual) {
      const { error } = await db
        .from("listings")
        .update({ house_manual: manual })
        .eq("id", listingId);
      check(error, "save the house manual");
    },
  };
}
