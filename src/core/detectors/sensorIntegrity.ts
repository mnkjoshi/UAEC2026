/**
 * Sensor-integrity checks: decide which readings can be trusted.
 *
 * Problems found here are reported as *data faults*, never as battery hazards.
 * Untrusted values are withheld from the hazard detectors and from the pack median,
 * so a broken sensor cannot trigger a false overheating or under-voltage alarm.
 */
import type { DetectionConfig } from '../config';
import type { Metric, Reading } from '../types';
import type { Finding } from './grade';

type CheckedMetric = 'temperature' | 'voltage';
const CHECKED: CheckedMetric[] = ['temperature', 'voltage'];
const LABEL: Record<Metric, string> = {
  temperature: 'temperature',
  voltage: 'voltage',
  current: 'current',
  soc: 'SOC',
  soh: 'SOH',
};

/** Per-module memory the integrity checks need between timestamps. */
export interface SensorMemory {
  lastRaw: Partial<Record<CheckedMetric, number>>;
  identicalRun: Record<CheckedMetric, number>;
  lastAccepted: Partial<Record<CheckedMetric, { value: number; t: number }>>;
  suspect: Partial<Record<CheckedMetric, { value: number; count: number }>>;
}

export function createSensorMemory(): SensorMemory {
  return { lastRaw: {}, identicalRun: { temperature: 0, voltage: 0 }, lastAccepted: {}, suspect: {} };
}

export type MetricValues = Record<Metric, number | null>;

export interface SensorCheckResult {
  findings: Finding[];
  /** Values shown to the operator: in physical range, otherwise null. */
  display: MetricValues;
  /** Values trusted for hazard detection: also excludes stuck and spiking readings. */
  accepted: MetricValues;
  implausibleCount: number;
  dataStatus: 'ok' | 'partial' | 'none';
}

const EMPTY: MetricValues = { temperature: null, voltage: null, current: null, soc: null, soh: null };

export function checkSensors(
  moduleId: string,
  reading: Reading | undefined,
  memory: SensorMemory,
  config: DetectionConfig,
  cellsInSeries: number,
  intervalSec: number,
  t: number,
): SensorCheckResult {
  if (!reading) {
    for (const m of CHECKED) memory.identicalRun[m] = 0;
    return {
      findings: [{ moduleId, code: 'sensor_missing', raise: 'data_fault', hold: 'data_fault', message: 'No data received' }],
      display: { ...EMPTY },
      accepted: { ...EMPTY },
      implausibleCount: 0,
      dataStatus: 'none',
    };
  }

  const { sensor } = config;
  const findings: Finding[] = [];
  const display: MetricValues = { ...EMPTY };
  const implausible: string[] = [];
  const missing: string[] = [];

  // 1. Missing, corrupted and out-of-range values.
  for (const metric of Object.keys(EMPTY) as Metric[]) {
    const value = reading[metric];
    const issue = reading.issues.find((i) => i.metric === metric);
    if (value === null) {
      if (issue?.kind === 'invalid') implausible.push(`${LABEL[metric]} "${issue.raw}"`);
      else if (issue?.kind === 'missing' && (metric === 'temperature' || metric === 'voltage')) missing.push(LABEL[metric]);
      continue;
    }
    let [lo, hi] = sensor.range[metric];
    if (metric === 'voltage') [lo, hi] = [lo * cellsInSeries, hi * cellsInSeries];
    if (value < lo || value > hi || sensor.sentinels.includes(value)) {
      implausible.push(`${LABEL[metric]} ${value}`);
      continue;
    }
    display[metric] = value;
  }

  const accepted: MetricValues = { ...display };

  // 2. Stuck sensors and implausible jumps (temperature and voltage only; SOC/SOH legitimately sit still).
  for (const metric of CHECKED) {
    const value = display[metric];
    if (value === null) {
      memory.identicalRun[metric] = 0;
      delete memory.lastRaw[metric];
      continue;
    }

    memory.identicalRun[metric] = memory.lastRaw[metric] === value ? memory.identicalRun[metric] + 1 : 1;
    memory.lastRaw[metric] = value;
    if (memory.identicalRun[metric] >= sensor.stuckSamples[metric]) {
      findings.push({
        moduleId,
        code: 'sensor_stuck',
        raise: 'data_fault',
        hold: 'data_fault',
        message: `${capitalise(LABEL[metric])} stuck at ${value}`,
      });
      accepted[metric] = null;
      continue;
    }

    const last = memory.lastAccepted[metric];
    const delta = sensor.spikeDelta[metric] * (metric === 'voltage' ? cellsInSeries : 1);
    const elapsedSamples = last ? Math.max(1, (t - last.t) / 1000 / (intervalSec || 1)) : 1;
    const allowed = delta * elapsedSamples;

    if (last && Math.abs(value - last.value) > allowed) {
      const prev = memory.suspect[metric];
      const suspect =
        prev && Math.abs(value - prev.value) <= delta ? { value, count: prev.count + 1 } : { value, count: 1 };
      memory.suspect[metric] = suspect;
      if (suspect.count < sensor.spikeConfirmSamples) {
        implausible.push(`jump in ${LABEL[metric]} (${last.value} → ${value})`);
        accepted[metric] = null;
        continue;
      }
      // The new level persisted: it is real, accept it.
    }
    delete memory.suspect[metric];
    memory.lastAccepted[metric] = { value, t };
  }

  if (missing.length) {
    findings.push({
      moduleId,
      code: 'sensor_missing',
      raise: 'data_fault',
      hold: 'data_fault',
      message: `No ${missing.join('/')} data`,
    });
  }
  if (implausible.length) {
    findings.push({
      moduleId,
      code: 'sensor_implausible',
      raise: 'data_fault',
      hold: 'data_fault',
      message: `Implausible ${implausible.join(', ')}`,
    });
  }
  const hasValues = display.temperature !== null || display.voltage !== null;
  if (!reading.statusOk && hasValues) {
    findings.push({
      moduleId,
      code: 'sensor_status',
      raise: 'data_fault',
      hold: 'data_fault',
      message: `Sensor status: ${reading.sensorStatus}`,
    });
  }

  const dataStatus = display.temperature !== null && display.voltage !== null ? 'ok' : 'partial';
  return { findings, display, accepted, implausibleCount: implausible.length, dataStatus };
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
