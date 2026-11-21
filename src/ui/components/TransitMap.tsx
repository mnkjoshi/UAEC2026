import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Severity } from '../../core';
import { COLORS } from '../charts';
import { DEPOTS, type LatLng } from '../fleetGeo';

/** One bus as the map needs it. */
export interface MapBus {
  id: string;
  label: string;
  path: LatLng[];
  at: LatLng;
  severity: Severity;
  /** Guidance line to a garage, coloured by tone; null for buses that need nothing. */
  depotAt: LatLng | null;
  tone: Severity;
}

interface TransitMapProps {
  buses: MapBus[];
  /** Highlighted bus (bigger marker, label always shown). */
  focusId?: string | null;
  /** Change the nonce to fly the camera to a bus. */
  flyTo?: { id: string; nonce: number } | null;
  onSelect?: (id: string) => void;
  /** 'all' fits every route and garage; 'bus' fits the first bus's route and its garage. */
  fit?: 'all' | 'bus';
  className?: string;
}

const TWEEN_MS = 800;
const EDMONTON: LatLng = [53.535, -113.5];

/**
 * Leaflet map of Edmonton shared by the fleet overview and the pack dashboard:
 * the four ETS garages, each bus's simulated route and position (gliding between frames),
 * and a dashed guidance line from any bus that needs attention to its nearest garage.
 */
export function TransitMap({ buses, focusId = null, flyTo = null, onSelect, fit = 'all', className }: TransitMapProps) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layers = useRef(new Map<string, { marker: L.CircleMarker; line: L.Polyline; route: L.Polyline; at: LatLng }>());
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const [tilesFailed, setTilesFailed] = useState(false);

  // Rebuild only when the set of buses or their routes changes.
  const structureKey = buses.map((b) => `${b.id}:${b.path.length}:${b.path[1]?.join(',')}`).join('|');

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

    DEPOTS.forEach((d) =>
      L.marker(d.at, {
        icon: L.divIcon({
          className: 'depot-pin',
          html: `<span class="depot-dot"></span><span class="depot-name">${d.name}</span>`,
          iconSize: [0, 0],
        }),
        title: `${d.name}, ${d.address}`,
        keyboard: false,
      }).addTo(map),
    );

    const store = layers.current;
    buses.forEach((b) => {
      const route = L.polyline(b.path, { color: '#4a5d70', weight: 3, opacity: 0.5, interactive: false }).addTo(map);
      const line = L.polyline([b.at, b.at], { weight: 2, dashArray: '6 6', opacity: 0, interactive: false }).addTo(map);
      const marker = L.circleMarker(b.at, { radius: 9, weight: 2, color: '#e9eef2', fillOpacity: 1, className: 'bus-marker' })
        .bindTooltip(b.label, { permanent: true, direction: 'right', offset: [10, 0], className: 'bus-tip' })
        .on('click', () => onSelectRef.current?.(b.id))
        .addTo(map);
      store.set(b.id, { marker, line, route, at: b.at });
    });

    const points =
      fit === 'bus' && buses[0]
        ? [...buses[0].path, ...(buses[0].depotAt ? [buses[0].depotAt] : []), nearestOf(buses[0].at)]
        : [...buses.flatMap((b) => b.path), ...DEPOTS.map((d) => d.at)];
    if (points.length) map.fitBounds(L.latLngBounds(points), { padding: [24, 24] });

    return () => {
      map.remove();
      mapRef.current = null;
      store.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- structureKey captures buses/routes
  }, [structureKey, fit]);

  // Glide markers to their new positions, recolour them and update guidance lines.
  const stateKey = buses.map((b) => `${b.id}:${b.at.join(',')}:${b.severity}:${b.tone}:${b.depotAt?.join(',')}`).join('|') + `|${focusId}`;
  useEffect(() => {
    const frames: number[] = [];
    for (const b of buses) {
      const entry = layers.current.get(b.id);
      if (!entry) continue;
      const focused = b.id === focusId;
      entry.marker.setStyle({ fillColor: COLORS.severity[b.severity], radius: focused ? 13 : b.severity === 'normal' ? 8 : 10, weight: focused ? 3 : 2 });
      entry.marker.getElement()?.classList.toggle('critical', b.severity === 'critical');
      entry.route.setStyle({ color: focused ? '#7d93a8' : '#4a5d70', opacity: focused ? 0.9 : 0.5 });
      const quiet = !focused && (b.severity === 'normal' || b.severity === 'advisory');
      entry.marker.getTooltip()?.getElement()?.classList.toggle('quiet', quiet);
      if (focused) entry.marker.bringToFront();

      const from = entry.at;
      const to = b.at;
      const start = performance.now();
      const step = (now: number) => {
        const k = Math.min(1, (now - start) / TWEEN_MS);
        const e = 1 - (1 - k) ** 3;
        const p: LatLng = [from[0] + (to[0] - from[0]) * e, from[1] + (to[1] - from[1]) * e];
        entry.marker.setLatLng(p);
        if (b.depotAt) entry.line.setLatLngs([p, b.depotAt]);
        if (k < 1) frames.push(requestAnimationFrame(step));
      };
      frames.push(requestAnimationFrame(step));
      entry.at = to;
      entry.line.setStyle(b.depotAt ? { color: COLORS.severity[b.tone], opacity: 0.9 } : { opacity: 0 });
    }
    return () => frames.forEach(cancelAnimationFrame);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stateKey captures every value read
  }, [stateKey]);

  useEffect(() => {
    if (!flyTo || !mapRef.current) return;
    const b = buses.find((x) => x.id === flyTo.id);
    if (b) mapRef.current.flyTo(b.at, 13, { duration: 0.8 });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fly only when asked
  }, [flyTo?.nonce]);

  return (
    <div className={`transit-map${className ? ` ${className}` : ''}`}>
      <div ref={el} className="transit-map-canvas" role="application" aria-label="Map of simulated bus positions and ETS garages in Edmonton" />
      <div className="map-note">
        Simulated bus positions. ETS garages at their real locations. Distances are straight-line.
        {tilesFailed && ' Street map unavailable offline.'}
      </div>
    </div>
  );
}

function nearestOf(at: LatLng): LatLng {
  return DEPOTS.map((d) => d.at).sort((a, b) => (a[0] - at[0]) ** 2 + (a[1] - at[1]) ** 2 - ((b[0] - at[0]) ** 2 + (b[1] - at[1]) ** 2))[0];
}
