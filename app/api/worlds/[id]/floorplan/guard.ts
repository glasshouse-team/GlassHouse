import { timingSafeEqual } from "node:crypto";

/**
 * Gate for POST /api/worlds/[id]/floorplan (GH-18 review). The rebuild runs with the service-role
 * client, rewrites shared rows and storage and slices 130-215k triangles per spot, so:
 * - in production it is refused unless the `x-admin-secret` header matches FLOORPLAN_ADMIN_SECRET
 *   (unset means always refused there; run `pnpm floorplans` instead);
 * - one build per world at a time, and at most one start per world every COOLDOWN_MS.
 */
export const ADMIN_HEADER = "x-admin-secret";
export const COOLDOWN_MS = 60_000;

export type GuardRefusal = {
  ok: false;
  status: 403 | 409 | 429;
  error: string;
  message: string;
  retryAfterS?: number;
};
export type GuardResult = { ok: true } | GuardRefusal;

function sameSecret(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Production check: dev and test pass; production needs the matching admin secret header. */
export function checkAdminSecret(
  headers: Headers,
  env: { NODE_ENV?: string; FLOORPLAN_ADMIN_SECRET?: string } = process.env,
): GuardResult {
  if (env.NODE_ENV !== "production") return { ok: true };
  const expected = env.FLOORPLAN_ADMIN_SECRET?.trim();
  const given = headers.get(ADMIN_HEADER)?.trim();
  if (expected && given && sameSecret(given, expected)) return { ok: true };
  return {
    ok: false,
    status: 403,
    error: "admin_only",
    message: "Floor plans are rebuilt offline in production. Run pnpm floorplans.",
  };
}

/** Per-world lock plus cooldown. In memory, per server instance: enough for one demo server. */
export function createBuildLimiter(cooldownMs = COOLDOWN_MS, now: () => number = Date.now) {
  const running = new Set<string>();
  const lastStart = new Map<string, number>();
  return {
    /** Takes the build slot for this world, or says why not. Call `release` when the build ends. */
    acquire(worldId: string): GuardResult {
      if (running.has(worldId))
        return {
          ok: false,
          status: 409,
          error: "already_building",
          message: "This floor plan is being built right now.",
        };
      const t = now();
      const last = lastStart.get(worldId);
      if (last !== undefined && t - last < cooldownMs)
        return {
          ok: false,
          status: 429,
          error: "too_soon",
          message: "This floor plan was rebuilt a moment ago. Try again shortly.",
          retryAfterS: Math.ceil((cooldownMs - (t - last)) / 1000),
        };
      running.add(worldId);
      lastStart.set(worldId, t);
      return { ok: true };
    },
    release(worldId: string): void {
      running.delete(worldId);
    },
  };
}

/** A refusal as a JSON response, with Retry-After on 429. */
export function guardResponse(result: GuardRefusal): Response {
  const headers: HeadersInit = result.retryAfterS
    ? { "Retry-After": String(result.retryAfterS) }
    : {};
  return Response.json(
    { error: result.error, message: result.message },
    { status: result.status, headers },
  );
}
