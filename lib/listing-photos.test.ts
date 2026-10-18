import { describe, expect, it } from "vitest";
import { isPhotoName } from "@/seed/rows";
import { MAX_PHOTOS, nextPhotoSlots, roomSlug } from "./listing-photos";

describe("roomSlug", () => {
  it("makes a file-name part from the room", () => {
    expect(roomSlug("Living room")).toBe("living-room");
    expect(roomSlug("  Café  ")).toBe("cafe");
    expect(roomSlug("სამზარეულო")).toBe("photo");
    expect(roomSlug(null)).toBe("photo");
  });
});

describe("nextPhotoSlots", () => {
  it("numbers on from the highest photo, in the seed's NN-room.jpg form", () => {
    const slots = nextPhotoSlots([1, 2, 5], 2, "Kitchen");
    expect(slots).toEqual([
      { sort: 6, name: "06-kitchen.jpg" },
      { sort: 7, name: "07-kitchen.jpg" },
    ]);
    expect(slots!.every((s) => isPhotoName(s.name))).toBe(true);
  });

  it("starts at 01 for a home with no photos", () => {
    expect(nextPhotoSlots([], 1, null)).toEqual([{ sort: 1, name: "01-photo.jpg" }]);
  });

  it("refuses more photos than a listing holds or two-digit numbers allow", () => {
    expect(
      nextPhotoSlots(
        Array.from({ length: MAX_PHOTOS }, (_, i) => i + 1),
        1,
        null,
      ),
    ).toBeNull();
    expect(nextPhotoSlots([98], 2, null)).toBeNull();
  });
});
