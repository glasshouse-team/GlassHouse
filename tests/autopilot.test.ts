import { describe, expect, it } from "vitest";
import {
  addChecklistItem,
  exportChanges,
  formatMessage,
  inbox,
  mergeGate,
  nextTickets,
  parseChecklist,
  parseMessage,
  peerOf,
} from "../.claude/skills/autopilot/lib.mjs";

describe("channel messages", () => {
  it("round-trips the header and keeps the text readable", () => {
    const body = formatMessage(
      { from: "temuri", to: "beka", kind: "request", ticket: "GH-9" },
      "Please change sourceLabel.",
    );
    expect(body).toContain("**temuri → beka** · `request` · GH-9");
    expect(body).toContain("Please change sourceLabel.");
    expect(parseMessage(body)).toEqual({
      from: "temuri",
      to: "beka",
      kind: "request",
      ticket: "GH-9",
      re: null,
    });
  });

  it("rejects unknown kinds and developers", () => {
    expect(() => formatMessage({ from: "temuri", to: "beka", kind: "gossip" }, "x")).toThrow();
    expect(() => peerOf("nino")).toThrow();
    expect(peerOf("beka")).toBe("temuri");
  });

  it("ignores comments without a header", () => {
    expect(parseMessage("Just a person talking")).toBeNull();
  });
});

describe("inbox", () => {
  const msg = (id: number, meta: Parameters<typeof formatMessage>[0], author = "bot") => ({
    id,
    author,
    body: formatMessage(meta, `message ${id}`),
  });

  it("shows unanswered requests and questions for me, and hand-written comments", () => {
    const comments = [
      msg(1, { from: "beka", to: "temuri", kind: "question" }),
      msg(2, { from: "beka", to: "temuri", kind: "request" }),
      msg(3, { from: "temuri", to: "beka", kind: "answer", re: 1 }),
      msg(4, { from: "beka", to: "both", kind: "blocker" }),
      msg(5, { from: "temuri", to: "beka", kind: "request" }),
      msg(6, { from: "beka", to: "beka", kind: "status" }),
      { id: 7, author: "TemuriTsutskiridze", body: "Use hero 1 for the demo, not hero 2." },
    ];
    expect(inbox(comments, "temuri").map((c) => c.id)).toEqual([2, 4, 7]);
    // Beka posted #4 and #6 after answer #3, so #3 counts as read; request #5 still waits.
    expect(inbox(comments, "beka").map((c) => c.id)).toEqual([5, 7]);
  });

  it("treats answers, handoffs and status as read once I post after them", () => {
    const comments = [
      msg(1, { from: "beka", to: "temuri", kind: "handoff" }),
      msg(2, { from: "beka", to: "temuri", kind: "request" }),
      msg(3, { from: "temuri", to: "beka", kind: "status" }),
      msg(4, { from: "beka", to: "temuri", kind: "answer" }),
    ];
    expect(inbox(comments, "temuri").map((c) => c.id)).toEqual([2, 4]);
  });

  it("drops a hand-written comment once either Claude answers it", () => {
    const comments = [
      { id: 7, author: "beqa200", body: "Can someone re-run the seed?" },
      msg(8, { from: "temuri", to: "beka", kind: "done", re: 7 }),
    ];
    expect(inbox(comments, "beka").map((c) => c.id)).toEqual([8]);
    expect(inbox(comments, "temuri")).toEqual([]);
  });
});

describe("nextTickets", () => {
  const map = {
    tickets: {
      "GH-1": { title: "Epic", owner: "Temuri", tier: "epic", hours: "0-24", depends: [] },
      "GH-9": { title: "X-ray", owner: "Temuri", tier: "must", hours: "3-5", depends: ["GH-7"] },
      "GH-16": { title: "Q&A", owner: "Temuri", tier: "must", hours: "11-13", depends: ["GH-9"] },
      "GH-18": {
        title: "Floor plan",
        owner: "Temuri",
        tier: "should",
        hours: "13-16",
        depends: [],
      },
      "GH-10": { title: "Pipeline", owner: "Temuri", tier: "must", hours: "5-8", depends: [] },
      "GH-14": { title: "Search", owner: "Beka", tier: "must", hours: "7-9", depends: [] },
    },
  };

  it("puts ready tickets first, then in-progress, then by start hour", () => {
    const list = nextTickets(
      map,
      { "GH-7": "Done", "GH-9": "In Progress", "GH-10": "Done" },
      "temuri",
    );
    expect(list.map((t) => [t.key, t.ready])).toEqual([
      ["GH-9", true],
      ["GH-18", true],
      ["GH-16", false],
    ]);
    expect(list[2].blockers).toEqual(["GH-9"]);
  });
});

describe("mergeGate", () => {
  const base = {
    author: "TemuriTsutskiridze",
    peerLogin: "beqa200",
    isDraft: false,
    mergeable: "MERGEABLE",
    labels: [] as string[],
    checks: [{ name: "check", conclusion: "SUCCESS", status: "COMPLETED" }],
    reviews: [{ author: "beqa200", state: "APPROVED" }],
    files: ["tools/verifier/xray.ts"],
    contractPatches: {} as Record<string, string>,
    contractFiles: ["components/xray/XrayPanel.tsx", "lib/schemas/verifier.ts"],
  };

  it("merges a green, peer-approved PR", () => {
    expect(mergeGate(base)).toEqual({
      merge: true,
      reasons: [],
      needsHuman: false,
      afterMerge: [],
    });
  });

  it("waits for CI and for the peer's latest review", () => {
    const gate = mergeGate({
      ...base,
      checks: [{ name: "check", conclusion: null, status: "IN_PROGRESS" }],
      reviews: [
        { author: "beqa200", state: "APPROVED" },
        { author: "beqa200", state: "CHANGES_REQUESTED" },
      ],
    });
    expect(gate.merge).toBe(false);
    expect(gate.reasons).toEqual([
      "CI still running: check",
      "no approval from the peer (beqa200) yet",
      "changes requested by beqa200",
    ]);
    expect(gate.needsHuman).toBe(false);
  });

  it("merges a new migration and dependencies with approval, then names the follow-up commands", () => {
    const gate = mergeGate({
      ...base,
      files: ["supabase/migrations/0003_x.sql", "package.json", "pnpm-lock.yaml"],
      addedFiles: ["supabase/migrations/0003_x.sql"],
    });
    expect(gate).toEqual({
      merge: true,
      reasons: [],
      needsHuman: false,
      afterMerge: ["pnpm db:push", "pnpm db:types", "pnpm install"],
    });
  });

  it("sends edited migrations and the agents' own rules to a person", () => {
    const gate = mergeGate({
      ...base,
      files: ["supabase/migrations/0001_core.sql", ".claude/settings.json", "CLAUDE.md"],
      addedFiles: [],
    });
    expect(gate.needsHuman).toBe(true);
    expect(gate.reasons).toHaveLength(2);
  });

  it("needs a CONTRACTS.md change-log row for a changed contract export", () => {
    const patch = {
      "components/xray/XrayPanel.tsx":
        "-export function XrayPanel({ listingId }) {\n+export function XrayPanel({ listingId, compact }) {",
    };
    const without = mergeGate({
      ...base,
      files: ["components/xray/XrayPanel.tsx"],
      contractPatches: patch,
    });
    expect(without.merge).toBe(false);
    expect(without.needsHuman).toBe(false);
    const withLog = mergeGate({
      ...base,
      files: ["components/xray/XrayPanel.tsx", "docs/CONTRACTS.md"],
      contractPatches: patch,
    });
    expect(withLog.merge).toBe(true);
  });

  it("lets a slot become async and lets new exports through", () => {
    const gate = mergeGate({
      ...base,
      files: ["components/xray/XrayPanel.tsx"],
      contractPatches: {
        "components/xray/XrayPanel.tsx":
          "-export function XrayPanel({ listingId }) {\n+export async function XrayPanel({ listingId }) {\n+export const MIN = 1;",
      },
    });
    expect(gate).toEqual({ merge: true, reasons: [], needsHuman: false, afterMerge: [] });
  });

  it("finds export lines in a diff", () => {
    expect(
      exportChanges("+++ b/x.ts\n+export const a = 1;\n const b = 2;\n-export type T = string;"),
    ).toEqual(["+export const a = 1;", "-export type T = string;"]);
  });
});

describe("needs-a-human checklist", () => {
  it("adds items once and reads them back", () => {
    let body = "Tick a box when it's done.\n";
    body = addChecklistItem(body, {
      who: "temuri",
      ticket: "GH-9",
      task: "Record the  20-second clip",
    });
    body = addChecklistItem(body, {
      who: "temuri",
      ticket: "GH-9",
      task: "Record the 20-second clip",
    });
    body = body.replace("- [ ]", "- [x]");
    body = addChecklistItem(body, { who: "beka", task: "Upload stock photos" });
    expect(parseChecklist(body)).toEqual([
      { done: true, who: "temuri", ticket: "GH-9", task: "Record the 20-second clip" },
      { done: false, who: "beka", ticket: null, task: "Upload stock photos" },
    ]);
  });
});
