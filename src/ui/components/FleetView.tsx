import { useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { SEVERITY_RANK, type Severity } from '../../core';
import { SEVERITY_META, fmt, fmtTime } from '../format';
import { busState, fleetLength, useFleet, type Bus } from '../fleetStore';
import { spring } from '../motion';
import { useDashboard } from '../store';
import { Icon } from './Icon';
import { Logo } from './Logo';
import { StatusBadge } from './StatusBadge';

/** Heat colour for the mini pack strip (same scale as the landing page). */
function heat(temp: number | null): string {
  if (temp === null) return 'var(--sev-data-fault)';
  const x = Math.max(0, Math.min(1, (temp - 30) / 25));
  if (x < 0.25) return '#5cc8d6';
  if (x < 0.55) return '#c9a35a';
  return x < 0.85 ? '#f2a53a' : '#ff3b30';
}

/**
 * Fleet overview: every bus's pack at the same moment, most urgent first.
 * One glance answers "which bus do I deal with now?"; click a bus for the full dashboard.
 */
export function FleetView() {
  const buses = useFleet((s) => s.buses);
  const cursor = useFleet((s) => s.cursor);
  const playing = useFleet((s) => s.playing);
  const error = useFleet((s) => s.error);
  const { setCursor, setPlaying, openBus, exitFleet, loadFiles } = useFleet.getState();
  const speed = useDashboard((s) => s.speed);
  const fileInput = useRef<HTMLInputElement>(null);
  const last = fleetLength(buses) - 1;
  const intervalSec = buses[0]?.dataset.quality.intervalSec || 10;

  // Synchronised playback across all buses.
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      const s = useFleet.getState();
      if (s.cursor >= fleetLength(s.buses) - 1) useFleet.setState({ playing: false });
      else s.setCursor(s.cursor + 1);
    }, Math.max(50, (intervalSec * 1000) / speed));
    return () => window.clearInterval(id);
  }, [playing, speed, intervalSec]);

  const rows = buses
    .map((bus) => ({ bus, state: busState(bus, cursor) }))
    .sort((a, b) => SEVERITY_RANK[b.state.severity] - SEVERITY_RANK[a.state.severity] || a.bus.name.localeCompare(b.bus.name));

  const counts = rows.reduce<Record<Severity, number>>(
    (acc, r) => ({ ...acc, [r.state.severity]: acc[r.state.severity] + 1 }),
    { normal: 0, advisory: 0, data_fault: 0, warning: 0, critical: 0 },
  );
  const worst = rows[0]?.state.severity ?? 'normal';
  const now = rows[0]?.state.timestamp;

  return (
    <div className="fleet">
      <header className="topbar">
        <button type="button" className="brand" onClick={exitFleet} title="Back to start">
          <Logo subtitle={`Fleet overview, ${buses.length} buses`} />
        </button>
        <div className="topbar-controls">
          <button type="button" className="btn" onClick={() => fileInput.current?.click()}>
            <Icon name="upload" size={14} /> Load bus CSVs
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".csv,text/csv,text/plain"
            multiple
            hidden
            onChange={(e) => {
              const files = [...(e.target.files ?? [])];
              if (files.length) loadFiles(files);
              e.target.value = '';
            }}
          />
        </div>
      </header>
      {error && <div className="error-bar">{error}</div>}

      <main className="fleet-main">
        <section className={`fleet-summary sev-${worst}`} aria-live="polite">
          <div>
            <div className="fleet-headline">
              {counts.critical
                ? `${counts.critical} bus${counts.critical > 1 ? 'es need' : ' needs'} immediate action`
                : counts.warning
                  ? `${counts.warning} bus${counts.warning > 1 ? 'es' : ''} with a developing problem`
                  : counts.data_fault
                    ? 'Fleet safe; some sensors need attention'
                    : 'Whole fleet normal'}
            </div>
            <div className="fleet-bar" role="img" aria-label="Fleet status breakdown">
              {(['critical', 'warning', 'data_fault', 'advisory', 'normal'] as Severity[])
                .filter((s) => counts[s])
                .map((s) => (
                  <span key={s} className={`seg sev-${s}`} style={{ flexGrow: counts[s] }}>
                    {counts[s]} {SEVERITY_META[s].label.toLowerCase()}
                  </span>
                ))}
            </div>
          </div>
          <div className="fleet-clock">
            <span className="muted">Telemetry time</span>
            <strong>{fmtTime(now)}</strong>
          </div>
        </section>

        <section className="playback" aria-label="Fleet playback">
          <div className="pb-buttons">
            <button type="button" className="btn icon" onClick={() => setCursor(0)} aria-label="Restart">
              <Icon name="restart" />
            </button>
            <button type="button" className="btn icon primary" onClick={() => setPlaying(!playing)} aria-label={playing ? 'Pause' : 'Play'}>
              <Icon name={playing ? 'pause' : 'play'} />
            </button>
            <button type="button" className="btn icon" onClick={() => { setCursor(last); setPlaying(false); }} aria-label="Jump to end">
              <Icon name="end" />
            </button>
          </div>
          <div className="pb-track">
            <input type="range" min={0} max={last} value={cursor} onChange={(e) => { setCursor(Number(e.target.value)); setPlaying(false); }} aria-label="Fleet timeline" />
          </div>
          <div className="pb-info">
            <span className="muted">
              {cursor + 1}/{last + 1}
            </span>
          </div>
        </section>

        <div className="fleet-grid">
          {rows.map(({ bus, state }) => (
            <BusCard key={bus.id} bus={bus} state={state} onOpen={() => openBus(bus.id)} />
          ))}
        </div>
      </main>
    </div>
  );
}

function BusCard({ bus, state, onOpen }: { bus: Bus; state: ReturnType<typeof busState>; onOpen: () => void }) {
  const top = state.alerts[0];
  const k = state.kpis;
  return (
    <motion.button
      type="button"
      layout
      transition={spring}
      whileTap={{ scale: 0.98 }}
      className={`bus-card sev-${state.severity}`}
      onClick={onOpen}
      aria-label={`Open ${bus.name}`}
    >
      <div className="bus-head">
        <div>
          <div className="bus-name">{bus.name}</div>
          <div className="muted small">{bus.route}</div>
        </div>
        <StatusBadge severity={state.severity} />
      </div>
      <div className="bus-pack" aria-hidden>
        {state.modules.map((m) => (
          <span
            key={m.id}
            className={`bus-cell${m.severity !== 'normal' && m.severity !== 'advisory' ? ' hot' : ''}`}
            style={{ background: heat(m.temperature), ['--ring' as string]: SEVERITY_META[m.severity].color }}
            title={`${m.id} ${fmt(m.temperature, 1, '°C')}`}
          />
        ))}
      </div>
      <div className="bus-alert">
        {top ? (
          <>
            <strong>{top.title}</strong>
            <span className="muted"> {top.moduleIds.length > 4 ? `${top.moduleIds.length} modules` : top.moduleIds.join(', ')}</span>
            {state.alerts.length > 1 && <span className="muted"> +{state.alerts.length - 1} more</span>}
          </>
        ) : (
          <span className="muted">No active alerts</span>
        )}
      </div>
      <div className="bus-kpis">
        <span>
          <small>Max temp</small>
          {fmt(k.maxTemp?.value, 1, '°C')}
        </span>
        <span>
          <small>Min voltage</small>
          {fmt(k.minVolt?.value, 3, 'V')}
        </span>
        <span>
          <small>SOC</small>
          {fmt(k.avgSoc, 0, '%')}
        </span>
        <span>
          <small>Sensors</small>
          {k.reportingModules}/{k.totalModules}
        </span>
      </div>
    </motion.button>
  );
}
