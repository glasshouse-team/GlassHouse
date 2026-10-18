import { describe, expect, it } from "vitest";
import { highlightedPlanRoom, roomSpot, spotFromSearch, spotRoom } from "./minimap";

const worlds = [
  { spot: "entrance", spot_label: null },
  { spot: "kitchen", spot_label: "Kitchen" },
  { spot: "bedroom-1", spot_label: "Main bedroom" },
];
// Plan rooms are named spot_label ?? spot (D-040).
const rooms = [{ name: "entrance" }, { name: "Kitchen" }, { name: "Main bedroom" }];

describe("spotFromSearch", () => {
  it("returns the spot key from ?spot=", () => {
    expect(spotFromSearch("kitchen", worlds)).toBe("kitchen");
    expect(spotFromSearch("bedroom-1", worlds)).toBe("bedroom-1");
  });

  it("takes the first value of a repeated param", () => {
    expect(spotFromSearch(["kitchen", "entrance"], worlds)).toBe("kitchen");
  });

  it("accepts a room name in any case", () => {
    expect(spotFromSearch("Main Bedroom", worlds)).toBe("bedroom-1");
    expect(spotFromSearch("ENTRANCE", worlds)).toBe("entrance");
  });

  it("ignores missing, blank and unknown spots", () => {
    expect(spotFromSearch(undefined, worlds)).toBeNull();
    expect(spotFromSearch("", worlds)).toBeNull();
    expect(spotFromSearch("  ", worlds)).toBeNull();
    expect(spotFromSearch("garage", worlds)).toBeNull();
    expect(spotFromSearch([], worlds)).toBeNull();
  });
});

describe("roomSpot", () => {
  it("maps each plan room to its spot", () => {
    expect(rooms.map((r) => roomSpot(r.name, worlds))).toEqual([
      "entrance",
      "kitchen",
      "bedroom-1",
    ]);
  });

  it("matches the capitalized label the tour shows", () => {
    expect(roomSpot("Entrance", worlds)).toBe("entrance");
  });

  it("returns null for a room without a spot", () => {
    expect(roomSpot("Garage", worlds)).toBeNull();
  });
});

describe("spotRoom", () => {
  it("finds the current spot's room on the plan", () => {
    expect(spotRoom(worlds[0], rooms)).toBe("entrance");
    expect(spotRoom(worlds[2], rooms)).toBe("Main bedroom");
  });

  it("is null when the plan does not have that room", () => {
    expect(spotRoom({ spot: "garage", spot_label: null }, rooms)).toBeNull();
  });
});

describe("highlightedPlanRoom", () => {
  it("falls back to the current room", () => {
    expect(highlightedPlanRoom(null, worlds[1], worlds, rooms)).toBe("Kitchen");
  });

  it("lights the room highlightRoom() picked (spot key or name)", () => {
    expect(highlightedPlanRoom("bedroom-1", worlds[1], worlds, rooms)).toBe("Main bedroom");
    expect(highlightedPlanRoom("main bedroom", worlds[1], worlds, rooms)).toBe("Main bedroom");
  });

  it("ignores an unknown highlight", () => {
    expect(highlightedPlanRoom("balcony", worlds[1], worlds, rooms)).toBe("Kitchen");
  });
});
