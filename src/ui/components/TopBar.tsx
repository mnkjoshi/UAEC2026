import { useRef } from 'react';
import { useFleet } from '../fleetStore';
import { openIncidentReport } from '../report';
import { useDashboard } from '../store';

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
    if (s.dataset && s.timeline) openIncidentReport(s.dataset, s.timeline, s.cursor, s.config, s.sourceName ?? 'Dataset');
  };

  return (
    <header className="topbar">
      <button type="button" className="brand" onClick={goHome} title="Back to start">
        <span className="brand-mark" aria-hidden>
          ⚡
        </span>
        <div>
          <div className="brand-name">Battery Safety Monitor</div>
          <div className="brand-sub">E-bus fleet · 12-module pack BMS</div>
        </div>
      </button>

      <div className="topbar-controls">
        {fleetActive ? (
          <>
            <button type="button" className="btn" onClick={() => useFleet.getState().backToFleet()}>
              ← Fleet
            </button>
            <span className="viewing">{sourceName}</span>
          </>
        ) : (
          <>
            <label className="source">
              <span className="muted">Data source</span>
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
              ⬆ Upload CSV
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

        <button type="button" className="btn" onClick={report} title="Printable report of everything up to the current moment">
          📄 Incident report
        </button>
        <button
          type="button"
          className={`btn${soundOn ? ' active' : ''}`}
          onClick={toggleSound}
          aria-pressed={soundOn}
          title="Audible alarm for new critical alerts"
        >
          {soundOn ? '🔔 Alarm on' : '🔕 Alarm off'}
        </button>
        <button
          type="button"
          className={`btn${desktopAlerts ? ' active' : ''}`}
          onClick={toggleDesktopAlerts}
          aria-pressed={desktopAlerts}
          title="Desktop notifications for new critical alerts"
        >
          {desktopAlerts ? '🖥 Desktop alerts on' : '🖥 Desktop alerts off'}
        </button>
        <button type="button" className="btn" onClick={() => setSettingsOpen(true)}>
          ⚙ Thresholds
        </button>
      </div>
    </header>
  );
}
