import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { SEVERITY_RANK } from '../../core';
import { COLORS } from '../charts';
import { DEPOTS, locateBus, routeFor, type LatLng } from '../fleetGeo';
import type { Bus } from '../fleetStore';
import { StatusBadge } from './StatusBadge';

const EDMONTON: LatLng = [53.535, -113.5];
const TWEEN_MS = 800;

/**
 * Fleet map: simulated bus positions on Edmonton, coloured by pack status, with a line to
 * the nearest depot for any bus that needs attention and plain-language guidance beside it.
 */
export function FleetMap({ buses, cursor, onOpen }: { buses: Bus[]; cursor: number; onOpen: (id: string) => void }) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markers = useRef(new Map<string, { marker: L.CircleMarker; line: L.Polyline; at: LatLng }>());
  const [tilesFailed, setTilesFailed] = useState(false);
  const [focus, setFocus] = useState<string | null>(null);

  const routes = useMemo(() => buses.map((b, i) => routeFor(b.route, i)), [buses]);
  const located = buses.map((bus, i) => ({ bus, ...locateBus(routes[i], i, bus.timeline, cursor) }));
  const ranked = [...located].sort(
    (a, b) => SEVERITY_RANK[b.state.severity] - SEVERITY_RANK[a.state.severity] || a.bus.name.localeCompare(b.bus.name),
  );

  // Build the map once per fleet: tiles, routes, depots, and one marker + guidance line per bus.
  useEffect(() => {
    if (!el.current) return;
    const map = L.map(el.current, { zoomControl: true, attributionControl: true, scrollWheelZoom: false, zoomSnap: 0.25 }).setView(EDMONTON, 11);
    mapRef.current = map;
    // Standard OpenStreetMap tiles (no API key); darkened with a CSS filter to match the app.
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      className: 'tiles-dark',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    })
      .on('tileerror', () => setTilesFailed(true))
      .addTo(map);

    routes.forEach((r) => L.polyline(r.path, { color: '#4a5d70', weight: 3, opacity: 0.55, interactive: false }).addTo(map));

    DEPOTS.forEach((d) =>
      L.marker(d.at, {
        icon: L.divIcon({
          className: 'depot-pin',
          html: `<span class="depot-dot"></span><span class="depot-name">${d.name}</span>`,
          iconSize: [0, 0],
        }),
        keyboard: false,
      }).addTo(map),
    );

    const store = markers.current;
    buses.forEach((bus) => {
      const line = L.polyline([EDMONTON, EDMONTON], { color: COLORS.severity.warning, weight: 2, dashArray: '6 6', opacity: 0 }).addTo(map);
      const marker = L.circleMarker(EDMONTON, { radius: 9, weight: 2, color: '#e9eef2', fillOpacity: 1, className: 'bus-marker' })
        .bindTooltip(bus.name.replace(/^Bus\s+/i, ''), { permanent: true, direction: 'right', offset: [10, 0], className: 'bus-tip' })
        .on('click', () => onOpen(bus.id))
        .addTo(map);
      store.set(bus.id, { marker, line, at: EDMONTON });
    });

    const all = routes.flatMap((r) => r.path).concat(DEPOTS.map((d) => d.at));
    map.fitBounds(L.latLngBounds(all), { padding: [16, 16] });

    return () => {
      map.remove();
      mapRef.current = null;
      store.clear();
    };
    // onOpen is stable enough for a demo; rebuilding the map on every render would reset the view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buses, routes]);

  // Move markers to the current frame (glide between positions), recolour, and draw guidance lines.
  const key = located.map((l) => `${l.bus.id}:${l.at.join(',')}:${l.state.severity}`).join('|');
  useEffect(() => {
    const frames: number[] = [];
    for (const l of located) {
      const entry = markers.current.get(l.bus.id);
      if (!entry) continue;
      const color = COLORS.severity[l.state.severity];
      entry.marker.setStyle({ fillColor: color, radius: l.state.severity === 'normal' ? 8 : 10 });
      entry.marker.getElement()?.classList.toggle('critical', l.state.severity === 'critical');
      // Only buses that need attention keep a permanent label; the rest show theirs on hover.
      entry.marker.getTooltip()?.getElement()?.classList.toggle('quiet', l.state.severity === 'normal' || l.state.severity === 'advisory');

      const from = entry.at;
      const to = l.at;
      const startT = performance.now();
      const step = (now: number) => {
        const k = Math.min(1, (now - startT) / TWEEN_MS);
        const e = 1 - (1 - k) ** 3; // ease-out
        const p: LatLng = [from[0] + (to[0] - from[0]) * e, from[1] + (to[1] - from[1]) * e];
        entry.marker.setLatLng(p);
        if (l.guidance.depot) entry.line.setLatLngs([p, l.guidance.depot.at]);
        if (k < 1) frames.push(requestAnimationFrame(step));
      };
      frames.push(requestAnimationFrame(step));
      entry.at = to;

      if (l.guidance.depot) {
        entry.line.setStyle({ color: COLORS.severity[l.guidance.tone], opacity: 0.9 });
      } else {
        entry.line.setStyle({ opacity: 0 });
      }
    }
    return () => frames.forEach(cancelAnimationFrame);
    // `key` captures every value the effect reads from `located`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const flyTo = (id: string) => {
    const l = located.find((x) => x.bus.id === id);
    if (!l || !mapRef.current) return;
    setFocus(id);
    mapRef.current.flyTo(l.at, 13, { duration: 0.8 });
  };

  return (
    <div className="fleet-map-layout">
      <div className="fleet-map-wrap">
        <div ref={el} className="fleet-map" role="application" aria-label="Map of simulated bus positions in Edmonton" />
        <div className="map-note">
          Simulated positions and illustrative depots. Distances are straight-line.
          {tilesFailed && ' Map tiles unavailable offline; showing routes only.'}
        </div>
      </div>

      <aside className="map-panel" aria-label="Driver guidance">
        <h2>Driver guidance</h2>
        <ul>
          {ranked.map((l) => (
            <li key={l.bus.id} className={`guide sev-${l.guidance.tone}${focus === l.bus.id ? ' focused' : ''}`}>
              <button type="button" className="guide-main" onClick={() => flyTo(l.bus.id)} title="Show on map">
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
    </div>
  );
}
