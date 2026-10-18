/**
 * Live recording warnings (GH-22): turning too fast, too dark, shaky. Pure, tested.
 * Thresholds from the mobile-capture skill.
 */

export type CaptureWarning = "too_fast" | "too_dark" | "shaky";

export const WARNING_LIMITS = {
  /** Degrees per second. Faster than this smears frames. */
  maxTurnDegPerS: 60,
  /** Average luminance 0..255 below this is too dark to reconstruct. */
  minLuma: 40,
  /** Peak acceleration (m/s^2, gravity removed) in the last second above this is shaky. */
  shakeAccel: 3.5,
} as const;

export const WARNING_TEXT: Record<CaptureWarning, string> = {
  too_fast: "Turning too fast: slow down",
  too_dark: "Too dark: turn on the lights",
  shaky: "Shaky: hold the phone steady at chest height",
};

/** Average Rec. 709 luminance (0..255) of RGBA pixels, reading every `stride`-th pixel. */
export function averageLuma(rgba: ArrayLike<number>, stride = 1): number {
  const step = 4 * Math.max(1, Math.floor(stride));
  let sum = 0;
  let n = 0;
  for (let i = 0; i + 2 < rgba.length; i += step) {
    sum += 0.2126 * rgba[i]! + 0.7152 * rgba[i + 1]! + 0.0722 * rgba[i + 2]!;
    n++;
  }
  return n ? sum / n : 0;
}

/** Magnitude of an acceleration vector; missing axes count as 0. */
export function accelMagnitude(a: {
  x?: number | null;
  y?: number | null;
  z?: number | null;
}): number {
  return Math.hypot(a.x ?? 0, a.y ?? 0, a.z ?? 0);
}

export interface WarningInputs {
  /** Degrees per second, from turnRate(). */
  turnRate?: number | null;
  /** Average frame luminance, from averageLuma(). */
  luma?: number | null;
  /** Peak acceleration over the last second, gravity removed. */
  shakePeak?: number | null;
}

/** Warnings to show now. A missing input (no sensor, no frame yet) never warns. */
export function currentWarnings(input: WarningInputs): CaptureWarning[] {
  const out: CaptureWarning[] = [];
  if (input.turnRate != null && input.turnRate > WARNING_LIMITS.maxTurnDegPerS)
    out.push("too_fast");
  if (input.luma != null && input.luma < WARNING_LIMITS.minLuma) out.push("too_dark");
  if (input.shakePeak != null && input.shakePeak > WARNING_LIMITS.shakeAccel) out.push("shaky");
  return out;
}

/**
 * Quality flags saved on the capture (`captures.quality_flags`): each warning that was on in
 * at least `minShare` of the checks, e.g. "too_dark".
 */
export function qualityFlags(
  history: readonly (readonly CaptureWarning[])[],
  minShare = 0.15,
): CaptureWarning[] {
  if (!history.length) return [];
  const all: CaptureWarning[] = ["too_fast", "too_dark", "shaky"];
  return all.filter(
    (w) => history.filter((ws) => ws.includes(w)).length / history.length >= minShare,
  );
}
