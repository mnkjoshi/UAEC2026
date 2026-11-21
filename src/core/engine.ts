/**
 * The detection engine: runs every frame of a dataset through the pipeline
 *
 *   sensor integrity → hazard detectors → persistence/hysteresis → diagnosis → alert lifecycle
 *
 * and returns one PackState per frame. Each state depends only on frames up to and
 * including it (causal), so replaying the timeline is identical to watching live data.
 */
import { DEFAULT_CONFIG, type DetectionConfig } from './config';
import { ConditionTracker, isSensorCode } from './conditions';
import { checkSensors, createSensorMemory, type SensorCheckResult, type SensorMemory } from './detectors/sensorIntegrity';
import { detectHazards, type PackMedians } from './detectors/hazards';
import type { Finding } from './detectors/grade';
import { AlertManager } from './alerts';
import { diagnose, type ModuleSnapshot } from './diagnosis';
import { mean, median, slopePerSecond, type TimedValue } from './stats';
import {
  SEVERITY_RANK,
  maxSeverity,
  type ActiveCondition,
  type EventLogEntry,
  type Metric,
  type ModuleState,
  type PackKpis,
  type PackState,
  type ParsedDataset,
  type Timeline,
} from './types';

const TRANSIENT_LABEL: Record<string, string> = {
  sensor_missing: 'sensor dropout',
  sensor_stuck: 'repeated reading',
  sensor_implausible: 'implausible reading',
  sensor_status: 'sensor status flag',
};

/**
 * Infers cells in series from the typical voltage, so module-level data (e.g. 44 V)
 * is graded with the same per-cell limits as cell-level data (3.7 V).
 */
export function inferCellsInSeries(dataset: ParsedDataset, config: DetectionConfig): number {
  const volts: number[] = [];
  for (const frame of dataset.frames.slice(0, 10)) {
    for (const r of frame.readings.values()) if (r.voltage !== null && r.voltage > 0) volts.push(r.voltage);
  }
  const typical = median(volts);
  if (typical === null) return 1;
  return Math.max(1, Math.round(typical / config.voltage.nominalCell));
}

export function runEngine(dataset: ParsedDataset, config: DetectionConfig = DEFAULT_CONFIG): Timeline {
  const { frames, modules } = dataset;
  const cellsInSeries = inferCellsInSeries(dataset, config);
  const intervalSec = dataset.quality.intervalSec || 10;
  const rateWindowMs = Math.max(config.rateWindowSec, 3 * intervalSec) * 1000;

  const memory = new Map<string, SensorMemory>(modules.map((m) => [m, createSensorMemory()]));
  const history = new Map<string, Record<'temperature' | 'voltage', TimedValue[]>>(
    modules.map((m) => [m, { temperature: [], voltage: [] }]),
  );
  const tracker = new ConditionTracker(config);
  const alertManager = new AlertManager();

  const states: PackState[] = [];
  const events: EventLogEntry[] = [];
  let eventCounter = 0;
  const nextEventId = () => `EV-${++eventCounter}`;
  let implausibleValues = 0;

  frames.forEach((frame, frameIndex) => {
    const t = frame.timestamp.getTime();

    // Telemetry gaps are logged so the operator knows the view may be stale.
    if (frameIndex > 0) {
      const gapSec = (t - frames[frameIndex - 1].timestamp.getTime()) / 1000;
      if (gapSec > 3 * intervalSec) {
        events.push({
          id: nextEventId(),
          frameIndex,
          time: frame.timestamp,
          severity: 'advisory',
          kind: 'data',
          moduleIds: [],
          message: `Telemetry gap: no data for ${Math.round(gapSec)} s`,
        });
      }
    }

    // 1. Sensor integrity.
    const checks = new Map<string, SensorCheckResult>();
    for (const id of modules) {
      const result = checkSensors(id, frame.readings.get(id), memory.get(id)!, config, cellsInSeries, intervalSec, t);
      implausibleValues += result.implausibleCount;
      checks.set(id, result);
    }

    // 2. Pack medians from trusted values only.
    const packMedian = (metric: Metric) => {
      const values = modules.map((id) => checks.get(id)!.accepted[metric]).filter((v): v is number => v !== null);
      return values.length >= config.minModulesForMedian ? median(values) : null;
    };
    const medians: PackMedians = {
      temperature: packMedian('temperature'),
      voltage: packMedian('voltage'),
      current: packMedian('current'),
    };

    // 3. Rates of change and hazard detection.
    const findings: Finding[] = [];
    const unavailable = new Set<string>();
    const rates = new Map<string, { temp: number | null; volt: number | null }>();

    for (const id of modules) {
      const check = checks.get(id)!;
      findings.push(...check.findings);
      for (const metric of Object.keys(check.accepted) as Metric[]) {
        if (check.accepted[metric] === null) unavailable.add(`${id}:${metric}`);
      }

      const h = history.get(id)!;
      const rateOf = (metric: 'temperature' | 'voltage') => {
        const value = check.accepted[metric];
        if (value !== null) h[metric].push({ t, v: value });
        h[metric] = h[metric].filter((p) => p.t >= t - rateWindowMs);
        const pts = h[metric];
        const span = pts.length ? pts[pts.length - 1].t - pts[0].t : 0;
        if (value === null || pts.length < 3 || span < 0.6 * rateWindowMs) return null;
        const slope = slopePerSecond(pts);
        return slope === null ? null : slope * 60;
      };
      const tempRate = rateOf('temperature');
      const voltRateRaw = rateOf('voltage');
      const voltRate = voltRateRaw === null ? null : voltRateRaw / cellsInSeries;
      rates.set(id, { temp: tempRate, volt: voltRate });

      findings.push(
        ...detectHazards(id, check.accepted, medians, { tempPerMin: tempRate, voltPerMinPerCell: voltRate }, config, cellsInSeries),
      );
    }

    // 4. Persistence and hysteresis.
    const { active, transients } = tracker.update(findings, unavailable, frame.timestamp);
    for (const tr of transients) {
      if (!isSensorCode(tr.code)) continue; // brief hazard blips are noise; only log data events
      events.push({
        id: nextEventId(),
        frameIndex,
        time: frame.timestamp,
        severity: 'advisory',
        kind: 'transient',
        moduleIds: [tr.moduleId],
        message: `${tr.moduleId}: brief ${TRANSIENT_LABEL[tr.code]} (${tr.samples} sample${tr.samples === 1 ? '' : 's'}), not confirmed`,
      });
    }

    // 5. Diagnosis and alert lifecycle.
    const snapshot = new Map<string, ModuleSnapshot>();
    for (const id of modules) {
      const c = checks.get(id)!;
      const r = rates.get(id)!;
      snapshot.set(id, {
        temperature: c.accepted.temperature,
        voltagePerCell: c.accepted.voltage === null ? null : c.accepted.voltage / cellsInSeries,
        current: c.display.current,
        tempRatePerMin: r.temp,
        voltRatePerMin: r.volt,
        hasData: c.dataStatus !== 'none',
      });
    }
    const problems = diagnose({ conditions: active, modules, snapshot, config });
    const { alerts, events: alertEvents } = alertManager.update(problems, frame.timestamp, frameIndex, nextEventId);
    events.push(...alertEvents);

    // 6. Module and pack state for the UI.
    const moduleStates: ModuleState[] = modules.map((id) => {
      const c = checks.get(id)!;
      const r = rates.get(id)!;
      const conds = active.filter((a) => a.moduleId === id).sort(bySeverityDesc);
      const alertSeverity = alerts.filter((a) => a.moduleIds.includes(id)).map((a) => a.severity);
      const missingNow = c.display.temperature === null || c.display.voltage === null;
      const severity = maxSeverity(...conds.map((x) => x.severity), ...alertSeverity, missingNow ? 'data_fault' : 'normal');
      const label = conds[0]?.message ?? (c.dataStatus === 'none' ? 'No data' : missingNow ? 'Missing T/V' : undefined);
      return {
        id,
        ...c.display,
        severity,
        label,
        conditions: conds,
        tempRatePerMin: r.temp,
        voltRatePerMin: r.volt,
        tempDeviation:
          c.accepted.temperature !== null && medians.temperature !== null ? c.accepted.temperature - medians.temperature : null,
        voltDeviation:
          c.accepted.voltage !== null && medians.voltage !== null ? (c.accepted.voltage - medians.voltage) / cellsInSeries : null,
        dataStatus: c.dataStatus,
      };
    });

    states.push({
      frameIndex,
      timestamp: frame.timestamp,
      severity: maxSeverity(...moduleStates.map((m) => m.severity), ...alerts.map((a) => a.severity)),
      modules: moduleStates,
      alerts: alerts.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || a.firstSeen.getTime() - b.firstSeen.getTime()),
      kpis: computeKpis(moduleStates, cellsInSeries),
    });
  });

  return { states, events, alertHistory: alertManager.allAlerts(), implausibleValues, cellsInSeries };
}

function bySeverityDesc(a: ActiveCondition, b: ActiveCondition) {
  return SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
}

function computeKpis(modules: ModuleState[], cellsInSeries: number): PackKpis {
  const extreme = (metric: 'temperature' | 'voltage', pick: 'max' | 'min') => {
    let best: { value: number; moduleId: string } | null = null;
    for (const m of modules) {
      const v = m[metric];
      if (v === null) continue;
      if (!best || (pick === 'max' ? v > best.value : v < best.value)) best = { value: v, moduleId: m.id };
    }
    return best;
  };
  const values = (metric: Metric) => modules.map((m) => m[metric]).filter((v): v is number => v !== null);

  const maxTemp = extreme('temperature', 'max');
  const minTemp = extreme('temperature', 'min');
  const maxVolt = extreme('voltage', 'max');
  const minVolt = extreme('voltage', 'min');
  return {
    maxTemp,
    minTemp,
    tempSpread: maxTemp && minTemp ? maxTemp.value - minTemp.value : null,
    minVolt,
    maxVolt,
    voltSpreadMv: maxVolt && minVolt ? ((maxVolt.value - minVolt.value) / cellsInSeries) * 1000 : null,
    avgSoc: mean(values('soc')),
    avgSoh: mean(values('soh')),
    meanCurrent: mean(values('current')),
    reportingModules: modules.filter((m) => m.dataStatus === 'ok').length,
    totalModules: modules.length,
  };
}
