/**
 * The stored floor plan SVG with an interactive overlay in the same viewBox (owner: Temuri,
 * GH-18): room hit areas (links or clicks), a highlighted room, and the "you are here" dot with a
 * view cone. No hooks, so it renders on the server (listing card) and inside the client Minimap.
 * Coordinates are the plan's world x/z meters, drawn inside the same rotation as the SVG's #plan.
 */
import Image from "next/image";
import { planLayout, viewBoxString, type PlanShape } from "@/lib/geometry/svg";
import type { Point2 } from "@/lib/geometry/slice";
import { cn } from "@/lib/utils";

/** Camera on the plan: position in meters and heading as an azimuth in degrees. */
export interface PlanPose {
  x: number;
  z: number;
  /** Degrees clockwise from -z seen from above (the spot links' azimuth). */
  azimuth: number;
}

export interface FloorPlanViewProps {
  plan: PlanShape;
  /** The stored SVG (media/worlds/{id}/floorplan.svg). Without it the overlay draws the walls. */
  svgUrl: string | null;
  /** Alt text for the plan image. */
  title: string;
  /** Room lit up in the overlay (hover, highlightRoom, "you are here"). */
  highlight?: string | null;
  /** Room name -> link (listing card: the tour at that room). */
  roomHrefs?: Record<string, string>;
  /** Room clicks (minimap: switch to that spot). */
  onRoomClick?: (room: string) => void;
  pose?: PlanPose | null;
  className?: string;
}

const CONE_DEG = 30;
const CONE_LENGTH = 1.1;

function conePath({ x, z, azimuth }: PlanPose): string {
  const point = (deg: number): Point2 => {
    const a = (deg * Math.PI) / 180;
    return [x + Math.sin(a) * CONE_LENGTH, z - Math.cos(a) * CONE_LENGTH];
  };
  const [l, r] = [point(azimuth - CONE_DEG), point(azimuth + CONE_DEG)];
  return `M${x} ${z} L${l[0]} ${l[1]} L${r[0]} ${r[1]} Z`;
}

export function FloorPlanView({
  plan,
  svgUrl,
  title,
  highlight,
  roomHrefs,
  onRoomClick,
  pose,
  className,
}: FloorPlanViewProps) {
  const layout = planLayout(plan);
  const { width, height } = layout.viewBox;
  return (
    <div
      className={cn("relative w-full overflow-hidden rounded-xl border bg-white", className)}
      style={{ aspectRatio: `${width} / ${height}` }}
    >
      {svgUrl && (
        <Image src={svgUrl} alt={title} fill unoptimized className="object-contain" />
      )}
      <svg
        viewBox={viewBoxString(layout.viewBox)}
        className="absolute inset-0 size-full"
        role={svgUrl ? "presentation" : "img"}
        aria-label={svgUrl ? undefined : title}
      >
        <g transform={`rotate(${layout.rotateDeg})`}>
          {!svgUrl &&
            plan.walls.map(([x1, z1, x2, z2], i) => (
              <line
                key={i}
                x1={x1}
                y1={z1}
                x2={x2}
                y2={z2}
                stroke="#1f2937"
                strokeWidth={0.1}
                strokeLinecap="square"
              />
            ))}
          {plan.rooms.map((room) => {
            if (!room.polygon || room.polygon.length < 3) return null;
            const lit = room.name === highlight;
            const href = roomHrefs?.[room.name];
            const shape = (
              <polygon
                points={room.polygon.map((p) => p.join(",")).join(" ")}
                className={cn(
                  "transition-colors",
                  lit
                    ? "fill-[rgb(47_111_222/0.18)] stroke-[rgb(47_111_222)]"
                    : "fill-transparent stroke-transparent",
                  (href || onRoomClick) && "cursor-pointer hover:fill-[rgb(47_111_222/0.12)]",
                )}
                strokeWidth={0.04}
                onClick={onRoomClick ? () => onRoomClick(room.name) : undefined}
              >
                <title>{room.name}</title>
              </polygon>
            );
            return href ? (
              <a key={room.name} href={href} aria-label={`Walk into the ${room.name}`}>
                {shape}
              </a>
            ) : (
              <g key={room.name}>{shape}</g>
            );
          })}
          {pose && (
            <g pointerEvents="none" data-testid="you-are-here">
              <path d={conePath(pose)} fill="rgb(47 111 222 / 0.25)" />
              <circle
                cx={pose.x}
                cy={pose.z}
                r={0.16}
                fill="rgb(47 111 222)"
                stroke="#fff"
                strokeWidth={0.05}
              />
            </g>
          )}
        </g>
        {!svgUrl &&
          plan.rooms.map((room) => {
            const [x, y] = layout.toView(room.label);
            return (
              <text
                key={room.name}
                x={x}
                y={y}
                fontSize={0.28}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="#27272a"
              >
                {room.name}
              </text>
            );
          })}
      </svg>
    </div>
  );
}
