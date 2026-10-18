import { describe, expect, it } from "vitest";
import { escapeXml, planLayout, renderPlanSvg, type PlanShape } from "./svg";
import { rotatePoint, type Wall } from "./walls";

const DEG = Math.PI / 180;

function turnedRoom(angle: number, w = 4, h = 3): PlanShape {
  const c = [
    [-w / 2, -h / 2],
    [w / 2, -h / 2],
    [w / 2, h / 2],
    [-w / 2, h / 2],
  ].map((p) => rotatePoint(p as [number, number], angle));
  return {
    walls: c.map((p, i) => [...p, ...c[(i + 1) % 4]] as Wall),
    rooms: [{ name: "Kitchen", label: [0, 0], polygon: c }],
  };
}

describe("planLayout", () => {
  it("rotates turned walls back onto the axes and fits the viewBox around them", () => {
    const layout = planLayout(turnedRoom(25 * DEG));
    expect(layout.rotateDeg).toBeCloseTo(-25, 1);
    const [x, y] = layout.toView(rotatePoint([2, 1.5], 25 * DEG));
    expect(x).toBeCloseTo(2);
    expect(y).toBeCloseTo(1.5);
    // 4 x 3 m plus 0.5 m margins, plus the 0.7 m footer.
    expect(layout.viewBox.width).toBeCloseTo(5);
    expect(layout.viewBox.height).toBeCloseTo(4.7);
  });

  it("turns a tall plan sideways so it is wider than tall", () => {
    const layout = planLayout(turnedRoom(0, 2, 6));
    expect(Math.abs(layout.rotateDeg)).toBeCloseTo(90);
    expect(layout.viewBox.width).toBeGreaterThan(layout.viewBox.height - 0.7);
  });

  it("toView matches the SVG rotate() of the #plan group", () => {
    const layout = planLayout(turnedRoom(10 * DEG));
    const p: [number, number] = [1, 2];
    const r = layout.rotateDeg * DEG;
    // SVG rotate(a): x' = x cos a - y sin a, y' = x sin a + y cos a.
    const svg = [p[0] * Math.cos(r) - p[1] * Math.sin(r), p[0] * Math.sin(r) + p[1] * Math.cos(r)];
    expect(layout.toView(p)[0]).toBeCloseTo(svg[0]);
    expect(layout.toView(p)[1]).toBeCloseTo(svg[1]);
  });
});

describe("renderPlanSvg", () => {
  const svg = renderPlanSvg(turnedRoom(0), {
    highlight: "Kitchen",
    gaps: [{ at: [1, 1], radius_m: 0.5 }],
  });

  it("draws walls, the room name, a scale bar and the approximate note", () => {
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain('<g id="plan" transform="rotate(');
    const wallGroup = svg.match(/<g stroke="#1f2937"[^>]*>(.*?)<\/g>/)?.[1] ?? "";
    expect(wallGroup.match(/<line /g)?.length).toBe(4);
    expect(svg).toContain(">Kitchen</text>");
    expect(svg).toContain(">1 m</text>");
    expect(svg).toContain("Plan is approximate");
  });

  it("highlights the current room and hatches gaps", () => {
    expect(svg).toContain('font-weight="600"');
    expect(svg).toContain("#d7ece5");
    expect(svg).toContain('fill="url(#hatch)"');
  });

  it("escapes room names", () => {
    expect(escapeXml(`<b>"Tom's" & co</b>`)).toBe(
      "&lt;b&gt;&quot;Tom&apos;s&quot; &amp; co&lt;/b&gt;",
    );
    const evil = renderPlanSvg({
      walls: [],
      rooms: [{ name: "<script>", label: [0, 0], polygon: null }],
    });
    expect(evil).not.toContain("<script>");
  });
});
