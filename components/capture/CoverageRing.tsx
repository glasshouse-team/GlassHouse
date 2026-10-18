/**
 * Compass coverage ring (GH-22): 36 bins that fill as the host turns, a needle for the current
 * heading and, in ring mode, ticks for the 8 photo directions (D-009). North is up.
 */

const SIZE = 160;
const C = SIZE / 2;
const R = 62;

function polar(deg: number, r = R): [number, number] {
  const a = ((deg - 90) * Math.PI) / 180;
  return [C + r * Math.cos(a), C + r * Math.sin(a)];
}

function arc(from: number, to: number): string {
  const [x1, y1] = polar(from);
  const [x2, y2] = polar(to);
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${R} ${R} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

export interface RingStep {
  heading: number;
  done: boolean;
}

export function CoverageRing({
  filled,
  heading,
  steps,
  target,
  label,
  sublabel,
}: {
  filled: boolean[];
  heading: number | null;
  steps?: RingStep[];
  target?: number | null;
  label: string;
  sublabel?: string;
}) {
  const width = 360 / filled.length;
  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      className="size-36 drop-shadow"
      role="img"
      aria-label={`${label}${sublabel ? `, ${sublabel}` : ""}`}
    >
      <circle cx={C} cy={C} r={R + 14} className="fill-black/45" />
      {filled.map((on, i) => (
        <path
          key={i}
          d={arc(i * width + 0.8, (i + 1) * width - 0.8)}
          strokeWidth={10}
          fill="none"
          className={on ? "stroke-emerald-400" : "stroke-white/25"}
        />
      ))}
      {steps?.map((s, i) => {
        const [x, y] = polar(s.heading, R + 11);
        return (
          <circle
            key={i}
            cx={x}
            cy={y}
            r={3.5}
            className={s.done ? "fill-emerald-400" : "fill-white/70"}
          />
        );
      })}
      {target != null &&
        (() => {
          const [x, y] = polar(target, R + 11);
          return (
            <circle cx={x} cy={y} r={6} className="fill-none stroke-amber-300" strokeWidth={2.5} />
          );
        })()}
      {heading != null &&
        (() => {
          const [x, y] = polar(heading, R - 12);
          return (
            <line
              x1={C}
              y1={C}
              x2={x}
              y2={y}
              strokeWidth={3}
              strokeLinecap="round"
              className="stroke-white"
            />
          );
        })()}
      <text x={C} y={C - 2} textAnchor="middle" className="fill-white text-[15px] font-semibold">
        {label}
      </text>
      {sublabel && (
        <text x={C} y={C + 15} textAnchor="middle" className="fill-white/80 text-[10px]">
          {sublabel}
        </text>
      )}
    </svg>
  );
}
