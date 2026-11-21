/**
 * End-to-end tests on the five provided datasets.
 * These pin down the behaviour documented in docs/DETECTION_LOGIC.md §7.
 */
import { describe, expect, it } from 'vitest';
import { hazardAlerts, raisedAtSec, runScenarioFile } from './helpers';

describe('Normal operations', () => {
  const tl = runScenarioFile('normal.csv');

  it('raises no alerts of any kind', () => {
    expect(tl.alertHistory).toEqual([]);
  });

  it('keeps every module normal at every timestamp', () => {
    for (const state of tl.states) {
      expect(state.severity).toBe('normal');
    }
  });
});

describe('Low voltage', () => {
  const tl = runScenarioFile('low_voltage.csv');
  const hazards = hazardAlerts(tl);

  it('raises exactly one hazard alert, on M03 only', () => {
    expect(hazards).toHaveLength(1);
    expect(hazards[0].moduleIds).toEqual(['M03']);
    expect(hazards[0].category).toBe('voltage');
  });

  it('detects it within 40 s of onset (12:02:30)', () => {
    expect(raisedAtSec(tl, hazards[0])).toBeLessThanOrEqual(150 + 40);
  });

  it('escalates to critical', () => {
    expect(hazards[0].peakSeverity).toBe('critical');
  });
});

describe('Thermal rise', () => {
  const tl = runScenarioFile('thermal_rise.csv');
  const hazards = hazardAlerts(tl);

  it('raises one isolated thermal event on M07', () => {
    expect(hazards).toHaveLength(1);
    expect(hazards[0].moduleIds).toEqual(['M07']);
    expect(hazards[0].title).toBe('Isolated thermal event');
    expect(hazards[0].peakSeverity).toBe('critical');
  });

  it('detects it within 40 s of onset (12:02:00), long before 45 °C', () => {
    expect(raisedAtSec(tl, hazards[0])).toBeLessThanOrEqual(120 + 40);
  });

  it('provides a time-to-limit forecast while heating', () => {
    const mid = tl.states[24]; // 12:04:00
    expect(mid.alerts[0].forecast).toMatch(/M07 reaches 55 °C/);
  });
});

describe('Multiple module heating', () => {
  const tl = runScenarioFile('multiple_module_heating.csv');
  const hazards = hazardAlerts(tl);

  it('groups M04–M06 into a single multi-module alert', () => {
    expect(hazards).toHaveLength(1);
    expect([...hazards[0].moduleIds].sort()).toEqual(['M04', 'M05', 'M06']);
    expect(hazards[0].title).toMatch(/Multi-module heating/);
  });

  it('does not involve any other module', () => {
    const touched = new Set(tl.alertHistory.flatMap((a) => a.moduleIds));
    expect([...touched].sort()).toEqual(['M04', 'M05', 'M06']);
  });
});

describe('Sensor failure', () => {
  const tl = runScenarioFile('sensor_failure.csv');

  it('raises no battery-hazard alerts', () => {
    expect(hazardAlerts(tl)).toEqual([]);
  });

  it('raises a data-fault alert for M11 that clears after recovery', () => {
    const m11 = tl.alertHistory.filter((a) => a.moduleIds.includes('M11'));
    expect(m11).toHaveLength(1);
    expect(m11[0].category).toBe('sensor');
    expect(m11[0].severity).toBe('data_fault');
    expect(m11[0].clearedAt).toBeDefined();
  });

  it('logs the single-sample dropouts on M03 and M06 without alerting', () => {
    expect(tl.alertHistory.some((a) => a.moduleIds.includes('M03') || a.moduleIds.includes('M06'))).toBe(false);
    const transients = tl.events.filter((e) => e.kind === 'transient').flatMap((e) => e.moduleIds);
    expect(transients).toEqual(expect.arrayContaining(['M03', 'M06']));
  });
});
