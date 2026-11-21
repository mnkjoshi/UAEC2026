import { useRef } from 'react';
import { useFleet } from '../fleetStore';
import { useDashboard, type ScenarioEntry } from '../store';
import { PackHero } from './PackHero';

/** Opening page: what the tool does, shown live, and the two ways in (your CSV or a scenario). */
export function Landing() {
  const scenarios = useDashboard((s) => s.scenarios);
  const loadScenario = useDashboard((s) => s.loadScenario);
  const fileInput = useRef<HTMLInputElement>(null);
  const provided = scenarios.filter((s) => s.source === 'provided');
  const generated = scenarios.filter((s) => s.source !== 'provided');
  const featured = scenarios.find((s) => s.id === 'thermal_propagation') ?? scenarios.find((s) => s.id === 'thermal_rise');

  /** One file opens the pack dashboard; several open the fleet view (one bus per file). */
  const openFiles = async (files: File[]) => {
    if (files.length > 1) useFleet.getState().loadFiles(files);
    else if (files[0]) useDashboard.getState().loadCsvText(await files[0].text(), files[0].name);
  };

  return (
    <div className="landing">
      <header className="l-nav">
        <span className="l-brand">
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
            <rect x="2" y="6" width="18" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
            <rect x="20" y="10" width="2.5" height="4" rx="1" fill="currentColor" />
            <path d="M11 8 L8 12.5 H11 L10 16 L14 11 H11 Z" fill="var(--l-hv)" />
          </svg>
          Battery Safety Monitor
        </span>
        <span className="l-nav-note">UAEC 2026 Programming</span>
      </header>

      <section className="l-hero">
        <div className="l-hero-text">
          <h1>Catch the failing module before it fails the bus.</h1>
          <p className="l-lede">
            Replay any battery telemetry file and see which of the pack's 12 modules is in trouble, why, how long until it turns
            critical, and what the driver should do about it.
          </p>
          <div className="l-actions">
            <button type="button" className="l-btn primary" onClick={() => fileInput.current?.click()}>
              Upload telemetry CSV
            </button>
            {featured && (
              <button type="button" className="l-btn" onClick={() => loadScenario(featured)}>
                Replay a thermal event
              </button>
            )}
            <button type="button" className="l-btn" onClick={() => useFleet.getState().loadDemoFleet(scenarios)}>
              Open demo fleet
            </button>
            <input
              ref={fileInput}
              type="file"
              accept=".csv,text/csv,text/plain"
              multiple
              hidden
              onChange={(e) => {
                openFiles([...(e.target.files ?? [])]);
                e.target.value = '';
              }}
            />
          </div>
          <p className="l-hint">Or drop a CSV anywhere on this page. Drop several to compare a fleet, one bus per file. Messy files are fine: problems are reported, not fatal.</p>
        </div>
        <PackHero />
      </section>

      <section className="l-path" aria-labelledby="path-title">
        <h2 id="path-title">How a reading becomes an alert</h2>
        <ol className="path">
          <li>
            <h3>Check the sensor</h3>
            <p>Missing, frozen, impossible or spiking readings are set aside as data faults, so a broken sensor never looks like a fire.</p>
          </li>
          <li>
            <h3>Look three ways</h3>
            <p>Each module against safety limits, against the rest of the pack, and against its own rate of change.</p>
          </li>
          <li>
            <h3>Wait for proof</h3>
            <p>A problem has to persist before it alerts and recover with margin before it clears. Normal driving raises nothing.</p>
          </li>
          <li>
            <h3>Say what it means</h3>
            <p>Isolated hot cell, failing cooling loop, internal short or heat spreading from a named module, with a countdown and an action.</p>
          </li>
        </ol>
      </section>

      <section className="l-scenarios" aria-labelledby="scen-title">
        <div className="l-scen-head">
          <h2 id="scen-title">Replay a scenario</h2>
          <p>Five recordings from the competition dataset, and twelve stress tests we built to break the monitor.</p>
        </div>
        <ScenarioGroup title="Competition recordings" items={provided} onPick={loadScenario} />
        <ScenarioGroup title="Stress tests" items={generated} onPick={loadScenario} />
      </section>

      <footer className="l-foot">
        <span>Runs entirely in your browser. Telemetry never leaves this machine.</span>
        <span>University of Alberta Engineering Competition 2026</span>
      </footer>
    </div>
  );
}

function ScenarioGroup({ title, items, onPick }: { title: string; items: ScenarioEntry[]; onPick: (s: ScenarioEntry) => void }) {
  if (!items.length) return null;
  return (
    <div className="scen-group">
      <h3>{title}</h3>
      <ul>
        {items.map((s) => (
          <li key={s.id}>
            <button type="button" onClick={() => onPick(s)}>
              <span className="scen-name">{s.name}</span>
              <span className="scen-desc">{s.description}</span>
              <span className="scen-go">Replay</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
