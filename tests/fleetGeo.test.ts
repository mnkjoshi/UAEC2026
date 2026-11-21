/** Simulated fleet geography: positions, nearest depot and driver guidance. */
import { describe, expect, it } from 'vitest';
import { busPosition, distanceKm, guidanceFor, nearestDepot, pointAlong, routeFor, DEPOTS, type LatLng } from '../src/ui/fleetGeo';
import { runScenarioFile } from './helpers';

const DOWNTOWN: LatLng = [53.5444, -113.4909];
const UNIVERSITY: LatLng = [53.5232, -113.5263];

describe('geometry', () => {
  it('measures downtown to the university at about 3 km', () => {
    expect(distanceKm(DOWNTOWN, UNIVERSITY)).toBeGreaterThan(2.5);
    expect(distanceKm(DOWNTOWN, UNIVERSITY)).toBeLessThan(3.5);
  });

  it('routes are closed loops and positions wrap around them', () => {
    const r = routeFor('Route 4 · University', 0);
    expect(r.path[0]).toEqual(r.path[r.path.length - 1]);
    expect(pointAlong(r, 0)).toEqual(pointAlong(r, r.lengthKm));
  });

  it('falls back to a route by index for uploaded buses', () => {
    expect(routeFor('Uploaded file 3', 2).lengthKm).toBeGreaterThan(0);
  });

  it('finds the nearest depot', () => {
    const d = DEPOTS[0];
    expect(nearestDepot(d.at).id).toBe(d.id);
  });
});

describe('simulated movement', () => {
  it('a normal bus keeps moving', () => {
    const tl = runScenarioFile('normal.csv');
    const r = routeFor('Route 9 · Downtown', 0);
    expect(busPosition(r, 0, tl, 5).at).not.toEqual(busPosition(r, 0, tl, 30).at);
  });

  it('a bus pulls over when a critical alert is raised and stays there', () => {
    const tl = runScenarioFile('thermal_rise.csv');
    const r = routeFor('Route 4 · University', 1);
    const late = tl.states.length - 1;
    const a = busPosition(r, 1, tl, late - 5);
    const b = busPosition(r, 1, tl, late);
    expect(a.stoppedAt).not.toBeNull();
    expect(b.at).toEqual(a.at);
  });
});

describe('driver guidance', () => {
  it('tells a critical bus to stop, not to drive to a depot', () => {
    const tl = runScenarioFile('thermal_rise.csv');
    const g = guidanceFor(tl.states[tl.states.length - 1], DOWNTOWN, true);
    expect(g.tone).toBe('critical');
    expect(g.headline).toMatch(/Stopped safely/);
  });

  it('sends a warning bus to the nearest depot with a distance', () => {
    const tl = runScenarioFile('whole_pack_heating.csv');
    const state = tl.states.find((s) => s.severity === 'warning')!;
    const g = guidanceFor(state, DOWNTOWN, false);
    expect(g.headline).toMatch(/Return to/);
    expect(g.detail).toMatch(/km direct/);
  });

  it('gives no depot line for a normal bus', () => {
    const tl = runScenarioFile('normal.csv');
    expect(guidanceFor(tl.states[0], DOWNTOWN, false).depot).toBeNull();
  });
});
