import { describe, expect, it } from "vitest";
import type { Anchor, Gap } from "@/lib/schemas/world";
import {
  distanceXZ,
  findAnchor,
  flyTo,
  highlightRoom,
  HONESTY_NOTE,
  honestyNoteForAnchor,
  knownRooms,
  lookToward,
  nearbyGap,
  showFact,
  spaceCard,
  spaceTools,
  type Space,
} from "./space";

const OFFICE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const KITCHEN = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function anchor(over: Partial<Anchor> & Pick<Anchor, "id" | "name">): Anchor {
  return {
    world_id: OFFICE,
    kind: "object",
    room: "Living room",
    position: { x: 0, y: 1.6, z: 0 },
    look_at: null,
    source: "manual",
    ...over,
  };
}

function gap(over: Partial<Gap> = {}): Gap {
  return {
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
    ...over,
  };
}

const desk = anchor({
  id: "11111111-1111-4111-8111-111111111111",
  name: "desk",
  position: { x: 0, y: 1.6, z: 0 },
  look_at: { x: 0.5, y: 0.8, z: -1 },
});
const washer = anchor({
  id: "22222222-2222-4222-8222-222222222222",
  name: "washing machine",
  world_id: KITCHEN,
  room: "Kitchen",
  position: { x: 0, y: 1.6, z: 3 },
  look_at: { x: 0, y: 0.5, z: 4 },
});
const cooktop = anchor({
  id: "33333333-3333-4333-8333-333333333333",
  name: "cooktop",
  world_id: KITCHEN,
  room: "Kitchen",
  position: { x: 0, y: 1.6, z: 0 },
  look_at: { x: 1, y: 0.9, z: 0 },
});

function space(over: Partial<Space> = {}): Space {
  return {
    listingId: "00000000-0000-4000-8000-0000000000b2",
    listingTitle: "Tbilisi flat",
    version: 1,
    currentWorldId: OFFICE,
    spots: [
      { worldId: OFFICE, spot: "living", label: "Living room" },
      { worldId: KITCHEN, spot: "kitchen", label: "Kitchen" },
    ],
    anchors: [desk, washer, cooktop],
    gaps: [gap()],
    facts: [
      { key: "workspace", value: "desk, ultrawide monitor, office chair", confidence: 0.9 },
      { key: "washer", value: true, confidence: 0.8 },
    ],
    ...over,
  };
}

describe("distance and the honesty note", () => {
  it("measures on the floor plane, ignoring height", () => {
    expect(distanceXZ({ x: 0, y: 0, z: 0 }, { x: 3, y: 10, z: 4 })).toBe(5);
  });

  it("flags an anchor within 1.5 m of an AI-filled gap of its own world", () => {
    // cooktop looks at (1, 0, 0); the gap is at (2, 0) => 1 m away.
    expect(nearbyGap(cooktop, [gap()])?.id).toBe(gap().id);
    expect(honestyNoteForAnchor(cooktop, [gap()])).toBe(HONESTY_NOTE);
    expect(honestyNoteForAnchor(cooktop, [gap({ status: "requested" })])).toBe(HONESTY_NOTE);
  });

  it("counts exactly 1.5 m but not further", () => {
    const at = (x: number) =>
      anchor({ id: desk.id, name: "x", world_id: KITCHEN, position: { x, y: 1.6, z: 0 } });
    expect(honestyNoteForAnchor(at(0.5), [gap()])).toBe(HONESTY_NOTE);
    expect(honestyNoteForAnchor(at(0.49), [gap()])).toBeUndefined();
  });

  it("ignores filled or dismissed gaps, gaps without a position and other spots' gaps", () => {
    expect(nearbyGap(cooktop, [gap({ status: "filled" })])).toBeNull();
    expect(nearbyGap(cooktop, [gap({ status: "dismissed" })])).toBeNull();
    expect(nearbyGap(cooktop, [gap({ position: null })])).toBeNull();
    // Same coordinates, other world: they mean nothing in this spot (D-009).
    expect(nearbyGap(cooktop, [gap({ world_id: OFFICE })])).toBeNull();
    expect(nearbyGap(washer, [gap()])).toBeNull();
  });
});

describe("space tools", () => {
  it("fly_to returns the tour action and a feed line naming the guest", () => {
    const result = flyTo(space(), "Nino", desk.id);
    expect(result).toEqual({
      ok: true,
      summary: "Guest agent showed Nino the desk",
      action: { type: "fly_to", anchorId: desk.id },
      shown: "the desk (Living room)",
    });
  });

  it("adds the honesty note near the kitchen gap", () => {
    const result = flyTo(space(), "Nino", cooktop.id);
    expect(result).toMatchObject({ ok: true, honestyNote: HONESTY_NOTE });
  });

  it("refuses anchors the home doesn't have", () => {
    const result = flyTo(space(), "Nino", "44444444-4444-4444-8444-444444444444");
    expect(result.ok).toBe(false);
    expect(result).not.toHaveProperty("action");
    expect(lookToward(space(), "Nino", "balcony").ok).toBe(false);
  });

  it("accepts a unique anchor name when the model passes it instead of the id", () => {
    expect(findAnchor(space(), "Washing_Machine")?.id).toBe(washer.id);
    const twoDesks = space({ anchors: [desk, { ...desk, id: washer.id }] });
    expect(findAnchor(twoDesks, "desk")).toBeNull();
  });

  it("look_toward turns to an anchor and may name one in another spot", () => {
    expect(lookToward(space(), "Nino", washer.id)).toMatchObject({
      ok: true,
      action: { type: "look_toward", anchorId: washer.id },
      summary: "Guest agent turned Nino toward the washing machine",
    });
  });

  it("highlight_room accepts known rooms only and notes AI-filled rooms", () => {
    expect(knownRooms(space())).toEqual(["Living room", "Kitchen"]);
    expect(highlightRoom(space(), "Nino", "kitchen")).toMatchObject({
      ok: true,
      action: { type: "highlight_room", room: "Kitchen" },
      honestyNote: HONESTY_NOTE,
    });
    expect(highlightRoom(space(), "Nino", "living room")).not.toHaveProperty("honestyNote");
    expect(highlightRoom(space(), "Nino", "Balcony").ok).toBe(false);
  });

  it("show_fact shows a checked fact and refuses unknown keys", () => {
    expect(showFact(space(), "Nino", "fact:washer")).toMatchObject({
      ok: true,
      action: { type: "show_fact", key: "washer", value: true },
    });
    expect(showFact(space(), "Nino", "view_type").ok).toBe(false);
  });

  it("tool execute functions return the same results", async () => {
    const tools = spaceTools(space(), "Nino");
    const out = await tools.fly_to.execute!({ anchorId: desk.id }, {
      toolCallId: "c1",
      messages: [],
      context: {},
    } as never);
    expect(out).toMatchObject({ ok: true, action: { type: "fly_to" } });
  });
});

describe("spaceCard", () => {
  it("gives the model ids, names and rooms but no coordinates", () => {
    const card = spaceCard(space());
    expect(card.current_spot).toBe("Living room");
    expect(card.anchors).toContainEqual({
      id: cooktop.id,
      name: "cooktop",
      kind: "object",
      room: "Kitchen",
      in_current_spot: false,
      near_ai_filled_area: true,
    });
    expect(card.ai_filled_areas).toEqual([
      { room: "Kitchen", description: "The corner right of the cooktop is blank." },
    ]);
    expect(JSON.stringify(card)).not.toMatch(/position|look_at|"x"/);
  });
});
