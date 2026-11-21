/**
 * Battery-hazard detectors. Each check runs only on values the integrity layer trusts.
 *
 * Three complementary views of every module:
 *   - absolute limits      (safety backstop; catches whole-pack problems)
 *   - pack-relative        (compares with the median module; earliest detection of a single bad module)
 *   - rate of change       (catches a runaway trend minutes before it reaches a limit)
 */
import type { DetectionConfig } from '../config';
import { finding, grade, type Finding } from './grade';
import type { MetricValues } from './sensorIntegrity';

export interface PackMedians {
  temperature: number | null;
  voltage: number | null;
  current: number | null;
}

export interface ModuleRates {
  tempPerMin: number | null;
  voltPerMinPerCell: number | null;
}

export function detectHazards(
  moduleId: string,
  values: MetricValues,
  medians: PackMedians,
  rates: ModuleRates,
  config: DetectionConfig,
  cellsInSeries: number,
): Finding[] {
  const out: Finding[] = [];
  const { temperature: T, voltage, current: I, soc, soh } = values;
  const tc = config.temperature;
  const vc = config.voltage;

  // --- Temperature ---
  if (T !== null) {
    out.push(...finding(moduleId, 'temp_high', grade(T, tc.high, 'above'), `${T.toFixed(1)} °C`));
    if (medians.temperature !== null) {
      const dev = T - medians.temperature;
      out.push(...finding(moduleId, 'temp_dev', grade(dev, tc.deviation, 'above'), `+${dev.toFixed(1)} °C vs pack`));
    }
  }
  if (rates.tempPerMin !== null) {
    const r = rates.tempPerMin;
    out.push(...finding(moduleId, 'temp_rate', grade(r, tc.riseRate, 'above'), `+${r.toFixed(1)} °C/min`));
  }

  // --- Voltage (graded per cell, so pack- and cell-level data use the same limits) ---
  if (voltage !== null) {
    const v = voltage / cellsInSeries;
    out.push(...finding(moduleId, 'volt_low', grade(v, vc.low, 'below'), `${v.toFixed(3)} V`));
    out.push(...finding(moduleId, 'volt_high', grade(v, vc.high, 'above'), `${v.toFixed(3)} V`));
    if (medians.voltage !== null) {
      const dev = (voltage - medians.voltage) / cellsInSeries;
      const mv = Math.round(Math.abs(dev) * 1000);
      if (dev < 0) out.push(...finding(moduleId, 'volt_dev_low', grade(-dev, vc.deviation, 'above'), `−${mv} mV vs pack`));
      if (dev > 0) out.push(...finding(moduleId, 'volt_dev_high', grade(dev, vc.deviation, 'above'), `+${mv} mV vs pack`));
    }
  }
  if (rates.voltPerMinPerCell !== null && rates.voltPerMinPerCell < 0) {
    const fall = -rates.voltPerMinPerCell;
    out.push(...finding(moduleId, 'volt_rate', grade(fall, vc.dropRate, 'above'), `−${fall.toFixed(2)} V/min`));
  }

  // --- Charge and health ---
  if (soc !== null) out.push(...finding(moduleId, 'soc_low', grade(soc, config.soc.low, 'below'), `SOC ${soc.toFixed(0)} %`));
  if (soh !== null) out.push(...finding(moduleId, 'soh_low', grade(soh, config.soh.low, 'below'), `SOH ${soh.toFixed(1)} %`));

  // --- Current: series modules should all carry the pack current ---
  if (I !== null && medians.current !== null) {
    const c = config.current;
    const ref = Math.abs(medians.current);
    const band = {
      warn: Math.max(c.deviationRatio.warn * ref, c.deviationFloorA.warn),
      crit: Math.max(c.deviationRatio.crit * ref, c.deviationFloorA.crit),
      hyst: c.hystA,
    };
    const dev = Math.abs(I - medians.current);
    out.push(
      ...finding(moduleId, 'current_dev', grade(dev, band, 'above'), `${I.toFixed(0)} A (pack ${medians.current.toFixed(0)} A)`),
    );
  }

  return out;
}
