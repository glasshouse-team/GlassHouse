"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Result {
  calibration: { room: string; axis: string; meters: number; scale: number };
  rooms: { room: string; area_m2: number | null }[];
  total_area_m2: number | null;
}

/**
 * Host-only floor plan calibration (owner: Temuri, GH-18 v2), shown under a version on the host
 * dashboard (inside WorldVersions). The host picks a room, width or length, and enters one real
 * measurement; POST /api/worlds/[id]/floorplan/calibrate scales every room of the version.
 */
export function CalibrateFloorPlan({ worldId, rooms }: { worldId: string; rooms: string[] }) {
  const ids = useId();
  const [room, setRoom] = useState(rooms[0] ?? "");
  const [axis, setAxis] = useState<"width" | "length">("width");
  const [meters, setMeters] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const value = Number(meters.replace(",", "."));
    if (!(value > 0)) {
      setError("Enter the length in meters, for example 3.2.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/worlds/${worldId}/floorplan/calibrate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ room, axis, meters: value }),
      });
      const body = (await res.json().catch(() => ({}))) as Partial<Result> & {
        message?: string;
        error?: string;
      };
      if (!res.ok) {
        setError(body.message ?? body.error ?? `Could not calibrate (HTTP ${res.status}).`);
        setResult(null);
      } else {
        setResult(body as Result);
      }
    } catch {
      setError("Could not calibrate. Check the connection and try again.");
    }
    setBusy(false);
  }

  if (rooms.length === 0) return null;
  return (
    <details className="mt-2 rounded-md border p-2 text-xs">
      <summary className="cursor-pointer font-medium">Calibrate the floor plan</summary>
      <form onSubmit={submit} className="mt-2 flex flex-wrap items-end gap-2">
        <div className="grid gap-1">
          <Label htmlFor={`${ids}-room`}>Room</Label>
          <select
            id={`${ids}-room`}
            value={room}
            onChange={(e) => setRoom(e.target.value)}
            className="h-11 rounded-md border bg-background px-2 sm:h-8"
          >
            {rooms.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </div>
        <div className="grid gap-1">
          <Label htmlFor={`${ids}-axis`}>Side</Label>
          <select
            id={`${ids}-axis`}
            value={axis}
            onChange={(e) => setAxis(e.target.value as "width" | "length")}
            className="h-11 rounded-md border bg-background px-2 sm:h-8"
          >
            <option value="width">Width (shorter side)</option>
            <option value="length">Length (longer side)</option>
          </select>
        </div>
        <div className="grid w-24 gap-1">
          <Label htmlFor={`${ids}-m`}>Meters</Label>
          <Input
            id={`${ids}-m`}
            inputMode="decimal"
            placeholder="3.2"
            value={meters}
            onChange={(e) => setMeters(e.target.value)}
            className="h-11 sm:h-8"
          />
        </div>
        <Button type="submit" size="sm" className="h-11 sm:h-8" disabled={busy || !room}>
          {busy ? "Saving…" : "Save"}
        </Button>
      </form>
      <p className="mt-2 text-neutral-500">
        Measure one wall of one room with a tape; every room&apos;s area is scaled from it.
      </p>
      {error && <p className="mt-1 text-red-600 [overflow-wrap:anywhere]">{error}</p>}
      {result && (
        <p className="mt-1 text-neutral-700 [overflow-wrap:anywhere]" role="status">
          Calibrated from the {result.calibration.room} {result.calibration.axis} (
          {result.calibration.meters} m):{" "}
          {result.rooms
            .filter((r) => r.area_m2 !== null)
            .map((r) => `${r.room} ${r.area_m2!.toFixed(1)} m²`)
            .join(" · ")}
          {result.total_area_m2 !== null && `, total ${result.total_area_m2.toFixed(1)} m²`}.
        </p>
      )}
    </details>
  );
}
