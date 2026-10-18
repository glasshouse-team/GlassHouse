import { describe, expect, it } from "vitest";
import { mergeMessages, parseMessages, threadOrder } from "./thread";

const row = (id: string, created_at: string, extra: Record<string, unknown> = {}) => ({
  id,
  conversation_id: "c1",
  actor: "guest",
  body: "Is there a hair dryer?",
  sources: [],
  needs_host: false,
  answered_by: null,
  created_at,
  ...extra,
});

describe("Q&A thread", () => {
  it("parses rows, drops broken ones and tolerates bad sources", () => {
    const parsed = parseMessages([
      row("a", "2026-10-18T10:00:00Z", { sources: "nope" }),
      { id: "b" },
      row("c", "2026-10-18T10:00:01Z", {
        actor: "host_agent",
        sources: [{ type: "rule", key: "pets", quote: "One dog" }],
      }),
    ]);
    expect(parsed.map((m) => m.id)).toEqual(["a", "c"]);
    expect(parsed[0].sources).toEqual([]);
    expect(parsed[1].sources).toHaveLength(1);
  });

  it("merges by id, so an update replaces the row, and sorts oldest first", () => {
    const [a, b] = parseMessages([
      row("a", "2026-10-18T10:00:02Z", { needs_host: true }),
      row("b", "2026-10-18T10:00:01Z"),
    ]);
    const merged = mergeMessages([a], [b, { ...a, needs_host: false }]);
    expect(merged.map((m) => [m.id, m.needs_host])).toEqual([
      ["b", false],
      ["a", false],
    ]);
  });

  it("puts a host reply under the question it answers, even when later questions came first", () => {
    const thread = mergeMessages(
      [],
      parseMessages([
        row("dryer", "2026-10-18T10:00:00Z", { answered_by: "host" }),
        row("note", "2026-10-18T10:00:01Z", { actor: "host_agent", body: "I asked Giorgi." }),
        row("dog", "2026-10-18T10:01:00Z", { body: "Can I bring my dog?" }),
        row("dog-a", "2026-10-18T10:01:01Z", { actor: "host_agent", body: "Yes." }),
        row("crib", "2026-10-18T10:02:00Z", { body: "Is there a crib?", answered_by: "host" }),
        row("crib-r", "2026-10-18T10:03:00Z", { actor: "host", answered_by: "crib" }),
        row("dryer-r", "2026-10-18T10:04:00Z", { actor: "host", answered_by: "dryer" }),
        row("old", "2026-10-18T10:05:00Z", { actor: "host", answered_by: "host" }),
      ]),
    );
    expect(threadOrder(thread).map((m) => m.id)).toEqual([
      "dryer",
      "note",
      "dryer-r",
      "dog",
      "dog-a",
      "crib",
      "old", // an older reply with no question id keeps its time order
      "crib-r",
    ]);
  });
});
