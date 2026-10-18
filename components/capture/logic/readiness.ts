/**
 * Which rooms are uploaded and whether "Generate my 3D home" may start (GH-22). Pure, tested in
 * readiness.test.ts. A room counts as uploaded only when an upload covering it finished: a
 * failed upload keeps the room open until it is retried or captured again.
 */

export type RoomState = "todo" | "uploading" | "uploaded" | "failed" | "skipped";

export interface JobRooms {
  status: "uploading" | "done" | "failed";
  /** Indexes into the room list this upload covers. */
  rooms: readonly number[];
}

/** One state per room. A finished upload wins over a failed or running one for the same room. */
export function roomStates(
  roomCount: number,
  jobs: readonly JobRooms[],
  skipped: ReadonlySet<number>,
): RoomState[] {
  return Array.from({ length: roomCount }, (_, i) => {
    const mine = jobs.filter((j) => j.rooms.includes(i));
    if (mine.some((j) => j.status === "done")) return "uploaded";
    if (mine.some((j) => j.status === "uploading")) return "uploading";
    // Skipping a room whose upload failed is the host's choice to leave it out.
    if (skipped.has(i)) return "skipped";
    return mine.some((j) => j.status === "failed") ? "failed" : "todo";
  });
}

export interface Readiness {
  ready: boolean;
  message: string;
}

/**
 * Ready when no upload is running, at least one room is uploaded and every other room was
 * skipped on purpose. The message names skipped rooms so "all uploaded" is never claimed.
 */
export function generationReadiness(
  rooms: readonly string[],
  states: readonly RoomState[],
): Readiness {
  const named = (s: RoomState) => rooms.filter((_, i) => states[i] === s);
  const failed = named("failed");
  if (failed.length)
    return {
      ready: false,
      message: `Upload failed for ${failed.join(", ")}: retry it or capture the room again.`,
    };
  if (states.includes("uploading"))
    return { ready: false, message: "Wait for the uploads to finish." };
  if (states.includes("todo"))
    return { ready: false, message: "Capture and upload every room first." };
  const uploaded = named("uploaded");
  if (!uploaded.length) return { ready: false, message: "Capture at least one room first." };
  const skipped = named("skipped");
  return {
    ready: true,
    message: skipped.length
      ? `${uploaded.length} of ${rooms.length} rooms are uploaded. Skipped: ${skipped.join(", ")}; the 3D tour leaves ${skipped.length === 1 ? "it" : "them"} out.`
      : "Every room is uploaded.",
  };
}
