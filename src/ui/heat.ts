/**
 * Temperature → colour, shared by every pack drawing (landing preview and fleet cards).
 * Coolant cyan → neutral → amber → red, interpolated through a neutral stop so a warming
 * cell never passes through "healthy" green.
 */
const HEAT_STOPS: Array<[number, [number, number, number]]> = [
  [0, [92, 200, 214]], // coolant cyan
  [0.25, [138, 151, 163]], // neutral
  [0.55, [242, 165, 58]], // amber
  [1, [255, 59, 48]], // red
];

/** Colour for a temperature, scaled between `cool` (cyan) and `crit` (red). */
export function heatColor(temp: number, cool = 30, crit = 55): string {
  const x = Math.max(0, Math.min(1, (temp - cool) / (crit - cool)));
  const i = HEAT_STOPS.findIndex(([stop]) => stop >= x);
  if (i <= 0) return `rgb(${HEAT_STOPS[0][1].join(' ')})`;
  const [a, ca] = HEAT_STOPS[i - 1];
  const [b, cb] = HEAT_STOPS[i];
  const k = (x - a) / (b - a);
  return `rgb(${ca.map((v, j) => Math.round(v + (cb[j] - v) * k)).join(' ')})`;
}
