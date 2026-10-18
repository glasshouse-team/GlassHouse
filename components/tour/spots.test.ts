import { describe, expect, it } from "vitest";
import type { Anchor, World } from "@/lib/schemas/world";
import {
  anchorView,
  arrivalAzimuth,
  arrowDistance,
  azimuthDirection,
  clampToSpot,
  directionAzimuth,
  lookDirection,
  neighbourSpots,
  pickTourVersion,
  roomBadge,
  servedFromOurStorage,
  spotLabel,
  startAnchor,
} from "./spots";

const ORIGIN = "https://abc.supabase.co";
const url = (id: string) => `${ORIGIN}/storage/v1/object/public/media/worlds/${id}/splat-web.spz`;

let n = 0;
function world(over: Partial<World>): World {
  n += 1;
  const id = over.id ?? `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  return {
    id,
    listing_id: "00000000-0000-4000-8000-0000000000b2",
    version: 1,
    spot: "main",
    spot_label: null,
    links: [],
    status: "ready",
    model: null,
    input_kind: null,
    input_capture_ids: [],
    marble_world_id: null,
    operation_id: null,
    spz_url: url(id),
    spz_hq_url: null,
    collider_mesh_url: null,
    hq_mesh_url: null,
    pano_url: null,
    thumbnail_url: null,
    caption: null,
    metric_scale_factor: 1,
    ground_plane_offset: 1.5,
    coverage_score: null,
    cost_credits: null,
    error: null,
    ...over,
  };
}

describe("azimuthDirection", () => {
  it("points 0 forward (-z), 90 right (+x), 180 back, 270 left", () => {
    const f = azimuthDirection(0);
    expect(f.x).toBeCloseTo(0);
    expect(f.z).toBeCloseTo(-1);
    const r = azimuthDirection(90);
    expect(r.x).toBeCloseTo(1);
    expect(r.z).toBeCloseTo(0);
    expect(azimuthDirection(180).z).toBeCloseTo(1);
    expect(azimuthDirection(270).x).toBeCloseTo(-1);
  });

  it("round-trips through directionAzimuth", () => {
    for (const az of [0, 45, 105, 206, 355]) {
      expect(directionAzimuth(azimuthDirection(az))).toBeCloseTo(az);
    }
  });

  it("keeps the azimuth with pitch and looks down for negative pitch", () => {
    const d = lookDirection(90, -0.2);
    expect(d.y).toBeLessThan(0);
    expect(Math.hypot(d.x, d.y, d.z)).toBeCloseTo(1);
    expect(directionAzimuth(d)).toBeCloseTo(90);
  });
});

describe("arrivalAzimuth", () => {
  const bedroom = world({ spot: "bedroom", links: [{ to: "entrance", azimuth: 180 }] });
  it("faces into the room: the link back to where we came from plus 180", () => {
    expect(arrivalAzimuth(bedroom, "entrance")).toBe(0);
    expect(arrivalAzimuth(world({ links: [{ to: "entrance", azimuth: 206 }] }), "entrance")).toBe(
      26,
    );
  });
  it("faces the world's forward without a link back", () => {
    expect(arrivalAzimuth(bedroom, "kitchen")).toBe(0);
    expect(arrivalAzimuth(bedroom, null)).toBe(0);
  });
});

describe("arrowDistance", () => {
  it("stops 0.5 m before the first wall-like hit", () => {
    expect(arrowDistance([{ distance: 2.4, normalY: 0.05 }])).toBeCloseTo(1.9);
  });
  it("ignores floors, table tops and floaters right at the camera", () => {
    expect(
      arrowDistance([
        { distance: 0.1, normalY: 0 },
        { distance: 1.2, normalY: 0.95 },
        { distance: 2.5, normalY: -0.1 },
      ]),
    ).toBeCloseTo(2);
  });
  it("clamps between 0.8 and 3 m and defaults to 2 m", () => {
    expect(arrowDistance([{ distance: 0.9, normalY: 0 }])).toBe(0.8);
    expect(arrowDistance([{ distance: 9, normalY: 0 }])).toBe(3);
    expect(arrowDistance([])).toBe(2);
  });
});

describe("clampToSpot", () => {
  it("keeps the eye within 1 m of the spot", () => {
    const p = clampToSpot({ x: 3, y: 1.6, z: 4 });
    expect(Math.hypot(p.x, p.z)).toBeCloseTo(1);
    expect(p.x / p.z).toBeCloseTo(0.75);
    expect(clampToSpot({ x: 0.2, y: 1.6, z: 0.1 })).toEqual({ x: 0.2, y: 1.6, z: 0.1 });
    expect(clampToSpot({ x: 0, y: 5, z: 0 }).y).toBe(2.2);
  });
});

describe("anchorView", () => {
  it("looks at look_at from a clamped eye", () => {
    const v = anchorView({ position: { x: 2, y: 1.6, z: 0 }, look_at: { x: 3, y: 0.8, z: 0 } });
    expect(v.eye.x).toBeCloseTo(1);
    expect(v.target).toEqual({ x: 3, y: 0.8, z: 0 });
  });
  it("looks straight ahead for a room anchor at the spot", () => {
    const v = anchorView({ position: { x: 0, y: 1.6, z: 0 }, look_at: null });
    expect(v.target.z).toBeLessThan(v.eye.z);
    expect(v.target.y).toBe(v.eye.y);
  });
});

describe("servedFromOurStorage", () => {
  it("accepts public objects in our Supabase storage only", () => {
    expect(servedFromOurStorage(url("x"), ORIGIN)).toBe(true);
    expect(servedFromOurStorage("https://api.worldlabs.ai/assets/x.spz", ORIGIN)).toBe(false);
    expect(servedFromOurStorage("https://cdn.marble.worldlabs.ai/x.spz", ORIGIN)).toBe(false);
    expect(servedFromOurStorage(`${ORIGIN}/rest/v1/worlds`, ORIGIN)).toBe(false);
    expect(servedFromOurStorage(null, ORIGIN)).toBe(false);
    expect(servedFromOurStorage(url("x"), null)).toBe(false);
    expect(servedFromOurStorage("not a url", ORIGIN)).toBe(false);
  });
});

describe("pickTourVersion", () => {
  const v1 = [
    world({
      version: 1,
      spot: "entrance",
      links: [
        { to: "kitchen", azimuth: 45 },
        { to: "bedroom", azimuth: 355 },
      ],
    }),
    world({ version: 1, spot: "kitchen", links: [{ to: "entrance", azimuth: 105 }] }),
    world({ version: 1, spot: "bedroom", links: [{ to: "entrance", azimuth: 180 }] }),
  ];
  const v2 = v1.map((w) => world({ ...w, id: undefined, version: 2, status: "published" }));
  const entranceV2 = v2[0];
  const all = [...v1, ...v2];

  it("shows the published version and starts at its entry world", () => {
    const t = pickTourVersion(all, { publishedWorldId: entranceV2.id, storageOrigin: ORIGIN })!;
    expect(t.version).toBe(2);
    expect(t.entrySpot).toBe("entrance");
    expect(t.preview).toBe(false);
    expect(t.worlds.map((w) => w.spot)).toEqual(["bedroom", "entrance", "kitchen"]);
  });

  it("previews ?version=n starting at the same spot", () => {
    const t = pickTourVersion(all, {
      version: 1,
      publishedWorldId: entranceV2.id,
      storageOrigin: ORIGIN,
    })!;
    expect(t.version).toBe(1);
    expect(t.entrySpot).toBe("entrance");
    expect(t.preview).toBe(true);
    expect(t.worlds.every((w) => w.version === 1)).toBe(true);
  });

  it("falls back to the newest published version and the hub spot", () => {
    const t = pickTourVersion(all, { publishedWorldId: null, storageOrigin: ORIGIN })!;
    expect(t.version).toBe(2);
    expect(t.entrySpot).toBe("entrance");
  });

  it("skips rows without a splat in our storage, and returns null with nothing to show", () => {
    const foreign = world({
      version: 3,
      status: "published",
      spz_url: "https://api.worldlabs.ai/x.spz",
    });
    expect(
      pickTourVersion([foreign], { publishedWorldId: foreign.id, storageOrigin: ORIGIN }),
    ).toBeNull();
    const failed = world({ version: 4, status: "failed" });
    expect(
      pickTourVersion([failed], { version: 4, publishedWorldId: null, storageOrigin: ORIGIN }),
    ).toBeNull();
    expect(pickTourVersion([], { publishedWorldId: null, storageOrigin: ORIGIN })).toBeNull();
  });
});

describe("helpers", () => {
  it("labels spots and lists neighbours that exist", () => {
    expect(spotLabel({ spot: "living_room", spot_label: null })).toBe("Living room");
    expect(spotLabel({ spot: "x", spot_label: "Entrance hall" })).toBe("Entrance hall");
    expect(
      neighbourSpots(
        {
          links: [
            { to: "a", azimuth: 0 },
            { to: "a", azimuth: 10 },
            { to: "zz", azimuth: 1 },
          ],
        },
        [{ spot: "a" }],
      ),
    ).toEqual(["a"]);
  });

  it("badges a room partly AI-filled only for open or requested gaps", () => {
    expect(roomBadge([])).toBe("real");
    expect(roomBadge([{ status: "filled" }, { status: "dismissed" }])).toBe("real");
    expect(roomBadge([{ status: "requested" }])).toBe("partly-ai");
  });

  it("starts at a ?anchor= only when it belongs to the tour", () => {
    const w = world({});
    const a = { id: "a1", world_id: w.id } as Anchor;
    const other = { id: "a2", world_id: "elsewhere" } as Anchor;
    expect(startAnchor([a, other], [w], "a1")).toBe(a);
    expect(startAnchor([a, other], [w], "a2")).toBeNull();
    expect(startAnchor([a], [w], null)).toBeNull();
  });
});
