import { describe, expect, it } from "vitest";
import { mergeMessages, parseMessages } from "./thread";

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
});
