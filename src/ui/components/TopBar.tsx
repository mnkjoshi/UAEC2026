import { useRef } from 'react';
import { useFleet } from '../fleetStore';
import { contextForDataset, locationFor } from '../fleetGeo';
import { openIncidentReport } from '../report';
import { useDashboard } from '../store';
import { Icon } from './Icon';
import { Logo } from './Logo';

/**
 * Brand, data source (built-in scenario or uploaded CSV, or the bus being viewed in fleet mode),
 * incident report, alerting options and settings.
 */
export function TopBar() {
  const scenarios = useDashboard((s) => s.scenarios);
  const sourceName = useDashboard((s) => s.sourceName);
  const soundOn = useDashboard((s) => s.soundOn);
  const desktopAlerts = useDashboard((s) => s.desktopAlerts);
  const loading = useDashboard((s) => s.loading);
  const { loadScenario, toggleSound, toggleDesktopAlerts, setSettingsOpen } = useDashboard.getState();
  const fleetActive = useFleet((s) => s.active);
  const fileInput = useRef<HTMLInputElement>(null);
  const current = scenarios.find((s) => s.name === sourceName);

  const groups = [
    { label: 'Provided datasets', items: scenarios.filter((s) => s.source === 'provided') },
    { label: 'Generated test scenarios', items: scenarios.filter((s) => s.source !== 'provided') },
  ].filter((g) => g.items.length);

  const goHome = () => (fleetActive ? useFleet.getState().exitFleet() : useDashboard.getState().unload());

  const report = () => {
    const s = useDashboard.getState();
    if (!s.dataset || !s.timeline) return;
    const location = locationFor(s.timeline, s.cursor, s.busContext ?? contextForDataset(s.sourceName ?? ''));
    openIncidentReport(s.dataset, s.timeline, s.cursor, s.config, s.sourceName ?? 'Dataset', location);
  };

  return (
    <header className="topbar">
      <button type="button" className="brand" onClick={goHome} title="Back to start">
        <Logo subtitle="Battery safety monitoring" />
      </button>

      <div className="topbar-controls">
        {fleetActive ? (
          <>
            <button type="button" className="btn ghost" onClick={() => useFleet.getState().backToFleet()}>
              <Icon name="arrowLeft" size={14} /> Fleet
            </button>
            <span className="viewing">{sourceName}</span>
          </>
        ) : (
          <>
            <label className="source">
              <span className="sr-only">Data source</span>
              <select
                value={current?.id ?? ''}
                onChange={(e) => {
                  const entry = scenarios.find((s) => s.id === e.target.value);
                  if (entry) loadScenario(entry);
                }}
                aria-label="Choose a scenario"
              >
                <option value="" disabled>
                  {sourceName && !current ? `Uploaded: ${sourceName}` : 'Choose a scenario…'}
                </option>
                {groups.map((g) => (
                  <optgroup key={g.label} label={g.label}>
                    {g.items.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
            <button type="button" className="btn primary" onClick={() => fileInput.current?.click()} disabled={loading}>
              <Icon name="upload" size={15} /> Upload CSV
            </button>
            <input
              ref={fileInput}
              type="file"
              accept=".csv,text/csv,text/plain"
              hidden
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file) useDashboard.getState().loadCsvText(await file.text(), file.name);
                e.target.value = '';
              }}
            />
          </>
        )}

        <span className="topbar-divider" aria-hidden />
        <button type="button" className="btn ghost" onClick={report} title="Printable report of everything up to the current moment">
          <Icon name="report" size={16} /> Report
        </button>
        <button type="button" className="btn ghost" onClick={() => setSettingsOpen(true)} title="Detection thresholds">
          <Icon name="sliders" size={16} /> Thresholds
        </button>
        <button
          type="button"
          className={`btn ghost icon-only${soundOn ? ' on' : ''}`}
          onClick={toggleSound}
          aria-pressed={soundOn}
          aria-label="Audible alarm for new critical alerts"
          title={soundOn ? 'Alarm sound on' : 'Alarm sound off'}
        >
          <Icon name={soundOn ? 'bell' : 'bellOff'} size={17} />
        </button>
        <button
          type="button"
          className={`btn ghost icon-only${desktopAlerts ? ' on' : ''}`}
          onClick={toggleDesktopAlerts}
          aria-pressed={desktopAlerts}
          aria-label="Desktop notifications for new critical alerts"
          title={desktopAlerts ? 'Desktop notifications on' : 'Desktop notifications off'}
        >
          <Icon name="monitor" size={17} />
        </button>
      </div>
    </header>
  );
}
