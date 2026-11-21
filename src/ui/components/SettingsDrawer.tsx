import { useState } from 'react';
import { cloneDefaultConfig, type DetectionConfig } from '../../core';
import { useDashboard } from '../store';

/** Field definitions: label, unit, and a getter/setter path into the config. */
type Path = [keyof DetectionConfig, ...string[]];
interface FieldDef {
  label: string;
  unit: string;
  path: Path;
  scale?: number; // display multiplier (e.g. V → mV)
  step?: number;
}

const SECTIONS: Array<{ title: string; note: string; fields: FieldDef[] }> = [
  {
    title: 'Temperature',
    note: 'Absolute limits from Li-ion datasheets; relative and rate limits are ~2× the worst seen in normal data.',
    fields: [
      { label: 'High: warning', unit: '°C', path: ['temperature', 'high', 'warn'] },
      { label: 'High: critical', unit: '°C', path: ['temperature', 'high', 'crit'] },
      { label: 'Above pack median: warning', unit: '°C', path: ['temperature', 'deviation', 'warn'] },
      { label: 'Above pack median: critical', unit: '°C', path: ['temperature', 'deviation', 'crit'] },
      { label: 'Rise rate: warning', unit: '°C/min', path: ['temperature', 'riseRate', 'warn'], step: 0.5 },
      { label: 'Rise rate: critical', unit: '°C/min', path: ['temperature', 'riseRate', 'crit'], step: 0.5 },
    ],
  },
  {
    title: 'Voltage (per cell)',
    note: 'NMC cell limits: charge 4.2 V, discharge cut-off ~3.0 V.',
    fields: [
      { label: 'Low: warning', unit: 'V', path: ['voltage', 'low', 'warn'], step: 0.01 },
      { label: 'Low: critical', unit: 'V', path: ['voltage', 'low', 'crit'], step: 0.01 },
      { label: 'High: warning', unit: 'V', path: ['voltage', 'high', 'warn'], step: 0.01 },
      { label: 'High: critical', unit: 'V', path: ['voltage', 'high', 'crit'], step: 0.01 },
      { label: 'From pack median: warning', unit: 'mV', path: ['voltage', 'deviation', 'warn'], scale: 1000, step: 5 },
      { label: 'From pack median: critical', unit: 'mV', path: ['voltage', 'deviation', 'crit'], scale: 1000, step: 5 },
      { label: 'Drop rate: warning', unit: 'V/min', path: ['voltage', 'dropRate', 'warn'], step: 0.01 },
      { label: 'Drop rate: critical', unit: 'V/min', path: ['voltage', 'dropRate', 'crit'], step: 0.01 },
    ],
  },
  {
    title: 'Charge & health',
    note: '80 % SOH is the standard end-of-life point for traction batteries.',
    fields: [
      { label: 'SOC low: warning', unit: '%', path: ['soc', 'low', 'warn'] },
      { label: 'SOC low: critical', unit: '%', path: ['soc', 'low', 'crit'] },
      { label: 'SOH low: warning', unit: '%', path: ['soh', 'low', 'warn'] },
      { label: 'SOH low: critical', unit: '%', path: ['soh', 'low', 'crit'] },
    ],
  },
  {
    title: 'False-alarm filter',
    note: 'Consecutive samples a condition must persist before alerting, and before clearing.',
    fields: [
      { label: 'Samples to raise a warning', unit: 'samples', path: ['persistence', 'warning'] },
      { label: 'Samples to raise a critical', unit: 'samples', path: ['persistence', 'critical'] },
      { label: 'Samples to clear', unit: 'samples', path: ['persistence', 'clear'] },
      { label: 'Stuck temperature after', unit: 'samples', path: ['sensor', 'stuckSamples', 'temperature'] },
    ],
  },
];

function getAt(obj: unknown, path: string[]): number {
  return path.reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], obj) as number;
}
function setAt(obj: unknown, path: string[], value: number) {
  const parent = path.slice(0, -1).reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], obj) as Record<string, number>;
  parent[path[path.length - 1]] = value;
}

/** Editable thresholds. Applying re-runs the engine over the whole file instantly. */
export function SettingsDrawer() {
  const open = useDashboard((s) => s.settingsOpen);
  const config = useDashboard((s) => s.config);
  const { setSettingsOpen, updateConfig } = useDashboard.getState();
  const [draft, setDraft] = useState<DetectionConfig>(() => structuredClone(config));
  const [lastOpen, setLastOpen] = useState(open);

  // Reset the draft each time the drawer opens.
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) setDraft(structuredClone(config));
  }
  if (!open) return null;

  return (
    <div className="drawer-backdrop" onClick={() => setSettingsOpen(false)}>
      <aside className="drawer" role="dialog" aria-label="Detection thresholds" onClick={(e) => e.stopPropagation()}>
        <header className="panel-head">
          <h2>Detection thresholds</h2>
          <button type="button" className="btn icon" onClick={() => setSettingsOpen(false)} aria-label="Close">
            ✕
          </button>
        </header>
        <p className="muted small">
          Full justification for every value is in docs/DETECTION_LOGIC.md. Changes apply to the loaded dataset immediately.
        </p>
        {SECTIONS.map((section) => (
          <fieldset key={section.title}>
            <legend>{section.title}</legend>
            <p className="muted small">{section.note}</p>
            {section.fields.map((f) => {
              const scale = f.scale ?? 1;
              return (
                <label key={f.path.join('.')} className="field">
                  <span>{f.label}</span>
                  <span className="field-input">
                    <input
                      type="number"
                      step={f.step ?? 1}
                      value={+(getAt(draft, f.path) * scale).toFixed(4)}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        if (!Number.isFinite(v)) return;
                        const next = structuredClone(draft);
                        setAt(next, f.path, v / scale);
                        setDraft(next);
                      }}
                    />
                    <small>{f.unit}</small>
                  </span>
                </label>
              );
            })}
          </fieldset>
        ))}
        <footer className="drawer-foot">
          <button type="button" className="btn" onClick={() => setDraft(cloneDefaultConfig())}>
            Reset to defaults
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={() => {
              updateConfig(draft);
              setSettingsOpen(false);
            }}
          >
            Apply
          </button>
        </footer>
      </aside>
    </div>
  );
}
