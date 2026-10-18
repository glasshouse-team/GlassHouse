import { connection } from "next/server";
import { cn } from "@/lib/utils";
import { runDemoChecks } from "./checks";
import { type CheckResult, type CheckState, overallState } from "./status";

export const metadata = { title: "Demo pre-flight · Glasshouse", robots: { index: false } };

const STATE_STYLE: Record<CheckState, { dot: string; text: string; word: string }> = {
  ok: { dot: "bg-emerald-500", text: "text-emerald-700 dark:text-emerald-400", word: "OK" },
  warn: { dot: "bg-amber-500", text: "text-amber-700 dark:text-amber-400", word: "Check" },
  fail: { dot: "bg-red-500", text: "text-red-700 dark:text-red-400", word: "Fix" },
};

const HEADLINE: Record<CheckState, string> = {
  ok: "All green. Ready to demo.",
  warn: "Mostly ready: read the amber rows.",
  fail: "Not ready: fix the red rows, then reload.",
};

function Row({ result }: { result: CheckResult }) {
  const style = STATE_STYLE[result.state];
  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <span aria-hidden className={cn("mt-1.5 size-2.5 shrink-0 rounded-full", style.dot)} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <span className="min-w-0 font-medium wrap-anywhere">{result.label}</span>
          <span className={cn("shrink-0 text-xs font-semibold uppercase", style.text)}>
            {style.word}
          </span>
        </div>
        <p className="text-sm wrap-anywhere text-muted-foreground">{result.detail}</p>
      </div>
    </li>
  );
}

// Demo pre-flight (GH-26, Beka): green or red for env vars, Supabase, hero 2's spot worlds,
// X-ray rows, leftover demo state and a Claude ping. Renders per request; reload to re-run.
export default async function DemoCheckPage() {
  await connection();
  const { results, elapsedMs } = await runDemoChecks();
  const overall = overallState(results);
  const groups = [...new Set(results.map((r) => r.group))];

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Demo pre-flight</h1>
        <p className={cn("flex items-center gap-2 font-medium", STATE_STYLE[overall].text)}>
          <span aria-hidden className={cn("size-3 rounded-full", STATE_STYLE[overall].dot)} />
          {HEADLINE[overall]}
        </p>
        <p className="text-sm text-muted-foreground">
          {results.filter((r) => r.state === "ok").length} of {results.length} checks green in{" "}
          {(elapsedMs / 1000).toFixed(1)} s. Reset first with <code>pnpm demo:reset</code>; the QA
          checklist is in <code>docs/QA.md</code>.
        </p>
      </header>
      {groups.map((group) => (
        <section key={group} className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {group}
          </h2>
          <ul className="divide-y divide-border rounded-xl border border-border bg-card">
            {results
              .filter((r) => r.group === group)
              .map((r) => (
                <Row key={r.label} result={r} />
              ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
