import { MissingEnvError } from "./errors";

/** Server-side environment variables used by the app. See .env.example. */
export type EnvKey =
  | "ANTHROPIC_API_KEY"
  | "WORLDLABS_API_KEY"
  | "NEXT_PUBLIC_SUPABASE_URL"
  | "NEXT_PUBLIC_SUPABASE_ANON_KEY"
  | "SUPABASE_SERVICE_ROLE_KEY"
  | "ELEVENLABS_API_KEY"
  | "SCENARIO_API_KEY";

/** True when every key is set to a non-empty value. */
export function hasEnv(...keys: EnvKey[]): boolean {
  return keys.every((k) => Boolean(process.env[k]?.trim()));
}

/** Returns the values or throws a MissingEnvError that lists every missing key. Server only. */
export function requireEnv<K extends EnvKey>(...keys: K[]): Record<K, string> {
  const missing = keys.filter((k) => !process.env[k]?.trim());
  if (missing.length > 0) throw new MissingEnvError(missing);
  return Object.fromEntries(keys.map((k) => [k, process.env[k]!.trim()])) as Record<K, string>;
}

/** DEMO_MODE=true: never call World Labs, use saved worlds, slow negotiation turns (GH-26). */
export function isDemoMode(): boolean {
  return process.env.DEMO_MODE === "true";
}

/** Model and 3D settings with the plan's defaults. */
export const settings = {
  get agentModel() {
    return process.env.MODEL_AGENT?.trim() || "claude-sonnet-5-5";
  },
  get bulkModel() {
    return process.env.MODEL_BULK?.trim() || "claude-haiku-5-5";
  },
  get marbleModel() {
    return process.env.MARBLE_MODEL?.trim() || "marble-1.1-plus";
  },
};
