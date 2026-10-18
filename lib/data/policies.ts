/**
 * Host policies are private to the host agent and the host (no RLS read policy): read and
 * write them only here, on the server, never from the guest side (agents/context.ts rules).
 */
import { HostPolicySchema, type HostPolicy } from "@/lib/schemas/core";
import type { PolicyForm } from "@/lib/policy-form";
import { supabaseAdmin } from "@/lib/supabase";

export async function getHostPolicy(listingId: string): Promise<HostPolicy | null> {
  const { data, error } = await supabaseAdmin()
    .from("host_policies")
    .select("*")
    .eq("listing_id", listingId)
    .maybeSingle();
  if (error) throw new Error(`Could not load the host policy: ${error.message}`);
  return data ? HostPolicySchema.parse(data) : null;
}

/** Saves the form fields; long-stay rules, gap nights and the round limit keep their values. */
export async function saveHostPolicy(listingId: string, form: PolicyForm): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("host_policies")
    .upsert({ listing_id: listingId, ...form }, { onConflict: "listing_id" });
  if (error) throw new Error(`Could not save the host policy: ${error.message}`);
}
