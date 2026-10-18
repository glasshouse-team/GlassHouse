import { describe, expect, it } from "vitest";
import { generationReadiness, roomStates, type JobRooms } from "./readiness";

const ROOMS = ["Entrance", "Living room", "Kitchen"];
const none = new Set<number>();

describe("roomStates", () => {
  it("marks rooms by their uploads, skipped ones and the rest", () => {
    const jobs: JobRooms[] = [
      { status: "done", rooms: [0] },
      { status: "uploading", rooms: [1] },
    ];
    expect(roomStates(3, jobs, none)).toEqual(["uploaded", "uploading", "todo"]);
    expect(roomStates(3, [], new Set([2]))).toEqual(["todo", "todo", "skipped"]);
  });

  it("keeps a room failed until it is retried or captured again", () => {
    const failed: JobRooms = { status: "failed", rooms: [1, 2] };
    expect(roomStates(3, [failed], none)).toEqual(["todo", "failed", "failed"]);
    expect(roomStates(3, [failed, { status: "done", rooms: [1] }], none)).toEqual([
      "todo",
      "uploaded",
      "failed",
    ]);
    expect(roomStates(3, [failed, { status: "uploading", rooms: [2] }], none)[2]).toBe("uploading");
  });

  it("lets the host skip a room whose upload failed", () => {
    expect(roomStates(2, [{ status: "failed", rooms: [1] }], new Set([1]))).toEqual([
      "todo",
      "skipped",
    ]);
  });
});

describe("generationReadiness", () => {
  it("is ready when every room is uploaded", () => {
    expect(generationReadiness(ROOMS, ["uploaded", "uploaded", "uploaded"])).toEqual({
      ready: true,
      message: "Every room is uploaded.",
    });
  });

  it("is not ready with one room uploaded and another failed", () => {
    const r = generationReadiness(ROOMS, ["uploaded", "failed", "uploaded"]);
    expect(r.ready).toBe(false);
    expect(r.message).toContain("Living room");
  });

  it("waits for running uploads and rooms still to do", () => {
    expect(generationReadiness(ROOMS, ["uploaded", "uploading", "uploaded"]).ready).toBe(false);
    expect(generationReadiness(ROOMS, ["uploaded", "todo", "uploaded"]).ready).toBe(false);
  });

  it("names skipped rooms instead of claiming every room is uploaded", () => {
    const r = generationReadiness(ROOMS, ["uploaded", "skipped", "uploaded"]);
    expect(r.ready).toBe(true);
    expect(r.message).toBe(
      "2 of 3 rooms are uploaded. Skipped: Living room; the 3D tour leaves it out.",
    );
  });

  it("needs at least one uploaded room", () => {
    expect(generationReadiness(ROOMS, ["skipped", "skipped", "skipped"]).ready).toBe(false);
  });
});
