"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Editable room checklist, pre-filled from the listing's bedrooms and baths. */
export function RoomChecklist({
  rooms,
  onChange,
}: {
  rooms: string[];
  onChange: (rooms: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const name = draft.trim().slice(0, 60);
    if (!name || rooms.includes(name)) return;
    onChange([...rooms, name]);
    setDraft("");
  };
  const move = (i: number, by: number) => {
    const j = i + by;
    if (j < 0 || j >= rooms.length) return;
    const next = [...rooms];
    [next[i], next[j]] = [next[j]!, next[i]!];
    onChange(next);
  };

  return (
    <div className="space-y-2">
      <ol className="space-y-2">
        {rooms.map((room, i) => (
          <li key={`${room}-${i}`} className="flex items-center gap-2">
            <span className="w-5 text-right text-sm text-muted-foreground">{i + 1}.</span>
            <Input
              aria-label={`Room ${i + 1}`}
              value={room}
              maxLength={60}
              onChange={(e) => onChange(rooms.map((r, k) => (k === i ? e.target.value : r)))}
            />
            <Button variant="ghost" size="icon-sm" aria-label="Move up" onClick={() => move(i, -1)}>
              ↑
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Remove ${room}`}
              onClick={() => onChange(rooms.filter((_, k) => k !== i))}
              disabled={rooms.length <= 1}
            >
              ×
            </Button>
          </li>
        ))}
      </ol>
      <div className="flex gap-2">
        <Input
          placeholder="Add a room (Balcony, Hallway...)"
          value={draft}
          maxLength={60}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        <Button variant="outline" onClick={add}>
          Add
        </Button>
      </div>
    </div>
  );
}
