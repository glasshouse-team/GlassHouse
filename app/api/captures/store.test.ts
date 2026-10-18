import { beforeEach, describe, expect, it, vi } from "vitest";

// A fake Supabase query builder that records the calls and returns `state.rows`.
const state = vi.hoisted(() => ({
  calls: [] as Array<[string, ...unknown[]]>,
  rows: [] as Array<{ id: string }>,
}));
vi.mock("@/lib/supabase", () => {
  const builder = {
    update: (...a: unknown[]) => (state.calls.push(["update", ...a]), builder),
    eq: (...a: unknown[]) => (state.calls.push(["eq", ...a]), builder),
    select: async (...a: unknown[]) => {
      state.calls.push(["select", ...a]);
      return { data: state.rows, error: null };
    },
  };
  return {
    BUCKETS: { captures: "captures" },
    createSignedUpload: vi.fn(),
    supabaseAdmin: () => ({ from: () => builder }),
  };
});

import { setCaptureStatus } from "./store";

const ID = "33333333-3333-4333-8333-333333333333";

beforeEach(() => {
  state.calls = [];
  state.rows = [];
});

describe("setCaptureStatus", () => {
  it("updates only while the row still has the expected status", async () => {
    state.rows = [{ id: ID }];
    expect(await setCaptureStatus(ID, "uploaded", "uploading")).toBe(true);
    expect(state.calls).toEqual([
      ["update", { status: "uploaded" }],
      ["eq", "id", ID],
      ["eq", "status", "uploading"],
      ["select", "id"],
    ]);
  });

  it("reports false when another request already changed the row", async () => {
    expect(await setCaptureStatus(ID, "failed", "uploading")).toBe(false);
  });
});
