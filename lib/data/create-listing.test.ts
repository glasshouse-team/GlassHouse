import { beforeEach, describe, expect, it, vi } from "vitest";

// A tiny stand-in for the listings table: insert results are queued per test.
const db = vi.hoisted(() => ({
  inserts: [] as Record<string, unknown>[],
  results: [] as { data: unknown; error: { code?: string; message: string } | null }[],
  deleted: [] as string[],
  policyFails: false,
}));
vi.mock("@/lib/supabase", () => ({
  supabaseAdmin: () => ({
    from: () => ({
      insert: (row: Record<string, unknown>) => {
        db.inserts.push(row);
        const result = db.results.shift() ?? { data: null, error: { message: "no result" } };
        return { select: () => ({ single: async () => result }) };
      },
      delete: () => ({
        eq: async (_column: string, id: string) => {
          db.deleted.push(id);
          return { error: null };
        },
      }),
    }),
  }),
}));
vi.mock("./policies", () => ({
  saveHostPolicy: vi.fn(async () => {
    if (db.policyFails) throw new Error("Could not save the host policy: boom");
  }),
}));

import { createHostListing } from "./listings";
import { saveHostPolicy } from "./policies";

const home = {
  title: "Sunny flat",
  description: "",
  city: "Tbilisi",
  neighborhood: null,
  property_type: "apartment" as const,
  max_guests: 3,
  bedrooms: 1,
  beds: 2,
  baths: 1,
  base_price_cents: 8_500,
  cleaning_fee_cents: 2_000,
  amenities: [],
};

beforeEach(() => {
  db.inserts = [];
  db.results = [];
  db.deleted = [];
  db.policyFails = false;
  vi.mocked(saveHostPolicy).mockClear();
});

describe("createHostListing", () => {
  it("publishes the home for this host with the default agent rules", async () => {
    db.results.push({ data: { id: "l1", slug: "sunny-flat-abc123" }, error: null });
    expect(await createHostListing("host-1", home)).toEqual({
      id: "l1",
      slug: "sunny-flat-abc123",
    });
    expect(db.inserts[0]).toMatchObject({
      host_id: "host-1",
      status: "published",
      title: "Sunny flat",
    });
    expect(db.inserts[0].slug).toMatch(/^sunny-flat-[0-9a-f]{6}$/);
    expect(vi.mocked(saveHostPolicy)).toHaveBeenCalledWith("l1", {
      negotiable: true,
      floor_nightly_cents: 8_500,
      max_discount_pct: 10,
      auto_accept_total_cents: null,
      allowed_terms: [],
    });
  });

  it("tries a new slug when one is taken", async () => {
    db.results.push(
      { data: null, error: { code: "23505", message: "duplicate key" } },
      { data: { id: "l2", slug: "sunny-flat-def456" }, error: null },
    );
    expect((await createHostListing("host-1", home)).id).toBe("l2");
    expect(db.inserts).toHaveLength(2);
    expect(db.inserts[0].slug).not.toBe(db.inserts[1].slug);
  });

  it("removes the home again when its agent rules can't be saved", async () => {
    db.results.push({ data: { id: "l3", slug: "sunny-flat-aaa111" }, error: null });
    db.policyFails = true;
    await expect(createHostListing("host-1", home)).rejects.toThrow(/host policy/);
    expect(db.deleted).toEqual(["l3"]);
  });

  it("gives up on other database errors", async () => {
    db.results.push({ data: null, error: { code: "23514", message: "check violated" } });
    await expect(createHostListing("host-1", home)).rejects.toThrow(/check violated/);
    expect(saveHostPolicy).not.toHaveBeenCalled();
  });
});
