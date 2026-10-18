import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { PlanShape } from "@/lib/geometry/svg";
import { rotatePoint } from "@/lib/geometry/walls";
import { FloorPlanView } from "./FloorPlanView";

const turn = (20 * Math.PI) / 180;
const corners = (minX: number, maxX: number) =>
  [
    [minX, -1],
    [maxX, -1],
    [maxX, 1],
    [minX, 1],
  ].map((p) => rotatePoint(p as [number, number], turn));
const hall = corners(-2, 2);
const bath = corners(2.1, 4);
const plan: PlanShape = {
  walls: hall.map((p, i) => [...p, ...hall[(i + 1) % 4]] as [number, number, number, number]),
  rooms: [
    { name: "Hall", label: [0, 0], polygon: hall },
    { name: "Bath", label: rotatePoint([3, 0], turn), polygon: bath },
  ],
};

function render(props: Partial<Parameters<typeof FloorPlanView>[0]> = {}) {
  return renderToStaticMarkup(
    createElement(FloorPlanView, { plan, svgUrl: null, title: "Plan", ...props }),
  );
}

describe("FloorPlanView", () => {
  it("draws the dot at the camera's x/z inside the plan rotation", () => {
    const html = render({ pose: { x: 1.25, z: -0.5, azimuth: 90 } });
    const group = html.match(/<g transform="rotate\(([-\d.]+)\)">/);
    expect(Number(group?.[1])).toBeCloseTo(-20, 0);
    expect(html).toContain('data-testid="you-are-here"');
    expect(html).toContain('cx="1.25" cy="-0.5"');
  });

  it("links rooms to the tour and lights the highlighted one", () => {
    const html = render({ roomHrefs: { Bath: "/tour/x?spot=bathroom" }, highlight: "Hall" });
    expect(html).toContain('href="/tour/x?spot=bathroom"');
    expect(html).toContain("fill-[rgb(47_111_222/0.18)]");
    expect(html).not.toContain("you-are-here");
  });

  it("draws walls and names itself when there is no stored SVG", () => {
    const html = render();
    expect(html.match(/<line /g)).toHaveLength(4);
    expect(html).toContain(">Bath</text>");
  });
});
