import { useDashboard } from '../store';

/** First screen: load a provided scenario or drop in any CSV in the competition format. */
export function Welcome() {
  const scenarios = useDashboard((s) => s.scenarios);
  const loadScenario = useDashboard((s) => s.loadScenario);
  const provided = scenarios.filter((s) => s.source === 'provided');
  const generated = scenarios.filter((s) => s.source !== 'provided');

  return (
    <section className="welcome">
      <div className="drop-hint">
        <div className="drop-icon" aria-hidden>
          ⬆
        </div>
        <h2>Drop a telemetry CSV anywhere on this page</h2>
        <p className="muted">
          or use <strong>Upload CSV</strong> above. Expected columns: Timestamp, Module ID, Temperature (C), Voltage (V), Current (A),
          State of charge (%), State of Health (%), Sensor Status. Messy files are fine: problems are reported, not fatal.
        </p>
      </div>
      {provided.length > 0 && (
        <>
          <h3>Provided datasets</h3>
          <div className="scenario-grid">
            {provided.map((s) => (
              <button key={s.id} type="button" className="scenario-card" onClick={() => loadScenario(s)}>
                <strong>{s.name}</strong>
                <span className="muted">{s.description}</span>
              </button>
            ))}
          </div>
        </>
      )}
      {generated.length > 0 && (
        <>
          <h3>Generated test scenarios</h3>
          <div className="scenario-grid">
            {generated.map((s) => (
              <button key={s.id} type="button" className="scenario-card" onClick={() => loadScenario(s)}>
                <strong>{s.name}</strong>
                <span className="muted">{s.description}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
