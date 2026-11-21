/** Small numeric helpers used by the detectors. All are pure functions. */

/** Median of a list, or null for an empty list. Robust to a few outliers, unlike the mean. */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export interface TimedValue {
  t: number; // milliseconds
  v: number;
}

/**
 * Least-squares slope in units per second.
 * Uses real timestamps, so irregular sampling and gaps are handled correctly.
 */
export function slopePerSecond(points: TimedValue[]): number | null {
  if (points.length < 2) return null;
  const t0 = points[0].t;
  const xs = points.map((p) => (p.t - t0) / 1000);
  const mx = mean(xs)!;
  const my = mean(points.map((p) => p.v))!;
  let num = 0;
  let den = 0;
  for (let i = 0; i < points.length; i++) {
    num += (xs[i] - mx) * (points[i].v - my);
    den += (xs[i] - mx) ** 2;
  }
  return den === 0 ? null : num / den;
}

/** Sorts "M2" before "M10" by comparing embedded numbers numerically. */
export function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}
