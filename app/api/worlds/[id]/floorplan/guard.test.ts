import { describe, expect, it } from "vitest";
import { ADMIN_HEADER, checkAdminSecret, createBuildLimiter, guardResponse } from "./guard";

const headers = (secret?: string) => new Headers(secret ? { [ADMIN_HEADER]: secret } : {});

describe("checkAdminSecret", () => {
  it("lets dev and test through without a header", () => {
    expect(checkAdminSecret(headers(), { NODE_ENV: "development" }).ok).toBe(true);
    expect(checkAdminSecret(headers(), { NODE_ENV: "test" }).ok).toBe(true);
  });

  it("refuses production when no secret is configured, even with a header", () => {
    const r = checkAdminSecret(headers("anything"), { NODE_ENV: "production" });
    expect(r).toMatchObject({ ok: false, status: 403, error: "admin_only" });
  });

  it("refuses production with a missing or wrong header", () => {
    const env = { NODE_ENV: "production", FLOORPLAN_ADMIN_SECRET: "s3cret-value" };
    expect(checkAdminSecret(headers(), env).ok).toBe(false);
    expect(checkAdminSecret(headers("s3cret-valuX"), env).ok).toBe(false);
    expect(checkAdminSecret(headers("short"), env).ok).toBe(false);
  });

  it("accepts production with the matching header", () => {
    const env = { NODE_ENV: "production", FLOORPLAN_ADMIN_SECRET: "s3cret-value" };
    expect(checkAdminSecret(headers("s3cret-value"), env).ok).toBe(true);
  });
});

describe("createBuildLimiter", () => {
  it("blocks a second build of the same world while one runs", () => {
    const limiter = createBuildLimiter(60_000, () => 0);
    expect(limiter.acquire("w1").ok).toBe(true);
    expect(limiter.acquire("w1")).toMatchObject({ ok: false, status: 409 });
    expect(limiter.acquire("w2").ok).toBe(true);
  });

  it("enforces the cooldown after a build ends, then allows it again", () => {
    let t = 0;
    const limiter = createBuildLimiter(60_000, () => t);
    expect(limiter.acquire("w1").ok).toBe(true);
    limiter.release("w1");
    t = 10_000;
    expect(limiter.acquire("w1")).toMatchObject({ ok: false, status: 429, retryAfterS: 50 });
    t = 60_000;
    expect(limiter.acquire("w1").ok).toBe(true);
  });

  it("turns a refusal into a JSON response with Retry-After", async () => {
    const res = guardResponse({
      ok: false,
      status: 429,
      error: "too_soon",
      message: "m",
      retryAfterS: 5,
    });
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("5");
    expect(await res.json()).toEqual({ error: "too_soon", message: "m" });
  });
});
