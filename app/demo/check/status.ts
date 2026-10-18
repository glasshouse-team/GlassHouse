/** Pure helpers for the demo pre-flight page (GH-26). Tested in status.test.ts. */

export type CheckState = "ok" | "warn" | "fail";

export interface CheckResult {
  group: string;
  label: string;
  state: CheckState;
  /** One plain line: what was found, or what to do. Never a secret value. */
  detail: string;
}

export const CHECK_TIMEOUT_MS = 5_000;

/**
 * Runs one check with a time limit. A throw or a timeout becomes a red row, so one slow
 * service never blanks the page.
 */
export async function runCheck(
  group: string,
  label: string,
  fn: (signal: AbortSignal) => Promise<Omit<CheckResult, "group" | "label">>,
  timeoutMs = CHECK_TIMEOUT_MS,
): Promise<CheckResult> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`timed out after ${Math.round(timeoutMs / 1000)} s`));
    }, timeoutMs);
  });
  try {
    const result = await Promise.race([fn(controller.signal), timeout]);
    return { group, label, ...result };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { group, label, state: "fail", detail: message.slice(0, 200) };
  } finally {
    clearTimeout(timer);
  }
}

/** The page's headline: red if anything is red, amber if anything is amber. */
export function overallState(results: CheckResult[]): CheckState {
  if (results.some((r) => r.state === "fail")) return "fail";
  if (results.some((r) => r.state === "warn")) return "warn";
  return "ok";
}

/** Names of the policy fields that differ from the fixture (values are never shown). */
export function policyDiff(
  row: Record<string, unknown> | null,
  fixture: Record<string, unknown>,
): string[] {
  if (!row) return ["(no policy row)"];
  return Object.keys(fixture).filter(
    (key) => JSON.stringify(row[key] ?? null) !== JSON.stringify(fixture[key]),
  );
}
