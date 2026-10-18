/**
 * The demo pre-flight checks (GH-26). Server only: uses the service role and the Claude key.
 * Every check runs in parallel with a 5 s limit and reports names and counts, never values.
 */
import { generateText } from "ai";
import { bulkModel } from "@/lib/claude";
import { getAvailability } from "@/lib/data/listings";
import { hasEnv, isDemoMode, settings, type EnvKey } from "@/lib/env";
import { stayNights } from "@/lib/pricing";
import { supabaseAdmin } from "@/lib/supabase";
import {
  DEMO_DEAL,
  HERO_1_POLICY,
  HERO_LISTINGS,
  LIE_LISTING_SLUGS,
  SEED_COMPLETED_ACTION,
} from "@/seed/fixtures";
import { type CheckResult, policyDiff, runCheck } from "./status";

type Outcome = Omit<CheckResult, "group" | "label">;
const ok = (detail: string): Outcome => ({ state: "ok", detail });
const warn = (detail: string): Outcome => ({ state: "warn", detail });
const fail = (detail: string): Outcome => ({ state: "fail", detail });

const REQUIRED_ENV: EnvKey[] = [
  "ANTHROPIC_API_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
];
const LIVE_DEAL_STATUSES = ["open", "agreed_pending_host", "escalated"];

function envChecks(): CheckResult[] {
  const rows: CheckResult[] = REQUIRED_ENV.map((key) => ({
    group: "Environment",
    label: key,
    ...(hasEnv(key) ? ok("set") : fail("missing: add it to .env.local and Vercel")),
  }));
  rows.push({
    group: "Environment",
    label: "WORLDLABS_API_KEY",
    ...(hasEnv("WORLDLABS_API_KEY")
      ? ok("set (unused in demo mode)")
      : warn("missing: only new 3D generations need it")),
  });
  rows.push({
    group: "Environment",
    label: "DEMO_MODE",
    ...(isDemoMode()
      ? ok("true: no World Labs calls, 1.5 s between negotiation turns")
      : warn("not true: set DEMO_MODE=true on the demo deployment and redeploy")),
  });
  return rows;
}

async function head(url: string, signal: AbortSignal): Promise<number> {
  const res = await fetch(url, { method: "HEAD", cache: "no-store", signal });
  return res.status;
}

async function supabaseCheck(): Promise<Outcome> {
  const { count, error } = await supabaseAdmin()
    .from("listings")
    .select("id", { count: "exact", head: true });
  if (error) return fail(error.message);
  if (!count) return fail("connected, but no listings: run pnpm seed");
  return ok(`connected, ${count} listings`);
}

async function seedWatermarkCheck(): Promise<Outcome> {
  const { data, error } = await supabaseAdmin()
    .from("events")
    .select("id")
    .eq("action", SEED_COMPLETED_ACTION)
    .order("id", { ascending: false })
    .limit(1);
  if (error) return fail(error.message);
  if (!data?.length) return fail("no seed.completed event: run pnpm seed, then pnpm demo:reset");
  return ok(`latest seed.completed is event ${data[0]!.id}`);
}

async function leftoverDealsCheck(): Promise<Outcome> {
  const db = supabaseAdmin();
  const [live, reservations] = await Promise.all([
    db.from("deals").select("id", { count: "exact", head: true }).in("status", LIVE_DEAL_STATUSES),
    db.from("reservations").select("id", { count: "exact", head: true }),
  ]);
  if (live.error) return fail(live.error.message);
  if (reservations.error) return fail(reservations.error.message);
  if (live.count) return fail(`${live.count} open deals left over: run pnpm demo:reset`);
  if (reservations.count)
    return warn(`${reservations.count} reservations left over: run pnpm demo:reset`);
  return ok("no open deals or reservations");
}

async function heroDatesCheck(): Promise<Outcome> {
  const { blockedDates } = await getAvailability(HERO_LISTINGS.hero1.id, DEMO_DEAL.checkIn);
  const taken = stayNights(DEMO_DEAL.checkIn, DEMO_DEAL.checkOut).filter((n) =>
    blockedDates.includes(n),
  );
  if (taken.length) return fail(`blocked or booked on ${taken.join(", ")}: run pnpm demo:reset`);
  return ok(`free ${DEMO_DEAL.checkIn} to ${DEMO_DEAL.checkOut}`);
}

async function heroPolicyCheck(): Promise<Outcome> {
  const { data, error } = await supabaseAdmin()
    .from("host_policies")
    .select("*")
    .eq("listing_id", HERO_LISTINGS.hero1.id)
    .maybeSingle();
  if (error) return fail(error.message);
  const diff = policyDiff(data, HERO_1_POLICY);
  if (diff.length)
    return fail(`differs from the fixture (${diff.join(", ")}): run pnpm demo:reset`);
  return ok("matches HERO_1_POLICY");
}

/** Hero 2's published version: every spot's splat and collider answer HEAD 200. */
async function heroWorldsCheck(signal: AbortSignal): Promise<Outcome> {
  const db = supabaseAdmin();
  const { data: listing, error } = await db
    .from("listings")
    .select("published_world_id")
    .eq("id", HERO_LISTINGS.hero2.id)
    .maybeSingle();
  if (error) return fail(error.message);
  if (!listing) return fail("hero-2 is missing: run pnpm seed");
  if (!listing.published_world_id)
    return fail("no published world yet (GH-6 import, then pnpm demo:reset publishes v1)");
  const entry = await db
    .from("worlds")
    .select("version")
    .eq("id", listing.published_world_id)
    .single();
  if (entry.error) return fail(entry.error.message);
  const spots = await db
    .from("worlds")
    .select("spot, status, spz_url, collider_mesh_url")
    .eq("listing_id", HERO_LISTINGS.hero2.id)
    .eq("version", entry.data.version);
  if (spots.error) return fail(spots.error.message);
  const urls = (spots.data ?? []).flatMap((w) => [
    { spot: w.spot, kind: "splat", url: w.spz_url },
    { spot: w.spot, kind: "collider", url: w.collider_mesh_url },
  ]);
  const broken: string[] = [];
  await Promise.all(
    urls.map(async ({ spot, kind, url }) => {
      if (!url) return void broken.push(`${spot} ${kind} missing`);
      if (url.includes("worldlabs.ai"))
        return void broken.push(`${spot} ${kind} not in our storage`);
      const status = await head(url, signal).catch(() => 0);
      if (status !== 200) broken.push(`${spot} ${kind} HTTP ${status || "error"}`);
    }),
  );
  const unpublished = (spots.data ?? []).filter((w) => w.status !== "published").length;
  const count = spots.data?.length ?? 0;
  if (broken.length) return fail(broken.join("; "));
  if (entry.data.version !== 1)
    return warn(`v${entry.data.version} is published; the demo starts on v1: run pnpm demo:reset`);
  if (unpublished) return warn(`${unpublished} of ${count} spots are not marked published`);
  return ok(`v1, ${count} spots, ${urls.length} assets answer 200`);
}

async function xrayRowsCheck(): Promise<Outcome> {
  const db = supabaseAdmin();
  const [listings, facts] = await Promise.all([
    db.from("listings").select("id, slug").eq("status", "published"),
    db.from("listing_facts").select("listing_id, model"),
  ]);
  if (listings.error) return fail(listings.error.message);
  if (facts.error) return fail(facts.error.message);
  const withRow = new Set((facts.data ?? []).map((f) => f.listing_id));
  const missing = (listings.data ?? []).filter((l) => !withRow.has(l.id)).map((l) => l.slug);
  if (missing.length) return fail(`no X-ray row for ${missing.join(", ")}: run pnpm xray`);
  const slugOf = new Map((listings.data ?? []).map((l) => [l.id, l.slug]));
  const seedOnly = (facts.data ?? [])
    .filter((f) => f.model === "seed")
    .map((f) => slugOf.get(f.listing_id) ?? f.listing_id);
  const total = listings.data?.length ?? 0;
  return seedOnly.length
    ? warn(`${total} listings have a row; still the seed's placeholder: ${seedOnly.join(", ")}`)
    : ok(`${total} published listings have a row`);
}

async function liesCheck(): Promise<Outcome> {
  const slugs = Object.values(LIE_LISTING_SLUGS);
  const { data, error } = await supabaseAdmin()
    .from("listings")
    .select("slug, listing_facts(contradictions)")
    .in("slug", slugs);
  if (error) return fail(error.message);
  const caught = (data ?? []).filter((l) => {
    const facts = Array.isArray(l.listing_facts) ? l.listing_facts[0] : l.listing_facts;
    return Array.isArray(facts?.contradictions) && facts.contradictions.length > 0;
  });
  const missed = slugs.filter((s) => !caught.some((c) => c.slug === s));
  if (missed.length) return fail(`no contradiction on ${missed.join(", ")}: run pnpm xray`);
  return ok("both lie listings have contradictions");
}

async function claudePing(signal: AbortSignal): Promise<Outcome> {
  if (!hasEnv("ANTHROPIC_API_KEY")) return fail("ANTHROPIC_API_KEY is missing");
  const started = Date.now();
  const { text } = await generateText({
    model: bulkModel(),
    prompt: "Reply ok",
    maxRetries: 0,
    maxOutputTokens: 16,
    providerOptions: { anthropic: { effort: "low", thinking: { type: "disabled" } } },
    abortSignal: signal,
  });
  const ms = Date.now() - started;
  if (!text.trim()) return warn(`${settings.bulkModel} answered empty in ${ms} ms`);
  return ok(`${settings.bulkModel} answered in ${ms} ms`);
}

/** Runs every check; the results keep the order shown on the page. */
export async function runDemoChecks(): Promise<{ results: CheckResult[]; elapsedMs: number }> {
  const started = Date.now();
  const live = await Promise.all([
    runCheck("Database", "Supabase connection", supabaseCheck),
    runCheck("Database", "Seed watermark", seedWatermarkCheck),
    runCheck("Demo state", "No leftover deals", leftoverDealsCheck),
    runCheck("Demo state", "Hero 1 free on the demo dates", heroDatesCheck),
    runCheck("Demo state", "Hero 1 host policy", heroPolicyCheck),
    runCheck("3D", "Hero 2 spot worlds load", heroWorldsCheck),
    runCheck("X-ray", "X-ray rows for every listing", xrayRowsCheck),
    runCheck("X-ray", "Both lies caught", liesCheck),
    runCheck("Claude", "Claude API ping", claudePing),
  ]);
  return { results: [...envChecks(), ...live], elapsedMs: Date.now() - started };
}
