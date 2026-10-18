/**
 * Floor plan SVG (owner: Temuri, GH-18). Plan data stays in world x/z meters; the SVG wraps it in
 * `<g id="plan" transform="rotate(...)">` so its walls are axis-aligned, with the viewBox in
 * meters. Text sits outside that group (upright). The listing card and the minimap overlay the
 * stored SVG with the same planLayout(), so a camera position (x, z) drawn inside the same
 * rotation lands on the right spot.
 */
import type { Point2, Segment2 } from "./slice";
import { dominantAngle, rotatePoint, type Wall } from "./walls";

export interface PlanShape {
  walls: Wall[];
  rooms: { name: string; label: Point2; polygon: Point2[] | null }[];
}

export interface PlanLayout {
  /** SVG rotation in degrees for the `#plan` group. */
  rotateDeg: number;
  viewBox: { x: number; y: number; width: number; height: number };
  /** World [x, z] to SVG user units (meters, rotated). */
  toView(p: Point2): Point2;
}

/** Space around the plan, and the strip under it for the scale bar and note (meters). */
const MARGIN = 0.5;
const FOOTER = 0.7;

/**
 * Rotation that makes the main walls axis-aligned (and the plan wider than tall), and the
 * viewBox around everything.
 */
export function planLayout(plan: PlanShape): PlanLayout {
  const segments: Segment2[] = plan.walls.map(([x1, z1, x2, z2]) => [
    [x1, z1],
    [x2, z2],
  ]);
  let angle = -dominantAngle(segments);
  const points: Point2[] = [
    ...plan.walls.flatMap(([x1, z1, x2, z2]): Point2[] => [
      [x1, z1],
      [x2, z2],
    ]),
    ...plan.rooms.flatMap((r) => [r.label, ...(r.polygon ?? [])]),
  ];
  const bounds = (a: number) => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of points) {
      const [x, y] = rotatePoint(p, a);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
    if (!Number.isFinite(minX)) return { minX: -1, minY: -1, maxX: 1, maxY: 1 };
    return { minX, minY, maxX, maxY };
  };
  let b = bounds(angle);
  if (b.maxY - b.minY > (b.maxX - b.minX) * 1.15) {
    angle += Math.PI / 2;
    b = bounds(angle);
  }
  const deg = Math.round(((angle * 180) / Math.PI) * 1000) / 1000;
  const rad = (deg * Math.PI) / 180;
  return {
    rotateDeg: deg,
    viewBox: {
      x: b.minX - MARGIN,
      y: b.minY - MARGIN,
      width: b.maxX - b.minX + 2 * MARGIN,
      height: b.maxY - b.minY + 2 * MARGIN + FOOTER,
    },
    toView: (p) => rotatePoint(p, rad),
  };
}

export function viewBoxString({ x, y, width, height }: PlanLayout["viewBox"]): string {
  return [x, y, width, height].map(fmt).join(" ");
}

function fmt(n: number): string {
  return String(Math.round(n * 1000) / 1000);
}

export function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Plan colors (literal: an SVG loaded as an image does not see the page's CSS variables). */
export const PLAN_COLORS = {
  wall: "#1f2937",
  room: "#f4f4f5",
  roomStroke: "#d4d4d8",
  current: "#d7ece5",
  currentStroke: "#1f6f5c",
  text: "#27272a",
  muted: "#71717a",
  /** --honesty */
  honesty: "#f5a524",
} as const;

export interface RenderOptions {
  /** Room name drawn as "you are here". */
  highlight?: string | null;
  /** AI-filled areas (open gaps) to hatch, in the same world frame. */
  gaps?: { at: Point2; radius_m: number }[];
  /** Pixels per meter for the intrinsic width and height. */
  pxPerMeter?: number;
}

/** The floor plan as a standalone SVG document. */
export function renderPlanSvg(plan: PlanShape, options: RenderOptions = {}): string {
  const layout = planLayout(plan);
  const { viewBox } = layout;
  const px = options.pxPerMeter ?? 80;
  const c = PLAN_COLORS;
  const out: string[] = [];
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBoxString(viewBox)}" width="${Math.round(viewBox.width * px)}" height="${Math.round(viewBox.height * px)}" font-family="Inter, system-ui, sans-serif">`,
  );
  out.push(
    `<defs><pattern id="hatch" patternUnits="userSpaceOnUse" width="0.2" height="0.2" patternTransform="rotate(45)"><rect width="0.2" height="0.2" fill="${c.honesty}" fill-opacity="0.15"/><line x1="0" y1="0" x2="0" y2="0.2" stroke="${c.honesty}" stroke-width="0.07"/></pattern></defs>`,
  );
  out.push(
    `<rect x="${fmt(viewBox.x)}" y="${fmt(viewBox.y)}" width="${fmt(viewBox.width)}" height="${fmt(viewBox.height)}" fill="#ffffff"/>`,
  );
  out.push(`<g id="plan" transform="rotate(${fmt(layout.rotateDeg)})">`);
  for (const room of plan.rooms) {
    if (!room.polygon || room.polygon.length < 3) continue;
    const current = room.name === options.highlight;
    const points = room.polygon.map(([x, z]) => `${fmt(x)},${fmt(z)}`).join(" ");
    out.push(
      `<polygon data-room="${escapeXml(room.name)}" points="${points}" fill="${current ? c.current : c.room}" stroke="${current ? c.currentStroke : c.roomStroke}" stroke-width="0.03"/>`,
    );
  }
  for (const gap of options.gaps ?? []) {
    out.push(
      `<circle cx="${fmt(gap.at[0])}" cy="${fmt(gap.at[1])}" r="${fmt(gap.radius_m)}" fill="url(#hatch)" stroke="${c.honesty}" stroke-width="0.03"/>`,
    );
  }
  out.push(
    `<g stroke="${c.wall}" stroke-width="0.1" stroke-linecap="square" fill="none">` +
      plan.walls
        .map(
          ([x1, z1, x2, z2]) =>
            `<line x1="${fmt(x1)}" y1="${fmt(z1)}" x2="${fmt(x2)}" y2="${fmt(z2)}"/>`,
        )
        .join("") +
      `</g>`,
  );
  out.push(`</g>`);

  for (const room of plan.rooms) {
    const [x, y] = layout.toView(room.label);
    const current = room.name === options.highlight;
    out.push(
      `<text x="${fmt(x)}" y="${fmt(y)}" font-size="0.28" text-anchor="middle" dominant-baseline="middle" fill="${c.text}"${current ? ' font-weight="600"' : ""}>${escapeXml(room.name)}</text>`,
    );
  }

  // 1 m scale bar, bottom left; note, bottom right.
  const baseY = viewBox.y + viewBox.height - 0.35;
  const left = viewBox.x + MARGIN;
  out.push(
    `<g stroke="${c.text}" stroke-width="0.04"><line x1="${fmt(left)}" y1="${fmt(baseY)}" x2="${fmt(left + 1)}" y2="${fmt(baseY)}"/><line x1="${fmt(left)}" y1="${fmt(baseY - 0.08)}" x2="${fmt(left)}" y2="${fmt(baseY + 0.08)}"/><line x1="${fmt(left + 1)}" y1="${fmt(baseY - 0.08)}" x2="${fmt(left + 1)}" y2="${fmt(baseY + 0.08)}"/></g>`,
  );
  out.push(
    `<text x="${fmt(left + 1.12)}" y="${fmt(baseY)}" font-size="0.2" dominant-baseline="middle" fill="${c.text}">1 m</text>`,
  );
  out.push(
    `<text x="${fmt(viewBox.x + viewBox.width - MARGIN)}" y="${fmt(baseY)}" font-size="0.18" text-anchor="end" dominant-baseline="middle" fill="${c.muted}">Plan is approximate</text>`,
  );
  out.push(`</svg>`);
  return out.join("\n");
}
