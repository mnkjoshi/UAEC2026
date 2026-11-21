/** The incident report is plain HTML built from the engine's output. */
import { describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DEFAULT_CONFIG, parseTelemetryCsv, runEngine } from '../src/core';
import { buildIncidentReport } from '../src/ui/report';
import { SCENARIO_DIR } from './helpers';

const load = (file: string) => {
  const ds = parseTelemetryCsv(readFileSync(resolve(SCENARIO_DIR, file), 'utf8'), file);
  return { ds, tl: runEngine(ds) };
};

describe('incident report', () => {
  it('describes the alert, its action and a trace for a thermal event', () => {
    const { ds, tl } = load('thermal_propagation.csv');
    const html = buildIncidentReport(ds, tl, tl.states.length - 1, DEFAULT_CONFIG, 'Bus 4102');
    expect(html).toContain('Thermal propagation from M07');
    expect(html).toContain('Action:');
    expect(html).toContain('<svg');
    if (process.env.REPORT_OUT) writeFileSync(process.env.REPORT_OUT, html);
  });

  it('only includes what had happened by the playback position', () => {
    const { ds, tl } = load('thermal_rise.csv');
    expect(buildIncidentReport(ds, tl, 5, DEFAULT_CONFIG, 'x')).toContain('No alerts were raised');
  });

  it('escapes text from the file', () => {
    const { ds, tl } = load('normal.csv');
    expect(buildIncidentReport(ds, tl, 0, DEFAULT_CONFIG, '<script>')).not.toContain('<script>');
  });
});
