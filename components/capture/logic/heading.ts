/**
 * Compass heading math for the phone recorder (GH-22). Pure: no DOM access, so it runs in tests.
 * Degrees, clockwise from north (or from wherever the sensor's zero is; only differences matter).
 */

/** The fields of a DeviceOrientationEvent we read. iOS adds `webkitCompassHeading`. */
export interface OrientationReading {
  alpha: number | null;
  webkitCompassHeading?: number | null;
}

/** Maps any angle into [0, 360). */
export function normalizeDeg(deg: number): number {
  const d = deg % 360;
  return d < 0 ? d + 360 : d + 0;
}

/**
 * Heading of the back camera in degrees [0, 360), or null when the sensor gives nothing.
 * iOS: `webkitCompassHeading` is already clockwise from magnetic north.
 * Android and others: `alpha` grows counter-clockwise, so heading = 360 - alpha; it is only
 * absolute on `deviceorientationabsolute`, but a coverage ring only needs differences.
 * `screenAngle` (`screen.orientation.angle`) corrects for a phone held in landscape.
 */
export function headingFromEvent(event: OrientationReading, screenAngle = 0): number | null {
  const ios = event.webkitCompassHeading;
  if (typeof ios === "number" && Number.isFinite(ios)) return normalizeDeg(ios + screenAngle);
  if (typeof event.alpha === "number" && Number.isFinite(event.alpha))
    return normalizeDeg(360 - event.alpha + screenAngle);
  return null;
}

/** Signed shortest turn from `from` to `to`, in (-180, 180]. Positive means turning right. */
export function angleDelta(from: number, to: number): number {
  const d = normalizeDeg(to - from);
  return d > 180 ? d - 360 : d;
}

export interface HeadingSample {
  /** Seconds since the recording (or ring) started. */
  t: number;
  heading: number;
}

/**
 * Absolute turn speed in degrees per second over the samples of the last `windowS` seconds.
 * Sums the shortest turn between neighbours, so it is right across the 359 -> 0 wrap.
 */
export function turnRate(samples: readonly HeadingSample[], windowS = 1): number {
  if (samples.length < 2) return 0;
  const end = samples[samples.length - 1]!.t;
  let i = samples.length - 1;
  while (i > 0 && end - samples[i - 1]!.t <= windowS) i--;
  const span = end - samples[i]!.t;
  if (span <= 0) return 0;
  let turned = 0;
  for (let k = i + 1; k < samples.length; k++)
    turned += Math.abs(angleDelta(samples[k - 1]!.heading, samples[k]!.heading));
  return turned / span;
}
