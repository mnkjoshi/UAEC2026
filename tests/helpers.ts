import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseTelemetryCsv, runEngine, type Alert, type Timeline } from '../src/core';

export const SCENARIO_DIR = resolve(__dirname, '../public/scenarios');

export function runScenarioFile(file: string): Timeline {
  const text = readFileSync(resolve(SCENARIO_DIR, file), 'utf8');
  return runEngine(parseTelemetryCsv(text, file));
}

export function runCsv(text: string): Timeline {
  return runEngine(parseTelemetryCsv(text));
}

/** Alerts that are battery hazards (not data faults or advisories). */
export function hazardAlerts(timeline: Timeline): Alert[] {
  return timeline.alertHistory.filter((a) => a.peakSeverity === 'warning' || a.peakSeverity === 'critical');
}

/** Seconds from the first timestamp to when an alert was raised. */
export function raisedAtSec(timeline: Timeline, alert: Alert): number {
  return (alert.firstSeen.getTime() - timeline.states[0].timestamp.getTime()) / 1000;
}

/** Builds a CSV in the competition format. `fn` can modify each row's values. */
export function makeCsv(
  opts: { frames?: number; modules?: number; intervalSec?: number } = {},
  fn?: (row: Record<string, string>, frame: number, moduleIndex: number) => Record<string, string> | null,
): string {
  const { frames = 36, modules = 12, intervalSec = 10 } = opts;
  const header = 'Timestamp,Module ID,Temperature (C),Voltage (V),Current (A),State of charge (%),State of Health (%),Sensor Status';
  const lines = [header];
  const start = Date.UTC(2026, 0, 1, 12, 0, 0);
  for (let f = 0; f < frames; f++) {
    const ts = new Date(start + f * intervalSec * 1000).toISOString().replace('T', ' ').slice(0, 19);
    for (let m = 0; m < modules; m++) {
      // Deterministic gentle noise, similar to the provided normal data.
      const wobble = Math.sin(f * 1.7 + m * 2.3);
      let row: Record<string, string> | null = {
        ts,
        id: `M${String(m + 1).padStart(2, '0')}`,
        temp: (28 + m * 0.3 + wobble * 0.15).toFixed(2),
        volt: (3.68 + wobble * 0.004).toFixed(3),
        current: (85 + wobble).toFixed(2),
        soc: (78 - f * 0.04).toFixed(2),
        soh: (95.6 + m * 0.01).toFixed(2),
        status: 'OK',
      };
      if (fn) row = fn(row, f, m);
      if (row) lines.push([row.ts, row.id, row.temp, row.volt, row.current, row.soc, row.soh, row.status].join(','));
    }
  }
  return lines.join('\n');
}
