/**
 * Tests on the synthetic scenarios produced by tools/generate_scenarios.py.
 * These cover fault types and data problems that the provided datasets do not.
 */
import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { hazardAlerts, runScenarioFile, SCENARIO_DIR } from './helpers';

const has = (file: string) => existsSync(resolve(SCENARIO_DIR, file));
const scenario = (file: string, fn: () => void) => (has(file) ? describe(file, fn) : describe.skip(file, fn));

scenario('overvoltage.csv', () => {
  it('raises a critical over-voltage alert on M09 only', () => {
    const [a, ...rest] = hazardAlerts(runScenarioFile('overvoltage.csv'));
    expect(rest).toEqual([]);
    expect(a.title).toBe('Over-voltage');
    expect(a.moduleIds).toEqual(['M09']);
    expect(a.peakSeverity).toBe('critical');
  });
});

scenario('internal_short.csv', () => {
  it('combines heating and voltage drop into one internal-short diagnosis', () => {
    const hazards = hazardAlerts(runScenarioFile('internal_short.csv'));
    expect(hazards).toHaveLength(1);
    expect(hazards[0].title).toBe('Suspected internal short circuit');
    expect(hazards[0].moduleIds).toEqual(['M02']);
  });
});

scenario('thermal_propagation.csv', () => {
  it('identifies M07 as the source of propagation into its neighbours', () => {
    const tl = runScenarioFile('thermal_propagation.csv');
    const final = tl.states[tl.states.length - 1].alerts.find((a) => a.category === 'thermal')!;
    expect(final.title).toBe('Thermal propagation from M07');
    expect(final.moduleIds).toEqual(['M06', 'M07', 'M08']);
    expect(final.severity).toBe('critical');
  });
});

scenario('whole_pack_heating.csv', () => {
  it('reports a single pack-wide alert covering all modules', () => {
    const hazards = hazardAlerts(runScenarioFile('whole_pack_heating.csv'));
    expect(hazards).toHaveLength(1);
    expect(hazards[0].title).toBe('Pack-wide temperature rise');
    expect(hazards[0].moduleIds).toHaveLength(12);
  });
});

scenario('low_soc.csv', () => {
  it('raises a pack-level low-charge alert', () => {
    const hazards = hazardAlerts(runScenarioFile('low_soc.csv'));
    expect(hazards.map((a) => a.title)).toEqual(['Low state of charge']);
  });
});

scenario('stuck_sensor.csv', () => {
  it('flags M08 as a stuck sensor (data fault, not a hazard)', () => {
    const tl = runScenarioFile('stuck_sensor.csv');
    expect(hazardAlerts(tl)).toEqual([]);
    expect(tl.alertHistory.map((a) => [a.title, a.moduleIds.join()])).toEqual([['Stuck sensor', 'M08']]);
  });
});

scenario('sensor_spike.csv', () => {
  it('ignores a single-sample spike without any alert', () => {
    const tl = runScenarioFile('sensor_spike.csv');
    expect(tl.alertHistory).toEqual([]);
    expect(tl.events.some((e) => e.kind === 'transient')).toBe(true);
  });
});

scenario('comms_loss.csv', () => {
  it('reports one communication-loss alert instead of twelve dropouts', () => {
    const tl = runScenarioFile('comms_loss.csv');
    expect(tl.alertHistory).toHaveLength(1);
    expect(tl.alertHistory[0].title).toBe('Communication loss');
    expect(hazardAlerts(tl)).toEqual([]);
  });
});

scenario('missing_module.csv', () => {
  it('reports M05 as a sensor dropout while its rows are absent', () => {
    const tl = runScenarioFile('missing_module.csv');
    expect(tl.alertHistory.map((a) => [a.title, a.moduleIds.join()])).toEqual([['Sensor dropout', 'M05']]);
  });
});

scenario('heating_with_dropout.csv', () => {
  it('keeps the M04 thermal alert active through the sensor dropout', () => {
    const tl = runScenarioFile('heating_with_dropout.csv');
    const thermal = hazardAlerts(tl).filter((a) => a.category === 'thermal');
    expect(thermal).toHaveLength(1);
    expect(thermal[0].moduleIds).toEqual(['M04']);
    expect(thermal[0].clearedAt).toBeUndefined();
  });
});

scenario('corrupted_values.csv', () => {
  it('survives garbage values without raising hazards', () => {
    const tl = runScenarioFile('corrupted_values.csv');
    expect(hazardAlerts(tl)).toEqual([]);
    expect(tl.implausibleValues).toBeGreaterThan(0);
  });
});

scenario('messy_format.csv', () => {
  it('loads shuffled, duplicated, partly unreadable data without false alarms', () => {
    const tl = runScenarioFile('messy_format.csv');
    expect(tl.states.length).toBeGreaterThan(30);
    expect(hazardAlerts(tl)).toEqual([]);
  });
});
