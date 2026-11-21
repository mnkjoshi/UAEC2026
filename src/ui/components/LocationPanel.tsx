import { fmtTime } from '../format';
import { useBusLocation } from '../hooks';
import { Icon } from './Icon';
import { TransitMap } from './TransitMap';

/**
 * Where this bus is (simulated) and what the driver should do about the pack's condition:
 * the bus on its route, the nearest ETS garage, and plain-language guidance, all in step
 * with playback.
 */
export function LocationPanel() {
  const loc = useBusLocation();
  if (!loc) return null;
  const { ctx, route, at, state, stoppedAt, guidance } = loc;
  const depot = guidance.depot;

  return (
    <section className="panel location-panel" aria-label="Location and driver guidance">
      <header className="panel-head">
        <h2>Location</h2>
        <span className="muted small">
          {ctx.name} · {ctx.routeLabel}
        </span>
      </header>
      <TransitMap
        fit="bus"
        className="location-map"
        buses={[
          {
            id: 'this-bus',
            label: ctx.name === 'Simulated bus' ? 'Bus' : ctx.name.replace(/^Bus\s+/i, ''),
            path: route.path,
            at,
            severity: state.severity,
            depotAt: depot?.at ?? null,
            tone: guidance.tone,
          },
        ]}
      />
      <div className={`location-guide sev-${guidance.tone}`}>
        <div className="location-status">
          <Icon name={stoppedAt ? 'pause' : 'play'} size={12} />
          {stoppedAt ? `Pulled over at ${fmtTime(stoppedAt)}` : 'In service, moving'}
        </div>
        <div className="location-head">{guidance.headline}</div>
        <div className="location-detail">{guidance.detail}</div>
        <div className="location-disclaimer">Simulated position: the telemetry has no GPS. Garages are the real ETS facilities; distances are straight-line.</div>
      </div>
    </section>
  );
}
