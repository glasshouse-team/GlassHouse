import { describe, expect, it } from "vitest";
import {
  buildResetPlan,
  DEMO_TABLES,
  describePlan,
  eventWatermark,
  pickEntrySpot,
  planWorldPublish,
  type ResetWorld,
} from "./reset-plan";

const world = (over: Partial<ResetWorld> & Pick<ResetWorld, "id">): ResetWorld => ({
  version: 1,
  spot: "main",
  status: "ready",
  spz_url: `https://cdn.example/${over.id}.spz`,
  collider_mesh_url: `https://cdn.example/${over.id}.glb`,
  created_at: "2026-10-18T10:00:00Z",
  ...over,
});

const counts = { reservations: 3, deals: 2, conversations: 1, trip_briefs: 4 };

describe("eventWatermark", () => {
  it("is the latest seed.completed id", () => {
    expect(eventWatermark([10, 67, 56])).toBe(67);
  });
  it("is null without a seed event, so no events are deleted", () => {
    expect(eventWatermark([])).toBeNull();
    const plan = buildResetPlan({
      counts,
      eventWatermark: null,
      eventsAboveWatermark: 40,
      worlds: [],
      gaps: [],
      version: 1,
    });
    expect(plan.eventsToDelete).toBe(0);
  });
});

describe("pickEntrySpot", () => {
  it("prefers an entrance-like spot", () => {
    const worlds = [
      world({ id: "k", spot: "kitchen", created_at: "2026-10-18T09:00:00Z" }),
      world({ id: "h", spot: "Hall", created_at: "2026-10-18T11:00:00Z" }),
    ];
    expect(pickEntrySpot(worlds).id).toBe("h");
  });
  it("otherwise takes the first spot generated", () => {
    const worlds = [
      world({ id: "l", spot: "living", created_at: "2026-10-18T11:00:00Z" }),
      world({ id: "k", spot: "kitchen", created_at: "2026-10-18T09:00:00Z" }),
    ];
    expect(pickEntrySpot(worlds).id).toBe("k");
  });
});

describe("planWorldPublish", () => {
  it("skips with a reason when hero 2 has no worlds yet", () => {
    expect(planWorldPublish([], [], 1)).toEqual({ kind: "skip", reason: "no worlds exist yet" });
  });

  it("skips when v1 has no showable spot", () => {
    const step = planWorldPublish(
      [
        world({ id: "a", status: "generating" }),
        world({ id: "b", spz_url: null }),
        world({ id: "c", collider_mesh_url: null }),
      ],
      [],
      1,
    );
    expect(step.kind).toBe("skip");
  });

  it("publishes v1's spots, demotes published v2 and reopens v1's handled gaps", () => {
    const worlds = [
      world({ id: "v1-entrance", spot: "entrance" }),
      world({ id: "v1-kitchen", spot: "kitchen" }),
      world({ id: "v1-failed", spot: "bath", status: "failed" }),
      world({ id: "v2-entrance", version: 2, spot: "entrance", status: "published" }),
      world({ id: "v2-kitchen", version: 2, spot: "kitchen", status: "published" }),
    ];
    const gaps = [
      { id: "g1", world_id: "v1-kitchen", status: "requested" },
      { id: "g2", world_id: "v1-kitchen", status: "filled" },
      { id: "g3", world_id: "v1-kitchen", status: "dismissed" },
      { id: "g4", world_id: "v2-kitchen", status: "filled" },
    ];
    const step = planWorldPublish(worlds, gaps, 1);
    expect(step).toEqual({
      kind: "publish",
      plan: {
        version: 1,
        entryWorldId: "v1-entrance",
        entrySpot: "entrance",
        publishIds: ["v1-entrance", "v1-kitchen"],
        unpublishIds: ["v2-entrance", "v2-kitchen"],
        reopenGapIds: ["g1", "g2"],
      },
    });
  });
});

describe("buildResetPlan and describePlan", () => {
  it("deletes every row of each demo table and events above the watermark", () => {
    const plan = buildResetPlan({
      counts,
      eventWatermark: 67,
      eventsAboveWatermark: 11,
      worlds: [],
      gaps: [],
      version: 1,
    });
    expect(plan.deletions).toEqual(counts);
    expect(plan.eventsToDelete).toBe(11);
    const lines = describePlan(plan, "hero-2");
    expect(lines).toHaveLength(DEMO_TABLES.length + 4);
    expect(lines).toContain("delete 11 events with id > 67 (the latest seed.completed)");
    expect(lines.at(-1)).toBe("skip publishing hero-2: no worlds exist yet");
  });

  it("never lists a seed table", () => {
    for (const seedTable of ["listings", "reviews", "listing_photos", "host_policies"]) {
      expect(DEMO_TABLES).not.toContain(seedTable);
    }
  });
});

describe("homes added in the app (D-043)", () => {
  it("lists them, sorted, in the plan and its description", () => {
    const plan = buildResetPlan({
      counts,
      eventWatermark: 5,
      eventsAboveWatermark: 2,
      worlds: [],
      gaps: [],
      version: 1,
      addedHomes: ["sunny-flat-x7k2qa", "cabin-in-the-hills-a1b2c3"],
    });
    expect(plan.addedHomes).toEqual(["cabin-in-the-hills-a1b2c3", "sunny-flat-x7k2qa"]);
    expect(describePlan(plan, "hero-2")).toContain(
      "delete 2 homes added in the app, with their rows: cabin-in-the-hills-a1b2c3, sunny-flat-x7k2qa",
    );
  });
  it("keeps every listing when none were added", () => {
    const plan = buildResetPlan({
      counts,
      eventWatermark: 5,
      eventsAboveWatermark: 2,
      worlds: [],
      gaps: [],
      version: 1,
    });
    expect(plan.addedHomes).toEqual([]);
    expect(describePlan(plan, "hero-2")).toContain("keep listings: no homes were added in the app");
  });
});
