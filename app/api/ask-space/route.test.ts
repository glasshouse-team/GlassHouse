import { MockLanguageModelV4, convertArrayToReadableStream, mockValues } from "ai/test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Space } from "@/tools/guest/space";

const { model, lookup } = vi.hoisted(() => ({
  model: { current: undefined as unknown },
  lookup: { current: undefined as unknown },
}));
vi.mock("@/lib/claude", () => ({
  agentModel: () => model.current,
  bulkModel: () => model.current,
}));
vi.mock("@/lib/events", () => ({ logEvent: vi.fn(async () => {}) }));
vi.mock("@/lib/viewer", () => ({
  getViewer: async () => ({ role: "guest", profileId: "p1", name: "Nino" }),
}));
vi.mock("@/lib/data/space", () => ({ loadSpace: vi.fn(async () => lookup.current) }));

import { loadSpace } from "@/lib/data/space";
import { logEvent } from "@/lib/events";
import { NOT_READY_MESSAGE } from "./chat";
import { POST } from "./route";

const LISTING = "00000000-0000-4000-8000-0000000000b2";
const KITCHEN = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const COOKTOP = "33333333-3333-4333-8333-333333333333";

const space: Space = {
  listingId: LISTING,
  listingTitle: "Tbilisi flat",
  version: 1,
  currentWorldId: null,
  spots: [{ worldId: KITCHEN, spot: "kitchen", label: "Kitchen" }],
  anchors: [
    {
      id: COOKTOP,
      world_id: KITCHEN,
      name: "cooktop",
      kind: "object",
      room: "Kitchen",
      position: { x: 0, y: 1.6, z: 0 },
      look_at: { x: 1, y: 0.9, z: 0 },
      source: "manual",
    },
  ],
  gaps: [
    {
      id: "99999999-9999-4999-8999-999999999999",
      world_id: KITCHEN,
      room: "Kitchen",
      issue: "blank",
      description: "The corner right of the cooktop is blank.",
      severity: 2,
      position: { x: 2, y: 0.9, z: 0 },
      view_dir: null,
      radius_m: 0.8,
      screenshot_url: null,
      status: "open",
      filled_by_capture: null,
    },
  ],
  facts: [{ key: "kitchen_equipment", value: "gas hob, fridge", confidence: 0.9 }],
};

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};

function step(parts: unknown[], finish: "tool-calls" | "stop") {
  return {
    stream: convertArrayToReadableStream([
      { type: "stream-start", warnings: [] },
      ...parts,
      { type: "finish", finishReason: { unified: finish, raw: undefined }, usage },
    ]),
  };
}

/** Step 1 calls fly_to with `anchorId`, step 2 answers. */
function scriptedModel(anchorId: string) {
  const next = mockValues(
    step(
      [
        {
          type: "tool-call",
          toolCallId: "c1",
          toolName: "fly_to",
          input: JSON.stringify({ anchorId }),
        },
      ],
      "tool-calls",
    ),
    step(
      [
        { type: "text-start", id: "t1" },
        { type: "text-delta", id: "t1", delta: "Here is the cooktop." },
        { type: "text-end", id: "t1" },
      ],
      "stop",
    ),
  );
  const mock = new MockLanguageModelV4({ doStream: async () => next() as never });
  model.current = mock;
  return mock;
}

function ask(text: string, extra: Record<string, unknown> = {}) {
  return POST(
    new Request("http://localhost/api/ask-space", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        listingId: LISTING,
        worldId: KITCHEN,
        messages: [{ id: "u1", role: "user", parts: [{ type: "text", text }] }],
        ...extra,
      }),
    }),
  );
}

/** The UI stream's JSON chunks. */
async function chunks(response: Response): Promise<Record<string, unknown>[]> {
  const body = await response.text();
  return body
    .split("\n")
    .filter((line) => line.startsWith("data: ") && !line.includes("[DONE]"))
    .map((line) => JSON.parse(line.slice(6)));
}

beforeEach(() => {
  vi.clearAllMocks();
  lookup.current = { status: "ready", space };
});

describe("POST /api/ask-space", () => {
  it("rejects a bad body and a missing question", async () => {
    const bad = await POST(
      new Request("http://localhost/api/ask-space", { method: "POST", body: "{}" }),
    );
    expect(bad.status).toBe(400);
    expect((await ask("   ")).status).toBe(400);
  });

  it("answers with 404 for an unknown home", async () => {
    lookup.current = { status: "no_listing" };
    expect((await ask("Where would I work?")).status).toBe(404);
  });

  it("says the 3D isn't ready without calling a model", async () => {
    lookup.current = { status: "no_3d", listingId: LISTING, listingTitle: "Tbilisi flat" };
    const mock = scriptedModel(COOKTOP);
    const response = await ask("Where would I work?");
    expect(response.status).toBe(200);
    const text = (await chunks(response))
      .filter((c) => c.type === "text-delta")
      .map((c) => c.delta)
      .join("");
    expect(text).toBe(NOT_READY_MESSAGE);
    expect(mock.doStreamCalls).toHaveLength(0);
  });

  it("flies to the anchor, adds the honesty note and logs to the feed", async () => {
    const mock = scriptedModel(COOKTOP);
    const response = await ask("What's in the kitchen corner?");
    const all = await chunks(response);

    expect(vi.mocked(loadSpace)).toHaveBeenCalledWith(
      expect.objectContaining({ listingId: LISTING, worldId: KITCHEN }),
    );
    const output = all.find((c) => c.type === "tool-output-available");
    expect(output?.output).toMatchObject({
      ok: true,
      action: { type: "fly_to", anchorId: COOKTOP },
      honestyNote: "That area is partly AI-filled; the host hasn't filmed it yet.",
    });
    expect(all.some((c) => c.type === "text-delta" && c.delta === "Here is the cooktop.")).toBe(
      true,
    );

    // The question reaches the model as data, after the home's anchors.
    const prompt = JSON.stringify(mock.doStreamCalls[0].prompt);
    expect(prompt).toContain('data name=\\"guest_question\\"');
    expect(prompt).toContain(COOKTOP);
    expect(prompt).not.toContain('\\"position\\"');

    const actions = vi.mocked(logEvent).mock.calls.map((c) => c[0]);
    expect(actions).toContainEqual(
      expect.objectContaining({ action: "space.asked", actor_type: "human", listing_id: LISTING }),
    );
    expect(actions).toContainEqual(
      expect.objectContaining({
        action: "tool.fly_to",
        summary: "Guest agent showed Nino the cooktop",
        payload: expect.objectContaining({ input: { anchorId: COOKTOP } }),
      }),
    );
    // The guest's question never lands in the public feed.
    expect(JSON.stringify(actions)).not.toContain("kitchen corner");
  });

  it("refuses an anchor the home doesn't have", async () => {
    scriptedModel("55555555-5555-4555-8555-555555555555");
    const output = (await chunks(await ask("Show me the balcony"))).find(
      (c) => c.type === "tool-output-available",
    );
    expect(output?.output).toMatchObject({ ok: false });
    expect(output?.output).not.toHaveProperty("action");
  });
});
