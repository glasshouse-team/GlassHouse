#!/usr/bin/env node
/**
 * /autopilot helper (D-029): the GitHub side of the loop. Uses the `gh` CLI, so it acts as the
 * GitHub account logged in on this computer. Prints JSON for Claude to read.
 *
 *   node .claude/skills/autopilot/autopilot.mjs whoami
 *   ... setup                                   labels + the two pinned issues (idempotent)
 *   ... post --to beka --kind request --ticket GH-9 [--re <id>] --body "..."   (or --body - for stdin)
 *   ... inbox                                   messages for me not answered yet
 *   ... human add --who temuri --ticket GH-9 --task "Record the 20-second clip"
 *   ... human list [--who temuri] [--open]
 *   ... next --statuses '{"GH-9":"In Progress",...}'   (or --statuses @file.json)
 *   ... reviews                                 open PRs waiting for my review
 *   ... mine                                    my open PRs, each with its merge gate
 *   ... gate <pr>                               may I merge this PR now? (exit 0 yes, 3 no)
 *   ... watch [--every 30]                      never exits: one JSON line per new inbox item, review
 *                                               request or main update (run it under the Monitor tool)
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import {
  DEVS,
  KINDS,
  addChecklistItem,
  formatMessage,
  inbox,
  mergeGate,
  nextTickets,
  parseChecklist,
  parseMessage,
  peerOf,
} from "./lib.mjs";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const config = JSON.parse(readFileSync(path.join(HERE, "config.json"), "utf8"));
const ROOT = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();

function fail(message, code = 1) {
  console.error(message);
  process.exit(code);
}

function out(value) {
  console.log(JSON.stringify(value, null, 2));
}

function gh(args, input) {
  return execFileSync("gh", args, {
    encoding: "utf8",
    input,
    stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
    maxBuffer: 64 * 1024 * 1024,
  });
}

function ghJson(args) {
  return JSON.parse(gh(args) || "null");
}

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function whoami() {
  const local = readJson(path.join(ROOT, ".claude", "settings.local.json"));
  const dev = (process.env.GLASSHOUSE_DEV || local?.env?.GLASSHOUSE_DEV || "").trim().toLowerCase();
  if (!DEVS.includes(dev))
    fail(
      'GLASSHOUSE_DEV is not set: add { "env": { "GLASSHOUSE_DEV": "temuri" } } to .claude/settings.local.json',
    );
  const peer = peerOf(dev);
  return { dev, peer, login: config.logins[dev], peerLogin: config.logins[peer] };
}

/** The open issue with this label, or null. */
function findIssue(label) {
  const list = ghJson([
    "issue",
    "list",
    "-R",
    config.repo,
    "--label",
    label,
    "--state",
    "open",
    "--json",
    "number,title,url",
  ]);
  return list?.[0] ?? null;
}

function requireIssue(label) {
  const issue = findIssue(label);
  if (!issue) fail(`No open issue labelled ${label}: run "autopilot.mjs setup" first.`);
  return issue;
}

function setup() {
  const labels = [
    [config.labels.channel, "5319e7", "Autopilot channel between the two Claudes"],
    [config.labels.humans, "d93f0b", "Autopilot: tasks only a person can do"],
    [config.labels.needsHuman, "d93f0b", "Autopilot will not merge this PR: a person must"],
    [config.labels.pr, "0e8a16", "Opened by /autopilot"],
    [config.labels.hold, "fbca04", "Autopilot: do not merge until removed"],
  ];
  for (const [name, color, description] of labels)
    gh([
      "label",
      "create",
      name,
      "-R",
      config.repo,
      "--color",
      color,
      "--description",
      description,
      "--force",
    ]);

  const issues = {};
  const specs = [
    [
      config.labels.channel,
      "🤖 Agent channel",
      "The two Claudes talk here (D-029). Each comment starts with a hidden header; people can write plain comments too, and both Claudes will read them.\n\nKinds: `question`, `request`, `answer`, `done`, `handoff`, `status`, `blocker`.",
    ],
    [
      config.labels.humans,
      "🙋 Needs a human",
      "Tasks only a person can do (photos, footage, phone tests, recordings, credits, approvals). Tick the box when done; the autopilot reads the ticks.\n",
    ],
  ];
  for (const [label, title, body] of specs) {
    let issue = findIssue(label);
    if (!issue) {
      const url = gh([
        "issue",
        "create",
        "-R",
        config.repo,
        "--title",
        title,
        "--label",
        label,
        "--body",
        body,
      ]).trim();
      issue = { number: Number(url.split("/").pop()), title, url };
      try {
        gh(["issue", "pin", String(issue.number), "-R", config.repo]);
      } catch {
        // Pinning is a nicety; a repo can pin only three issues.
      }
    }
    issues[label] = issue;
  }
  out({
    ...whoami(),
    channel: issues[config.labels.channel],
    humans: issues[config.labels.humans],
  });
}

function comments(issueNumber) {
  const pages = ghJson([
    "api",
    "--paginate",
    "--slurp",
    `repos/${config.repo}/issues/${issueNumber}/comments?per_page=100`,
  ]);
  return pages.flat().map((c) => ({
    id: c.id,
    body: c.body ?? "",
    author: c.user?.login ?? "",
    url: c.html_url,
    created: c.created_at,
  }));
}

function readBody(value) {
  if (value === "-") return readFileSync(0, "utf8");
  if (!value) fail("--body is required (text, or - to read stdin)");
  return value;
}

function post(values) {
  const me = whoami();
  const to = values.to;
  if (!to || ![...DEVS, "both"].includes(to)) fail("--to must be temuri, beka or both");
  if (!KINDS.includes(values.kind)) fail(`--kind must be one of: ${KINDS.join(", ")}`);
  const channel = requireIssue(config.labels.channel);
  const body = formatMessage(
    {
      from: me.dev,
      to,
      kind: values.kind,
      ticket: values.ticket ?? null,
      re: values.re ? Number(values.re) : null,
    },
    readBody(values.body),
  );
  const created = ghJson([
    "api",
    `repos/${config.repo}/issues/${channel.number}/comments`,
    "-f",
    `body=${body}`,
  ]);
  out({ id: created.id, url: created.html_url });
}

function showInbox() {
  const me = whoami();
  const channel = requireIssue(config.labels.channel);
  const items = inbox(comments(channel.number), me.dev).map((c) => {
    const meta = parseMessage(c.body);
    return {
      id: c.id,
      from: meta?.from ?? `person:${c.author}`,
      kind: meta?.kind ?? "person",
      ticket: meta?.ticket ?? null,
      re: meta?.re ?? null,
      url: c.url,
      text: c.body.replace(/<!-- autopilot-msg .*? -->\n?/, "").slice(0, 4000),
    };
  });
  out({ dev: me.dev, channel: channel.url, count: items.length, items });
}

function human(sub, values) {
  const issue = requireIssue(config.labels.humans);
  const { body } = ghJson([
    "issue",
    "view",
    String(issue.number),
    "-R",
    config.repo,
    "--json",
    "body",
  ]);
  if (sub === "add") {
    if (!values.who || !DEVS.includes(values.who)) fail("--who must be temuri or beka");
    if (!values.task) fail("--task is required");
    const next = addChecklistItem(body ?? "", {
      who: values.who,
      ticket: values.ticket ?? null,
      task: values.task,
    });
    if (next !== body)
      gh(["issue", "edit", String(issue.number), "-R", config.repo, "--body-file", "-"], next);
    out({ added: next !== body, url: issue.url });
    return;
  }
  if (sub === "list") {
    let items = parseChecklist(body ?? "");
    if (values.who) items = items.filter((i) => i.who === values.who);
    if (values.open) items = items.filter((i) => !i.done);
    out({ url: issue.url, items });
    return;
  }
  fail("human add | human list");
}

function next(values) {
  const me = whoami();
  let raw = values.statuses;
  if (!raw)
    fail('--statuses is required: JSON of Jira statuses, e.g. \'{"GH-9":"Done"}\', or @file.json');
  if (raw.startsWith("@")) raw = readFileSync(raw.slice(1), "utf8");
  const map = readJson(path.join(ROOT, ".claude", "ticket-map.json"));
  out(nextTickets(map, JSON.parse(raw), me.dev));
}

function reviewList() {
  const list = ghJson([
    "pr",
    "list",
    "-R",
    config.repo,
    "--state",
    "open",
    "--search",
    "review-requested:@me",
    "--json",
    "number,title,headRefName,author,url,isDraft",
  ]);
  return list.filter((p) => !p.isDraft);
}

function reviews() {
  out(reviewList());
}

function mainHead() {
  const line = execFileSync("git", ["ls-remote", "origin", "refs/heads/main"], {
    encoding: "utf8",
  });
  return line.split(/\s/)[0] || null;
}

/**
 * Polls the channel, review requests and origin/main, and prints one JSON line per new item.
 * Items already waiting when it starts are printed once, so nothing is missed. Errors print a
 * line too (the watcher keeps going), so a broken watcher is never silent.
 */
async function watch(every) {
  const me = whoami();
  const channel = requireIssue(config.labels.channel);
  const seen = new Set();
  let head = null;
  const emit = (event) => console.log(JSON.stringify({ at: new Date().toISOString(), ...event }));
  for (;;) {
    try {
      for (const c of inbox(comments(channel.number), me.dev)) {
        const key = `msg:${c.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const meta = parseMessage(c.body);
        emit({
          event: "message",
          id: c.id,
          from: meta?.from ?? `person:${c.author}`,
          kind: meta?.kind ?? "person",
          ticket: meta?.ticket ?? null,
          text: c.body
            .replace(/<!-- autopilot-msg .*? -->\n?/, "")
            .replace(/\s+/g, " ")
            .slice(0, 300),
        });
      }
      for (const pr of reviewList()) {
        const key = `review:${pr.number}:${pr.headRefName}`;
        if (seen.has(key)) continue;
        seen.add(key);
        emit({
          event: "review",
          pr: pr.number,
          title: pr.title,
          branch: pr.headRefName,
          author: pr.author.login,
        });
      }
      const now = mainHead();
      if (head && now && now !== head)
        emit({ event: "main-updated", from: head.slice(0, 7), to: now.slice(0, 7) });
      head = now ?? head;
    } catch (error) {
      emit({
        event: "watch-error",
        message: String(error?.stderr ?? error?.message ?? error).slice(0, 300),
      });
    }
    await new Promise((resolve) => setTimeout(resolve, every * 1000));
  }
}

/** Unified diff per file. */
function patchesByFile(diff) {
  const files = {};
  let current = null;
  for (const line of diff.split("\n")) {
    const m = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
    if (m) {
      current = m[2];
      files[current] = "";
    } else if (current) files[current] += `${line}\n`;
  }
  return files;
}

function gateFor(number) {
  const me = whoami();
  const pr = ghJson([
    "pr",
    "view",
    String(number),
    "-R",
    config.repo,
    "--json",
    "number,title,url,author,isDraft,mergeable,labels,statusCheckRollup,reviews,files,headRefName,state",
  ]);
  const files = pr.files.map((f) => f.path);
  const touched = files.filter((f) => config.contractFiles.includes(f));
  const patches = touched.length
    ? patchesByFile(gh(["pr", "diff", String(number), "-R", config.repo]))
    : {};
  const checks = (pr.statusCheckRollup ?? []).map((c) => ({
    name: c.name ?? c.context ?? "",
    status: c.status ?? null,
    conclusion:
      c.conclusion || (c.state === "PENDING" || c.state === "EXPECTED" ? null : (c.state ?? null)),
  }));
  const decision = mergeGate({
    author: pr.author.login,
    peerLogin: pr.author.login === me.login ? me.peerLogin : me.login,
    isDraft: pr.isDraft,
    mergeable: pr.mergeable,
    labels: pr.labels.map((l) => l.name),
    checks,
    reviews: pr.reviews.map((r) => ({ author: r.author?.login ?? "", state: r.state })),
    files,
    contractPatches: patches,
    contractFiles: config.contractFiles,
  });
  if (pr.state !== "OPEN")
    (decision.reasons.unshift(`PR is ${pr.state.toLowerCase()}`), (decision.merge = false));
  if (pr.author.login !== me.login)
    (decision.reasons.push(`not my PR (author ${pr.author.login}): its author merges`),
      (decision.merge = false));
  return { number: pr.number, title: pr.title, url: pr.url, branch: pr.headRefName, ...decision };
}

function mine() {
  const me = whoami();
  const list = ghJson([
    "pr",
    "list",
    "-R",
    config.repo,
    "--state",
    "open",
    "--author",
    me.login,
    "--json",
    "number",
  ]);
  out(list.map((p) => gateFor(p.number)));
}

const [command, sub, ...rest] = process.argv.slice(2);
const positional = sub && !sub.startsWith("--") ? sub : undefined;
const { values } = parseArgs({
  args: positional ? rest : [sub, ...rest].filter((a) => a !== undefined),
  options: {
    to: { type: "string" },
    kind: { type: "string" },
    ticket: { type: "string" },
    re: { type: "string" },
    body: { type: "string" },
    who: { type: "string" },
    task: { type: "string" },
    open: { type: "boolean" },
    statuses: { type: "string" },
    every: { type: "string" },
  },
  allowPositionals: true,
});

try {
  switch (command) {
    case "whoami":
      out(whoami());
      break;
    case "setup":
      setup();
      break;
    case "post":
      post(values);
      break;
    case "inbox":
      showInbox();
      break;
    case "human":
      human(positional, values);
      break;
    case "next":
      next(values);
      break;
    case "reviews":
      reviews();
      break;
    case "mine":
      mine();
      break;
    case "watch":
      await watch(Math.max(10, Number(values.every ?? 30)));
      break;
    case "gate": {
      const result = gateFor(Number(positional));
      out(result);
      process.exit(result.merge ? 0 : 3);
      break;
    }
    default:
      fail(
        "Commands: whoami, setup, post, inbox, human add|list, next, reviews, mine, gate <pr>, watch",
      );
  }
} catch (error) {
  fail(error?.stderr?.toString?.() || (error instanceof Error ? error.message : String(error)));
}
