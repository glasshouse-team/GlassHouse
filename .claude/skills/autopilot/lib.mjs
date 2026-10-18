/**
 * Pure logic for /autopilot (D-029): the channel message format, which ticket to take next,
 * and the merge gate. No network or git here; autopilot.mjs does the I/O. Tested in
 * tests/autopilot.test.ts.
 */

export const DEVS = /** @type {const} */ (["temuri", "beka"]);
export const KINDS = /** @type {const} */ ([
  "question",
  "request",
  "answer",
  "done",
  "handoff",
  "status",
  "blocker",
]);

const MARK = "autopilot-msg";

/** The other developer. */
export function peerOf(/** @type {string} */ dev) {
  if (!DEVS.includes(/** @type {any} */ (dev))) throw new Error(`Unknown developer "${dev}"`);
  return dev === "temuri" ? "beka" : "temuri";
}

/**
 * A channel comment: a hidden JSON header (read by the other Claude) plus readable text
 * (read by people on GitHub).
 * @param {{ from: string, to: string, kind: string, ticket?: string | null, re?: number | null }} meta
 * @param {string} text
 */
export function formatMessage(meta, text) {
  if (!KINDS.includes(/** @type {any} */ (meta.kind)))
    throw new Error(`Unknown kind "${meta.kind}"`);
  const header = {
    from: meta.from,
    to: meta.to,
    kind: meta.kind,
    ticket: meta.ticket ?? null,
    re: meta.re ?? null,
  };
  const title = [
    `**${meta.from} → ${meta.to}**`,
    `\`${meta.kind}\``,
    meta.ticket ? meta.ticket : null,
    meta.re ? `(re #${meta.re})` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return `<!-- ${MARK} ${JSON.stringify(header)} -->\n${title}\n\n${text.trim()}`;
}

/**
 * The header of a channel comment, or null for a comment people wrote by hand.
 * @param {string} body
 * @returns {{ from: string, to: string, kind: string, ticket: string | null, re: number | null } | null}
 */
export function parseMessage(body) {
  const match = body.match(new RegExp(`<!-- ${MARK} (\\{.*?\\}) -->`));
  if (!match) return null;
  try {
    const meta = JSON.parse(match[1]);
    if (
      typeof meta.from !== "string" ||
      typeof meta.to !== "string" ||
      typeof meta.kind !== "string"
    )
      return null;
    return {
      from: meta.from,
      to: meta.to,
      kind: meta.kind,
      ticket: meta.ticket ?? null,
      re: meta.re ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Messages for `dev` that `dev` has not answered yet. A message is handled once `dev` posts
 * any message with `re` set to its id. Comments people write by hand (no header) on the
 * channel count as addressed to both Claudes until one of them answers.
 * @param {{ id: number, body: string, author: string }[]} comments
 * @param {string} dev
 */
export function inbox(comments, dev) {
  const parsed = comments.map((c) => ({ ...c, meta: parseMessage(c.body) }));
  const answered = new Set(
    parsed
      .filter((c) => c.meta && c.meta.re != null && DEVS.includes(/** @type {any} */ (c.meta.from)))
      .map((c) => c.meta?.re),
  );
  return parsed.filter((c) => {
    if (answered.has(c.id)) return false;
    if (!c.meta) return true;
    if (c.meta.from === dev) return false;
    if (c.meta.kind === "status" || c.meta.kind === "answer" || c.meta.kind === "done")
      return c.meta.to === dev;
    return c.meta.to === dev || c.meta.to === "both";
  });
}

/** "3-5" → 3, "13" → 13, "after 18" → 18, "spare" → 99. */
export function startHour(/** @type {string} */ hours) {
  const n = String(hours).match(/\d+/);
  return n ? Number(n[0]) : 99;
}

const TIER_ORDER = { must: 0, milestone: 0, demo: 1, should: 2, stretch: 3, nice: 4, epic: 9 };

/**
 * The developer's open tickets in the order to take them: ready ones first (every dependency
 * Done), then by planned start hour, tier and number.
 * @param {{ tickets: Record<string, { title: string, owner: string, tier: string, hours: string, depends: string[] }> }} map
 * @param {Record<string, string>} statuses Jira status per key: "To Do", "In Progress", "Done".
 * @param {string} dev
 */
export function nextTickets(map, statuses, dev) {
  const isDone = (/** @type {string} */ key) => (statuses[key] ?? "").toLowerCase() === "done";
  return Object.entries(map.tickets)
    .filter(([key, t]) => t.owner.toLowerCase() === dev && t.tier !== "epic" && !isDone(key))
    .map(([key, t]) => {
      const blockers = t.depends.filter((d) => !isDone(d));
      return {
        key,
        title: t.title,
        status: statuses[key] ?? "unknown",
        hours: t.hours,
        tier: t.tier,
        ready: blockers.length === 0,
        blockers,
      };
    })
    .sort(
      (a, b) =>
        Number(b.ready) - Number(a.ready) ||
        Number(b.status === "In Progress") - Number(a.status === "In Progress") ||
        startHour(a.hours) - startHour(b.hours) ||
        (TIER_ORDER[/** @type {keyof TIER_ORDER} */ (a.tier)] ?? 5) -
          (TIER_ORDER[/** @type {keyof TIER_ORDER} */ (b.tier)] ?? 5) ||
        Number(a.key.slice(3)) - Number(b.key.slice(3)),
    );
}

/**
 * Lines of a unified diff that add or remove an `export`, i.e. a change to a file's
 * interface rather than its body.
 * @param {string} patch
 */
export function exportChanges(patch) {
  return patch
    .split("\n")
    .filter((l) => /^[+-]\s*export\s/.test(l) && !/^(\+\+\+|---)/.test(l))
    .map((l) => l.trim());
}

/**
 * Exports removed or changed (not just re-added identically or made `async`). Contracts allow
 * additive changes (docs/WORKFLOW.md rule 2), so new exports alone pass.
 */
export function brokenExports(/** @type {string[]} */ lines) {
  const norm = (/** @type {string} */ l) =>
    l
      .slice(1)
      .replace(/\basync\s+/g, "")
      .replace(/\s+/g, " ")
      .trim();
  const added = new Set(lines.filter((l) => l.startsWith("+")).map(norm));
  return lines
    .filter((l) => l.startsWith("-"))
    .map(norm)
    .filter((l) => !added.has(l));
}

/**
 * May the author's Claude merge this PR without a person? (D-029)
 * @param {{
 *   author: string,
 *   peerLogin: string,
 *   isDraft: boolean,
 *   mergeable: string,
 *   labels: string[],
 *   checks: { name: string, conclusion: string | null, status?: string }[],
 *   reviews: { author: string, state: string }[],
 *   files: string[],
 *   contractPatches: Record<string, string>,
 *   contractFiles: string[],
 *   addedFiles?: string[],
 * }} pr
 * @returns {{ merge: boolean, reasons: string[], needsHuman: boolean }}
 */
export function mergeGate(pr) {
  const reasons = [];
  let needsHuman = false;
  if (pr.isDraft) reasons.push("draft");
  if (pr.mergeable === "CONFLICTING")
    reasons.push("merge conflict with main: merge origin/main and push");
  if (pr.labels.includes("needs-human")) {
    reasons.push("labelled needs-human");
    needsHuman = true;
  }
  if (pr.labels.includes("autopilot-hold")) reasons.push("labelled autopilot-hold");

  const named = pr.checks.filter((c) => c.name);
  const failed = named.filter((c) =>
    ["FAILURE", "CANCELLED", "TIMED_OUT", "ACTION_REQUIRED"].includes(c.conclusion ?? ""),
  );
  const pending = named.filter(
    (c) => !c.conclusion || c.status === "IN_PROGRESS" || c.status === "QUEUED",
  );
  if (!named.some((c) => c.name === "check")) reasons.push("CI `check` has not run yet");
  if (failed.length) reasons.push(`CI failed: ${failed.map((c) => c.name).join(", ")}`);
  else if (pending.length)
    reasons.push(`CI still running: ${pending.map((c) => c.name).join(", ")}`);

  // The latest review per reviewer counts.
  const latest = new Map();
  for (const r of pr.reviews)
    if (r.state !== "COMMENTED" && r.state !== "PENDING") latest.set(r.author, r.state);
  if (latest.get(pr.peerLogin) !== "APPROVED")
    reasons.push(`no approval from the peer (${pr.peerLogin}) yet`);
  for (const [who, state] of latest)
    if (state === "CHANGES_REQUESTED") reasons.push(`changes requested by ${who}`);

  /** Commands the author's Claude runs right after merging. */
  const afterMerge = [];
  const migrations = pr.files.filter((f) => f.startsWith("supabase/migrations/"));
  const added = pr.addedFiles ?? [];
  const edited = migrations.filter((f) => !added.includes(f));
  if (edited.length) {
    reasons.push(`edits an existing migration (${edited.join(", ")}): add a new 000N file instead`);
    needsHuman = true;
  }
  if (migrations.length) afterMerge.push("pnpm db:push", "pnpm db:types");
  if (pr.files.some((f) => f === "pnpm-lock.yaml" || f === "package.json"))
    afterMerge.push("pnpm install");

  const rules = pr.files.filter((f) => AGENT_RULES.some((p) => f === p || f.startsWith(p)));
  if (rules.length) {
    reasons.push(`changes the agents' own rules (${rules.join(", ")}): a person merges it`);
    needsHuman = true;
  }
  const brokenContracts = pr.files
    .filter((f) => pr.contractFiles.includes(f))
    .filter((f) => brokenExports(exportChanges(pr.contractPatches[f] ?? "")).length > 0);
  if (brokenContracts.length && !pr.files.includes("docs/CONTRACTS.md"))
    reasons.push(
      `changes contract exports (${brokenContracts.join(", ")}) without a docs/CONTRACTS.md change-log row`,
    );
  return { merge: reasons.length === 0, reasons, needsHuman, afterMerge };
}

/**
 * Files that set what the agents themselves may do. A Claude cannot widen its own permissions,
 * so a person merges these. Other team-wide files (package.json, lockfile, next.config.ts,
 * tsconfig.json) merge with the peer's approval.
 */
export const AGENT_RULES = [
  "CLAUDE.md",
  "AGENTS.md",
  ".claude/ownership.json",
  ".claude/settings.json",
  ".claude/hooks/",
  ".claude/skills/autopilot/",
  ".mcp.json",
  ".github/workflows/",
];

/**
 * The "Needs a human" checklist lives in one issue body: `- [ ] @temuri GH-9: record the clip`.
 * @param {string} body
 */
export function parseChecklist(body) {
  return body
    .split("\n")
    .map((line) => line.match(/^- \[( |x|X)\] @(\w+)(?: (GH-\d+))?: (.*)$/))
    .filter(Boolean)
    .map((m) => ({
      done: m?.[1] !== " ",
      who: m?.[2] ?? "",
      ticket: m?.[3] ?? null,
      task: (m?.[4] ?? "").trim(),
    }));
}

/** Adds one item unless the same open item is already there. */
export function addChecklistItem(
  /** @type {string} */ body,
  /** @type {{ who: string, ticket?: string | null, task: string }} */ item,
) {
  const task = item.task.replace(/\s+/g, " ").trim();
  if (parseChecklist(body).some((i) => !i.done && i.who === item.who && i.task === task))
    return body;
  const line = `- [ ] @${item.who}${item.ticket ? ` ${item.ticket}` : ""}: ${task}`;
  return `${body.trimEnd()}\n${line}\n`;
}
