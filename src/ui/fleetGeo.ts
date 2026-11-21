/**
 * Simulated geography for the fleet map.
 *
 * The telemetry CSVs contain no GPS, so bus positions are SIMULATED: each bus drives an
 * out-and-back loop between two Edmonton neighbourhoods, advancing with the telemetry clock.
 * Depot locations are ILLUSTRATIVE, not the real transit garages. Distances are straight-line.
 * Everything here is a pure function so it can be tested and reasoned about.
 */
import type { PackState, Severity, Timeline } from '../core';

export type LatLng = [number, number];

/** Neighbourhood anchors (approximate centres). */
const PLACES = {
  downtown: [53.5444, -113.4909],
  university: [53.5232, -113.5263],
  abbottsfield: [53.5725, -113.3905],
  westEdmonton: [53.5225, -113.6242],
  jasperPlace: [53.5395, -113.5865],
  clareview: [53.6015, -113.4085],
  westmount: [53.5565, -113.5435],
  millWoods: [53.4555, -113.4295],
} satisfies Record<string, LatLng>;

/** Illustrative depots spread around the city (not real garage locations). */
export const DEPOTS: Array<{ id: string; name: string; at: LatLng }> = [
  { id: 'north', name: 'North depot', at: [53.5985, -113.4655] },
  { id: 'east', name: 'East depot', at: [53.5655, -113.4185] },
  { id: 'south', name: 'South depot', at: [53.4765, -113.4845] },
  { id: 'west', name: 'West depot', at: [53.5345, -113.6005] },
  { id: 'central', name: 'Central depot', at: [53.5505, -113.5115] },
];

/** Grid-style path between two points: along the avenue first, then the street. */
function gridPath(a: LatLng, b: LatLng): LatLng[] {
  return [a, [a[0], b[1]], b];
}

/** One route per bus, keyed by the route label used in the demo fleet (falls back by index). */
const ROUTES: Array<{ match: string; from: LatLng; to: LatLng }> = [
  { match: 'Downtown', from: PLACES.downtown, to: PLACES.westmount },
  { match: 'University', from: PLACES.university, to: PLACES.downtown },
  { match: 'Abbottsfield', from: PLACES.downtown, to: PLACES.abbottsfield },
  { match: 'West Edmonton', from: PLACES.downtown, to: PLACES.westEdmonton },
  { match: 'Jasper Place', from: PLACES.university, to: PLACES.jasperPlace },
  { match: 'Clareview', from: PLACES.downtown, to: PLACES.clareview },
  { match: 'Westmount', from: PLACES.westmount, to: PLACES.university },
  { match: 'Mill Woods', from: PLACES.university, to: PLACES.millWoods },
];

export interface Route {
  path: LatLng[]; // out and back, closed loop
  lengthKm: number;
}

export function routeFor(label: string, index: number): Route {
  const r = ROUTES.find((x) => label.includes(x.match)) ?? ROUTES[index % ROUTES.length];
  const out = gridPath(r.from, r.to);
  const path = [...out, ...out.slice(0, -1).reverse()];
  return { path, lengthKm: pathLength(path) };
}

/** Great-circle distance in km. */
export function distanceKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function pathLength(path: LatLng[]): number {
  return path.slice(1).reduce((sum, p, i) => sum + distanceKm(path[i], p), 0);
}

/** Point at a given distance along a closed path (wraps around). */
export function pointAlong(route: Route, km: number): LatLng {
  let d = ((km % route.lengthKm) + route.lengthKm) % route.lengthKm;
  for (let i = 1; i < route.path.length; i++) {
    const seg = distanceKm(route.path[i - 1], route.path[i]);
    if (d <= seg || i === route.path.length - 1) {
      const k = seg === 0 ? 0 : Math.min(1, d / seg);
      const [a, b] = [route.path[i - 1], route.path[i]];
      return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
    }
    d -= seg;
  }
  return route.path[0];
}

/** Average simulated bus speed (city driving with stops). */
const SPEED_KMH = 28;
/** Road distance is longer than straight-line; used only for the rough ETA. */
const ROAD_FACTOR = 1.35;
/** Simulated full-charge range of the pack, for the "can it make it" check. */
export const FULL_RANGE_KM = 250;

/**
 * Where a bus is at a given frame. Each bus starts at a different point on its loop.
 * A bus stops (pulls over safely) at the moment a critical alert is first raised.
 */
export function busPosition(route: Route, index: number, timeline: Timeline, frame: number): { at: LatLng; stoppedAt: Date | null } {
  const start = timeline.states[0].timestamp.getTime();
  const critical = timeline.events.find(
    (e) => e.frameIndex <= frame && e.severity === 'critical' && (e.kind === 'raised' || e.kind === 'escalated'),
  );
  const stopFrame = critical ? critical.frameIndex : frame;
  const t = (timeline.states[Math.min(stopFrame, timeline.states.length - 1)].timestamp.getTime() - start) / 3_600_000;
  const offsetKm = route.lengthKm * ((index * 0.37) % 1);
  return { at: pointAlong(route, offsetKm + t * SPEED_KMH), stoppedAt: critical?.time ?? null };
}

export function nearestDepot(at: LatLng) {
  return DEPOTS.map((d) => ({ ...d, km: distanceKm(at, d.at) })).sort((a, b) => a.km - b.km)[0];
}

export interface Guidance {
  tone: Severity;
  headline: string;
  detail: string;
  depot: ReturnType<typeof nearestDepot> | null; // shown as a line on the map
}

/** What the operator should tell the driver, given the pack state and location. */
export function guidanceFor(state: PackState, at: LatLng, stopped: boolean): Guidance {
  const depot = nearestDepot(at);
  const etaMin = Math.max(1, Math.round(((depot.km * ROAD_FACTOR) / SPEED_KMH) * 60));
  const where = `${depot.name}, ~${depot.km.toFixed(1)} km direct (about ${etaMin} min)`;
  const rangeKm = ((state.kpis.avgSoc ?? 100) / 100) * FULL_RANGE_KM;
  const canReach = rangeKm > depot.km * ROAD_FACTOR * 1.2;

  switch (state.severity) {
    case 'critical':
      return {
        tone: 'critical',
        headline: stopped ? 'Stopped safely. Do not drive.' : 'Stop the bus safely now.',
        detail: `Request recovery to ${where}. Evacuate passengers if temperature keeps rising.`,
        depot,
      };
    case 'warning':
      return {
        tone: 'warning',
        headline: canReach ? `Return to ${depot.name}` : 'Not enough charge to reach a depot',
        detail: canReach ? `${where}. Reduce load on the way.` : `Estimated range ~${Math.round(rangeKm)} km. Request a tow to ${where}.`,
        depot,
      };
    case 'data_fault':
      return {
        tone: 'data_fault',
        headline: 'Continue with caution',
        detail: `Sensors unverified. Schedule a sensor check at ${where} at end of shift.`,
        depot,
      };
    default:
      return { tone: 'normal', headline: 'In service', detail: `Nearest depot: ${where}.`, depot: null };
  }
}

/** Map-ready view of one bus at the current frame. */
export function locateBus(route: Route, index: number, timeline: Timeline, frame: number) {
  const state = timeline.states[Math.min(frame, timeline.states.length - 1)];
  const { at, stoppedAt } = busPosition(route, index, timeline, frame);
  return { at, stoppedAt, state, guidance: guidanceFor(state, at, stoppedAt !== null) };
}
