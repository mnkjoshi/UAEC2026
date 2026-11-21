import { useEffect, useRef } from 'react';
import { LayoutGroup, motion } from 'motion/react';
import { SEVERITY_RANK, type Severity } from '../../core';
import { SEVERITY_META, fmtTime } from '../format';
import { busState, fleetLength, useFleet, type Bus } from '../fleetStore';
import { heatColor } from '../heat';
import { spring, springSlow } from '../motion';
import { useDashboard } from '../store';
import { AnimatedNumber } from './AnimatedNumber';
import { Icon } from './Icon';
import { Logo } from './Logo';
import { StatusBadge } from './StatusBadge';

type BusRow = { bus: Bus; state: ReturnType<typeof busState> };

/** Buses are grouped by what the operator has to do about them. */
const GROUPS: Array<{ key: string; title: string; empty: string; match: (s: Severity) => boolean }> = [
  { key: 'action', title: 'Needs action', empty: 'No bus has a battery hazard.', match: (s) => s === 'critical' || s === 'warning' },
  { key: 'sensor', title: 'Sensor or data issues', empty: 'All sensors reporting.', match: (s) => s === 'data_fault' },
  { key: 'normal', title: 'Operating normally', empty: 'No bus is fully normal.', match: (s) => s === 'normal' || s === 'advisory' },
];

const SEGMENTS: Severity[] = ['critical', 'warning', 'data_fault', 'normal'];

/**
 * Fleet overview: every bus's pack at the same moment, grouped by what needs doing.
 * As playback runs, a bus that develops a fault glides from one group into another.
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

  const rows: BusRow[] = buses
    .map((bus) => ({ bus, state: busState(bus, cursor) }))
    .sort((a, b) => SEVERITY_RANK[b.state.severity] - SEVERITY_RANK[a.state.severity] || a.bus.name.localeCompare(b.bus.name));

  const count = (s: Severity) => rows.filter((r) => r.state.severity === s || (s === 'normal' && r.state.severity === 'advisory')).length;
  const critical = count('critical');
  const warning = count('warning');
  const dataFault = count('data_fault');
  const worst = rows[0]?.state.severity ?? 'normal';
  const now = rows[0]?.state.timestamp;
  const headline = critical
    ? `${critical} bus${critical > 1 ? 'es need' : ' needs'} immediate action`
    : warning
      ? `${warning} bus${warning > 1 ? 'es have' : ' has'} a developing problem`
      : dataFault
        ? 'Fleet safe. Some sensors need attention.'
        : 'Every bus is operating normally';

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
        <motion.section
          className={`fleet-summary sev-${worst}`}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={springSlow}
          aria-live="polite"
        >
          <div className="fleet-summary-text">
            <motion.h1 key={headline} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
              {headline}
            </motion.h1>
            <p className="muted">
              {buses.length} buses monitored · telemetry {fmtTime(now)}
            </p>
          </div>
          <div className="fleet-bar" role="img" aria-label="Fleet status breakdown">
            {SEGMENTS.map((s) => {
              const n = count(s);
              return (
                <motion.div
                  key={s}
                  className={`seg sev-${s}${n ? '' : ' empty'}`}
                  animate={{ flexGrow: n, opacity: n ? 1 : 0 }}
                  transition={spring}
                  style={{ flexBasis: 0 }}
                >
                  {n > 0 && (
                    <span>
                      <AnimatedNumber value={n} digits={0} /> {SEVERITY_META[s].label.toLowerCase()}
                    </span>
                  )}
                </motion.div>
              );
            })}
          </div>
        </motion.section>

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
            <span className="pb-time">{fmtTime(now)}</span>
            <span className="muted">
              {cursor + 1}/{last + 1}
            </span>
          </div>
        </section>

        <LayoutGroup>
          {GROUPS.map((g) => {
            const items = rows.filter((r) => g.match(r.state.severity));
            return (
              <motion.section key={g.key} layout transition={spring} className="fleet-group" aria-label={g.title}>
                <motion.h2 layout="position" transition={spring}>
                  {g.title} <span className="count">{items.length}</span>
                </motion.h2>
                {items.length === 0 ? (
                  <motion.p layout className="fleet-empty muted" transition={spring}>
                    {g.empty}
                  </motion.p>
                ) : (
                  <div className="fleet-grid">
                    {items.map((r, i) => (
                      <BusCard key={r.bus.id} row={r} index={i} onOpen={() => openBus(r.bus.id)} />
                    ))}
                  </div>
                )}
              </motion.section>
            );
          })}
        </LayoutGroup>
      </main>
    </div>
  );
}

function BusCard({ row: { bus, state }, index, onOpen }: { row: BusRow; index: number; onOpen: () => void }) {
  const top = state.alerts[0];
  const k = state.kpis;
  // Series order snakes: top row M01→M06, bottom row M12→M07 (as drawn on the landing page).
  const ordered = [...state.modules.slice(0, 6), ...state.modules.slice(6).reverse()];

  return (
    <motion.button
      type="button"
      layoutId={bus.id}
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...spring, delay: Math.min(index, 8) * 0.04 }}
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.985 }}
      className={`bus-card sev-${state.severity}`}
      onClick={onOpen}
      aria-label={`Open ${bus.name}: ${SEVERITY_META[state.severity].label}${top ? `, ${top.title}` : ''}`}
    >
      <div className="bus-head">
        <div>
          <div className="bus-name">{bus.name}</div>
          <div className="bus-route">{bus.route}</div>
        </div>
        <StatusBadge severity={state.severity} />
      </div>

      <div className="bus-pack" aria-hidden>
        {ordered.map((m) => {
          const flagged = m.severity !== 'normal' && m.severity !== 'advisory';
          return (
            <span
              key={m.id}
              className={`bus-cell${flagged ? ` flagged sev-${m.severity}` : ''}${m.temperature === null ? ' nodata' : ''}`}
              style={{ ['--heat' as string]: m.temperature === null ? 'transparent' : heatColor(m.temperature) }}
              title={`${m.id}: ${m.temperature === null ? 'no data' : `${m.temperature.toFixed(1)} °C`}`}
            />
          );
        })}
      </div>

      <div className="bus-alert">
        {top ? (
          <>
            <div className="bus-alert-title">
              {top.title}
              <span className="muted"> · {top.moduleIds.length > 4 ? `${top.moduleIds.length} modules` : top.moduleIds.join(', ')}</span>
              {state.alerts.length > 1 && <span className="muted"> · +{state.alerts.length - 1} more</span>}
            </div>
            {top.forecast && <div className="bus-forecast">{top.forecast}</div>}
          </>
        ) : (
          <div className="muted">No active alerts</div>
        )}
      </div>

      <div className="bus-kpis">
        <span>
          <small>Max temp</small>
          <AnimatedNumber value={k.maxTemp?.value} digits={1} unit="°C" />
        </span>
        <span>
          <small>Min voltage</small>
          <AnimatedNumber value={k.minVolt?.value} digits={3} unit="V" />
        </span>
        <span>
          <small>SOC</small>
          <AnimatedNumber value={k.avgSoc} digits={0} unit="%" />
        </span>
        <span>
          <small>Sensors</small>
          {k.reportingModules}/{k.totalModules}
        </span>
      </div>
    </motion.button>
  );
}
