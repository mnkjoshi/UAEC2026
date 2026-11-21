import { useRef } from 'react';
import { useFleet } from '../fleetStore';
import { useDashboard, type ScenarioEntry } from '../store';
import { Icon } from './Icon';
import { Logo } from './Logo';
import { PackHero } from './PackHero';

/** Opening page: what Batter-eye does, shown live, and the ways in (a CSV, a fleet, or a scenario). */
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
        <Logo size={24} />
        <nav className="l-nav-links" aria-label="Sections">
          <a href="#how">How it works</a>
          <a href="#scenarios">Scenarios</a>
        </nav>
      </header>

      <section className="l-hero">
        <div className="l-hero-text">
          <h1>Battery safety monitoring for electric bus fleets.</h1>
          <p className="l-lede">
            Batter-eye reads battery telemetry and shows, for each of a pack's twelve modules, whether it is safe, what is going wrong,
            how long until it becomes critical, and what the driver should do.
          </p>
          <div className="l-actions">
            <button type="button" className="l-btn primary" onClick={() => fileInput.current?.click()}>
              <Icon name="upload" size={16} /> Upload telemetry
            </button>
            <button type="button" className="l-btn" onClick={() => useFleet.getState().loadDemoFleet(scenarios)}>
              <Icon name="fleet" size={16} /> Open demo fleet
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
          <p className="l-hint">
            CSV files can also be dropped anywhere on this page. Several files open as a fleet, one bus per file.
            {featured && (
              <>
                {' '}
                <button type="button" className="l-link" onClick={() => loadScenario(featured)}>
                  Replay a thermal event
                </button>
                .
              </>
            )}
          </p>
        </div>
        <PackHero />
      </section>

      <section className="l-section" id="how" aria-labelledby="how-title">
        <h2 id="how-title">How a reading becomes an alert</h2>
        <ol className="l-steps">
          <li>
            <h3>Check the sensor</h3>
            <p>Missing, frozen, impossible and spiking readings are set aside as data faults, so a failed sensor is never mistaken for a fire.</p>
          </li>
          <li>
            <h3>Compare three ways</h3>
            <p>Each module is measured against safety limits, against the rest of the pack, and against its own rate of change.</p>
          </li>
          <li>
            <h3>Require persistence</h3>
            <p>A condition must hold before it alerts and recover with margin before it clears. Normal operation raises nothing.</p>
          </li>
          <li>
            <h3>Explain and advise</h3>
            <p>Each alert names the likely cause, the affected modules, the time remaining to a critical limit, and the action to take.</p>
          </li>
        </ol>
      </section>

      <section className="l-section" id="scenarios" aria-labelledby="scen-title">
        <div className="l-section-head">
          <h2 id="scen-title">Scenarios</h2>
          <p>Five recordings from the competition dataset and twelve stress tests built to challenge the detection logic.</p>
        </div>
        <ScenarioGroup title="Competition recordings" items={provided} onPick={loadScenario} />
        <ScenarioGroup title="Stress tests" items={generated} onPick={loadScenario} />
      </section>

      <footer className="l-foot">
        <Logo size={18} />
        <span>Runs entirely in the browser. Telemetry never leaves this machine.</span>
        <span>UAEC 2026, Programming</span>
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
              <span className="scen-go">
                Replay <Icon name="stepForward" size={14} />
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
