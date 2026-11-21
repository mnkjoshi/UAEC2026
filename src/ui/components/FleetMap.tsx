import { useMemo, useState } from 'react';
import { SEVERITY_RANK } from '../../core';
import { locateBus, routeFor } from '../fleetGeo';
import { useFleet, type Bus } from '../fleetStore';
import { StatusBadge } from './StatusBadge';
import { TransitMap, type MapBus } from './TransitMap';

/**
 * The fleet's live map and driver guidance, side by side. Part of the fleet overview:
 * hovering a bus card highlights it here, and selecting guidance flies the map to that bus.
 */
export function FleetMap({ buses, cursor, onOpen }: { buses: Bus[]; cursor: number; onOpen: (id: string) => void }) {
  const focusId = useFleet((s) => s.focusId);
  const setFocus = useFleet((s) => s.setFocus);
  const [fly, setFly] = useState<{ id: string; nonce: number } | null>(null);

  const routes = useMemo(() => buses.map((b, i) => routeFor(b.route, i)), [buses]);
  const located = buses.map((bus, i) => ({ bus, ...locateBus(routes[i], i, bus.timeline, cursor), path: routes[i].path }));
  const ranked = [...located].sort(
    (a, b) => SEVERITY_RANK[b.state.severity] - SEVERITY_RANK[a.state.severity] || a.bus.name.localeCompare(b.bus.name),
  );
  const mapBuses: MapBus[] = located.map((l) => ({
    id: l.bus.id,
    label: l.bus.name.replace(/^Bus\s+/i, ''),
    path: l.path,
    at: l.at,
    severity: l.state.severity,
    depotAt: l.guidance.depot?.at ?? null,
    tone: l.guidance.tone,
  }));

  return (
    <section className="fleet-map-layout" aria-label="Fleet map and driver guidance">
      <TransitMap buses={mapBuses} focusId={focusId} flyTo={fly} onSelect={onOpen} className="fleet-map" />

      <aside className="map-panel" aria-label="Driver guidance">
        <h2>Driver guidance</h2>
        <ul>
          {ranked.map((l) => (
            <li
              key={l.bus.id}
              className={`guide sev-${l.guidance.tone}${focusId === l.bus.id ? ' focused' : ''}`}
              onMouseEnter={() => setFocus(l.bus.id)}
              onMouseLeave={() => setFocus(null)}
            >
              <button
                type="button"
                className="guide-main"
                onClick={() => setFly({ id: l.bus.id, nonce: Date.now() })}
                title="Show on map"
              >
                <span className="guide-top">
                  <span className="guide-name">{l.bus.name}</span>
                  <StatusBadge severity={l.state.severity} />
                </span>
                {l.state.alerts[0] && <span className="guide-alert">{l.state.alerts[0].title}</span>}
                <span className="guide-head">{l.guidance.headline}</span>
                <span className="guide-detail">{l.guidance.detail}</span>
              </button>
              <button type="button" className="btn ghost small" onClick={() => onOpen(l.bus.id)}>
                Open pack
              </button>
            </li>
          ))}
        </ul>
      </aside>
    </section>
  );
}
