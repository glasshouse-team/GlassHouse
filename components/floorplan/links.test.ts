import { describe, expect, it } from "vitest";
import { pickRoomAnchors, roomHref, type RoomAnchorRow } from "./links";

const row = (
  p: Partial<RoomAnchorRow> & Pick<RoomAnchorRow, "id" | "world_id">,
): RoomAnchorRow => ({
  kind: "room",
  source: "manual",
  created_at: "2026-10-18T10:00:00Z",
  ...p,
});

describe("pickRoomAnchors", () => {
  it("prefers the auto room anchor over manual ones", () => {
    const m = pickRoomAnchors([
      row({ id: "m1", world_id: "w1", created_at: "2026-10-18T09:00:00Z" }),
      row({ id: "a1", world_id: "w1", source: "auto" }),
    ]);
    expect(m.get("w1")).toBe("a1");
  });

  it("falls back to the oldest manual room anchor and ignores other kinds", () => {
    const m = pickRoomAnchors([
      row({ id: "f1", world_id: "w2", kind: "feature", source: "auto" }),
      row({ id: "m2", world_id: "w2", created_at: "2026-10-18T11:00:00Z" }),
      row({ id: "m1", world_id: "w2", created_at: "2026-10-18T09:00:00Z" }),
    ]);
    expect(m.get("w2")).toBe("m1");
    expect(m.size).toBe(1);
  });

  it("returns nothing for worlds without room anchors", () => {
    expect(pickRoomAnchors([]).size).toBe(0);
  });
});

describe("roomHref", () => {
  it("links to the anchor the tour reads, keeping the spot", () => {
    expect(roomHref("L1", "kitchen", "a1")).toBe("/tour/L1?anchor=a1&spot=kitchen");
  });

  it("falls back to the spot only and encodes it", () => {
    expect(roomHref("L1", "living room", null)).toBe("/tour/L1?spot=living+room");
  });
});
