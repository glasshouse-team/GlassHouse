import { hasEnv, isDemoMode, settings } from "@/lib/env";

export const dynamic = "force-dynamic";

/** GET /api/health: which keys are configured (never their values). Owner: Beka. */
export async function GET() {
  return Response.json({
    ok: true,
    demoMode: isDemoMode(),
    models: { agent: settings.agentModel, bulk: settings.bulkModel, marble: settings.marbleModel },
    env: {
      anthropic: hasEnv("ANTHROPIC_API_KEY"),
      worldlabs: hasEnv("WORLDLABS_API_KEY"),
      supabase: hasEnv(
        "NEXT_PUBLIC_SUPABASE_URL",
        "NEXT_PUBLIC_SUPABASE_ANON_KEY",
        "SUPABASE_SERVICE_ROLE_KEY",
      ),
      elevenlabs: hasEnv("ELEVENLABS_API_KEY"),
    },
  });
}
