import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { MissingEnvError } from "./errors";
// After GH-5 applies the migration, run `pnpm db:types` and type the clients:
// import type { Database } from "./database.types";

/** Storage buckets. `media` is public (World Labs must fetch inputs from it); `captures` is private. */
export const BUCKETS = { media: "media", captures: "captures" } as const;

let adminClient: SupabaseClient | undefined;
let browserClient: SupabaseClient | undefined;

/** True when the public Supabase URL and anon key are configured. */
export function hasSupabaseEnv(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

/**
 * Service-role client. Server only (API routes, server components, scripts):
 * it bypasses row level security and can read host policies and deal secrets.
 */
export function supabaseAdmin(): SupabaseClient {
  if (typeof window !== "undefined") {
    throw new Error("supabaseAdmin() is server-only: it uses the service-role key.");
  }
  if (!adminClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const missing = [
      !url && "NEXT_PUBLIC_SUPABASE_URL",
      !key && "SUPABASE_SERVICE_ROLE_KEY",
    ].filter(Boolean) as string[];
    if (missing.length) throw new MissingEnvError(missing);
    adminClient = createClient(url!, key!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return adminClient;
}

/** Anon client for the browser: public reads and Realtime subscriptions only. */
export function supabaseBrowser(): SupabaseClient {
  if (!browserClient) {
    // Literal access so Next.js inlines the NEXT_PUBLIC_ values into client bundles.
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
      throw new MissingEnvError(["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"]);
    }
    browserClient = createClient(url, key);
  }
  return browserClient;
}

/** Public URL of an object in the public `media` bucket. */
export function publicMediaUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) throw new MissingEnvError(["NEXT_PUBLIC_SUPABASE_URL"]);
  return `${base.replace(/\/$/, "")}/storage/v1/object/public/${BUCKETS.media}/${path.replace(/^\//, "")}`;
}
