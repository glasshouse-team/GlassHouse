import { describe, expect, it } from "vitest";
import {
  previewHref,
  rowsToPoll,
  summarizeVersions,
  versionStatus,
  type WorldVersionRow,
} from "./marble-versions";

const row = (o: Partial<WorldVersionRow>): WorldVersionRow => ({
  id: `${o.version}-${o.spot}`,
  version: 1,
  spot: "main",
  spot_label: null,
  status: "ready",
  thumbnail_url: null,
  error: null,
  created_at: "2026-10-18T08:00:00.000Z",
  ready_at: null,
  published_at: null,
  cost_credits: null,
  ...o,
});

describe("versionStatus", () => {
  it("is generating while any spot runs, then failed, then all-or-nothing published", () => {
    expect(versionStatus(["ready", "generating"])).toBe("generating");
    expect(versionStatus(["queued", "failed"])).toBe("generating");
    expect(versionStatus(["ready", "failed"])).toBe("failed");
    expect(versionStatus(["published", "published"])).toBe("published");
    expect(versionStatus(["archived", "archived"])).toBe("archived");
    expect(versionStatus(["ready", "published"])).toBe("ready");
  });
});

describe("summarizeVersions", () => {
  const rows = [
    row({ version: 2, spot: "kitchen", status: "published", cost_credits: 1600 }),
    row({
      version: 2,
      spot: "entrance",
      status: "published",
      thumbnail_url: "e.webp",
      cost_credits: 1600,
    }),
    row({
      version: 3,
      spot: "kitchen",
      status: "generating",
      created_at: "2026-10-18T09:00:00.000Z",
    }),
    row({
      version: 3,
      spot: "entrance",
      status: "ready",
      thumbnail_url: "e.webp",
      cost_credits: 0,
    }),
  ];

  it("groups spots by version, newest first, with progress and credits", () => {
    const [v3, v2] = summarizeVersions(rows, "entrance");
    expect(v3).toMatchObject({ version: 3, status: "generating", done: 1, total: 2, credits: 0 });
    expect(v2).toMatchObject({ version: 2, status: "published", done: 2, total: 2, credits: 3200 });
    expect(v3.createdAt).toBe("2026-10-18T09:00:00.000Z");
  });

  it("uses the entry spot for the thumbnail and the publish row", () => {
    const [v3] = summarizeVersions(rows, "entrance");
    expect(v3.thumbnailUrl).toBe("e.webp");
    expect(v3.publishRowId).toBe("3-entrance");
    expect(v3.spots[0].spot).toBe("entrance");
  });

  it("shows the re-shot spot's own thumbnail when the entry image is shared (D-031)", () => {
    // hero-2: v1 reuses v2's entrance (same files), so both entry thumbnails are the same.
    const hero = [
      row({ version: 2, spot: "entrance", thumbnail_url: "shared-e.webp" }),
      row({ version: 2, spot: "bath", spot_label: "Bathroom", thumbnail_url: "v2-bath.webp" }),
      row({ version: 1, spot: "entrance", thumbnail_url: "shared-e.webp" }),
      row({ version: 1, spot: "bath", spot_label: "Bathroom", thumbnail_url: "v1-bath.webp" }),
    ];
    const [v2, v1] = summarizeVersions(hero, "entrance");
    expect(v2).toMatchObject({ thumbnailUrl: "v2-bath.webp", thumbnailSpot: "Bathroom" });
    expect(v1).toMatchObject({ thumbnailUrl: "v1-bath.webp", thumbnailSpot: "Bathroom" });
    expect(v1.publishRowId).toBe("1-entrance");
    // Only one version: the entry spot's image is its own.
    const [only] = summarizeVersions(hero.slice(0, 2), "entrance");
    expect(only).toMatchObject({ thumbnailUrl: "shared-e.webp", thumbnailSpot: "entrance" });
  });

  it("polls only generating rows and links the preview to the tour", () => {
    expect(rowsToPoll(rows)).toEqual(["3-kitchen"]);
    expect(previewHref("abc", 3)).toBe("/tour/abc?version=3");
  });
});
