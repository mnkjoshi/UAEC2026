import { useRef } from 'react';
import { useDashboard } from '../store';

/** Brand, data source (built-in scenario or uploaded CSV), sound and settings. */
export function TopBar() {
  const scenarios = useDashboard((s) => s.scenarios);
  const sourceName = useDashboard((s) => s.sourceName);
  const soundOn = useDashboard((s) => s.soundOn);
  const loading = useDashboard((s) => s.loading);
  const { loadScenario, toggleSound, setSettingsOpen } = useDashboard.getState();
  const fileInput = useRef<HTMLInputElement>(null);
  const current = scenarios.find((s) => s.name === sourceName);

  const groups = [
    { label: 'Provided datasets', items: scenarios.filter((s) => s.source === 'provided') },
    { label: 'Generated test scenarios', items: scenarios.filter((s) => s.source !== 'provided') },
  ].filter((g) => g.items.length);

  return (
    <header className="topbar">
      <button type="button" className="brand" onClick={() => useDashboard.getState().unload()} title="Back to start">
        <span className="brand-mark" aria-hidden>
          ⚡
        </span>
        <div>
          <div className="brand-name">Battery Safety Monitor</div>
          <div className="brand-sub">E-bus fleet · 12-module pack BMS</div>
        </div>
      </button>

      <div className="topbar-controls">
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
        <button
          type="button"
          className={`btn${soundOn ? ' active' : ''}`}
          onClick={toggleSound}
          aria-pressed={soundOn}
          title="Audible alarm for new critical alerts"
        >
          {soundOn ? '🔔 Alarm on' : '🔕 Alarm off'}
        </button>
        <button type="button" className="btn" onClick={() => setSettingsOpen(true)}>
          ⚙ Thresholds
        </button>
      </div>
    </header>
  );
}
