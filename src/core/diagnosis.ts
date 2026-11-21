/**
 * Diagnosis: turns active conditions into operator-facing problems.
 *
 * Conditions are grouped by category, then by where they occur in the pack
 * (one module, adjacent modules, or the whole pack). The pattern determines the
 * likely root cause and the recommended action. See docs/DETECTION_LOGIC.md §4.
 */
import type { DetectionConfig } from './config';
import { median } from './stats';
import { SEVERITY_RANK, maxSeverity, type ActiveCondition, type AlertCategory, type ConditionCode, type Severity } from './types';

export interface Problem {
  category: AlertCategory;
  moduleIds: string[];
  severity: Severity;
  title: string;
  diagnosis: string;
  action: string;
  forecast?: string;
  since: Date;
}

/** The per-module values diagnosis needs for forecasts. */
export interface ModuleSnapshot {
  temperature: number | null;
  voltagePerCell: number | null;
  current: number | null;
  tempRatePerMin: number | null;
  voltRatePerMin: number | null;
  hasData: boolean;
}

export interface DiagnosisContext {
  conditions: ActiveCondition[];
  modules: string[]; // physical order
  snapshot: Map<string, ModuleSnapshot>;
  config: DetectionConfig;
}

export const CATEGORY: Record<ConditionCode, AlertCategory> = {
  temp_high: 'thermal',
  temp_dev: 'thermal',
  temp_rate: 'thermal',
  volt_low: 'voltage',
  volt_high: 'voltage',
  volt_dev_low: 'voltage',
  volt_dev_high: 'voltage',
  volt_rate: 'voltage',
  soc_low: 'charge',
  soh_low: 'health',
  current_dev: 'current',
  sensor_missing: 'sensor',
  sensor_stuck: 'sensor',
  sensor_implausible: 'sensor',
  sensor_status: 'sensor',
};

const LOW_VOLTAGE_CODES: ConditionCode[] = ['volt_low', 'volt_dev_low', 'volt_rate'];
const HIGH_VOLTAGE_CODES: ConditionCode[] = ['volt_high', 'volt_dev_high'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const worst = (conds: ActiveCondition[]) => maxSeverity(...conds.map((c) => c.severity));
const earliest = (conds: ActiveCondition[]) => new Date(Math.min(...conds.map((c) => c.since.getTime())));
const isCrit = (s: Severity) => SEVERITY_RANK[s] >= SEVERITY_RANK.critical;

/** "M04–M06" for a consecutive run, otherwise "M02, M05". */
export function describeModules(ids: string[], order: string[]): string {
  if (ids.length === 0) return '';
  if (ids.length === 1) return ids[0];
  const idx = ids.map((id) => order.indexOf(id)).sort((a, b) => a - b);
  const consecutive = idx.every((v, i) => i === 0 || v === idx[i - 1] + 1);
  return consecutive ? `${order[idx[0]]}–${order[idx[idx.length - 1]]}` : ids.join(', ');
}

/** Splits modules into runs of physically adjacent modules. */
function adjacentClusters(ids: string[], order: string[]): string[][] {
  const sorted = [...ids].sort((a, b) => order.indexOf(a) - order.indexOf(b));
  const clusters: string[][] = [];
  for (const id of sorted) {
    const last = clusters[clusters.length - 1];
    if (last && order.indexOf(id) - order.indexOf(last[last.length - 1]) === 1) last.push(id);
    else clusters.push([id]);
  }
  return clusters;
}

export function formatEta(seconds: number): string {
  if (seconds < 90) return `~${Math.max(1, Math.round(seconds))} s`;
  return `~${(seconds / 60).toFixed(1)} min`;
}

function thermalForecast(ids: string[], ctx: DiagnosisContext): string | undefined {
  const { crit } = ctx.config.temperature.high;
  const minRate = ctx.config.temperature.riseRate.warn;
  let best: { id: string; eta: number } | null = null;
  for (const id of ids) {
    const s = ctx.snapshot.get(id);
    if (!s || s.temperature === null) continue;
    if (s.temperature >= crit) return `${id} is above the ${crit} °C critical limit`;
    if (s.tempRatePerMin !== null && s.tempRatePerMin >= minRate) {
      const eta = ((crit - s.temperature) / s.tempRatePerMin) * 60;
      if (!best || eta < best.eta) best = { id, eta };
    }
  }
  return best ? `${best.id} reaches ${crit} °C in ${formatEta(best.eta)} at the current rate` : undefined;
}

function voltageForecast(id: string, ctx: DiagnosisContext): string | undefined {
  const s = ctx.snapshot.get(id);
  const { crit } = ctx.config.voltage.low;
  if (!s || s.voltagePerCell === null) return undefined;
  if (s.voltagePerCell <= crit) return `${id} is below the ${crit} V critical limit`;
  if (s.voltRatePerMin !== null && -s.voltRatePerMin >= ctx.config.voltage.dropRate.warn) {
    const eta = ((s.voltagePerCell - crit) / -s.voltRatePerMin) * 60;
    return `${id} reaches ${crit} V in ${formatEta(eta)} at the current rate`;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

export function diagnose(ctx: DiagnosisContext): Problem[] {
  const { conditions, modules, config } = ctx;
  const problems: Problem[] = [];

  const byModule = (category: AlertCategory) => {
    const map = new Map<string, ActiveCondition[]>();
    for (const c of conditions) {
      if (CATEGORY[c.code] !== category) continue;
      map.set(c.moduleId, [...(map.get(c.moduleId) ?? []), c]);
    }
    return map;
  };
  const reporting = modules.filter((m) => ctx.snapshot.get(m)?.hasData).length;
  const packWideCount = Math.max(3, Math.ceil(config.packWideFraction * Math.max(reporting, 1)));

  // ---- Thermal ----
  const thermal = byModule('thermal');
  const voltage = byModule('voltage');
  const voltageExplained = new Set<string>();
  const thermalIds = [...thermal.keys()];

  // Pack-wide if most modules are affected, or if the whole pack is rising fast
  // (modules confirm a sample or two apart, so this avoids briefly splitting one event into clusters).
  const packRate = median(
    modules.map((m) => ctx.snapshot.get(m)?.tempRatePerMin).filter((r): r is number => r !== null && r !== undefined),
  );
  const packRising = packRate !== null && packRate >= config.temperature.riseRate.warn && thermalIds.length >= 2;

  if (thermalIds.length >= packWideCount || packRising) {
    const all = thermalIds.flatMap((id) => thermal.get(id)!);
    const sev = worst(all);
    problems.push({
      category: 'thermal',
      moduleIds: thermalIds,
      severity: sev,
      title: 'Pack-wide temperature rise',
      diagnosis:
        'All modules are heating together. Likely a cooling-system failure, high ambient temperature or sustained heavy load.',
      action: isCrit(sev)
        ? 'Stop the bus safely. Do not continue until the cooling system has been checked.'
        : 'Reduce power demand and check the coolant pump, fans and HVAC. Stop if temperatures keep rising.',
      forecast: thermalForecast(thermalIds, ctx),
      since: earliest(all),
    });
  } else {
    for (const cluster of adjacentClusters(thermalIds, modules)) {
      const conds = cluster.flatMap((id) => thermal.get(id)!);
      let sev = worst(conds);
      const since = earliest(conds);
      const forecast = thermalForecast(cluster, ctx);

      if (cluster.length === 1) {
        const id = cluster[0];
        const lowV = (voltage.get(id) ?? []).filter((c) => LOW_VOLTAGE_CODES.includes(c.code));
        if (lowV.length) {
          voltageExplained.add(id);
          problems.push({
            category: 'thermal',
            moduleIds: [id],
            severity: 'critical',
            title: 'Suspected internal short circuit',
            diagnosis: `${id} is heating while its voltage falls. This is the signature of an internal short circuit, a common precursor to thermal runaway.`,
            action: 'Stop the bus safely and evacuate passengers if the temperature keeps rising. Isolate the pack and call emergency maintenance.',
            forecast,
            since: earliest([...conds, ...lowV]),
          });
          continue;
        }
        problems.push({
          category: 'thermal',
          moduleIds: [id],
          severity: sev,
          title: 'Isolated thermal event',
          diagnosis: `${id} is heating while its neighbours are normal. Possible internal short, cell defect or early-stage thermal runaway.`,
          action: isCrit(sev)
            ? 'Stop the bus safely and prepare to evacuate. Notify maintenance immediately.'
            : 'Reduce load and monitor closely. Prepare to stop if it keeps rising.',
          forecast,
          since,
        });
        continue;
      }

      // Two or more adjacent modules: propagation if one clearly started first.
      const starts = cluster.map((id) => ({ id, t: earliest(thermal.get(id)!).getTime() })).sort((a, b) => a.t - b.t);
      const delayMs = config.propagationDelaySec * 1000;
      const source = starts[0];
      const propagating = starts.slice(1).every((s) => s.t - source.t >= delayMs);
      const range = describeModules(cluster, modules);

      if (propagating) {
        sev = 'critical';
        const others = starts.slice(1).map((s) => s.id).join(', ');
        problems.push({
          category: 'thermal',
          moduleIds: cluster,
          severity: sev,
          title: `Thermal propagation from ${source.id}`,
          diagnosis: `Heat is spreading from ${source.id} into neighbouring module(s) ${others}. This is how thermal runaway cascades through a pack.`,
          action: 'Stop the bus and evacuate passengers. Isolate the pack and contact emergency services if smoke or venting is seen.',
          forecast,
          since,
        });
      } else {
        problems.push({
          category: 'thermal',
          moduleIds: cluster,
          severity: sev,
          title: `Multi-module heating (${range})`,
          diagnosis: `Adjacent modules ${range} are heating together. Likely a localised cooling failure (blocked coolant channel or failed fan) or heat spreading between modules.`,
          action: isCrit(sev)
            ? 'Reduce load immediately, check coolant flow to this section and prepare to stop safely.'
            : 'Reduce load and check cooling for this section of the pack.',
          forecast,
          since,
        });
      }
    }
  }

  // ---- Voltage ----
  const highIds: string[] = [];
  const lowIds: string[] = [];
  for (const [id, conds] of voltage) {
    if (voltageExplained.has(id)) continue;
    if (conds.some((c) => HIGH_VOLTAGE_CODES.includes(c.code))) highIds.push(id);
    if (conds.some((c) => LOW_VOLTAGE_CODES.includes(c.code))) lowIds.push(id);
  }
  const voltConds = (ids: string[], codes: ConditionCode[]) =>
    ids.flatMap((id) => voltage.get(id)!.filter((c) => codes.includes(c.code)));

  if (highIds.length) {
    const conds = voltConds(highIds, HIGH_VOLTAGE_CODES);
    const sev = worst(conds);
    const absolute = conds.some((c) => c.code === 'volt_high');
    problems.push({
      category: 'voltage',
      moduleIds: highIds,
      severity: sev,
      title: absolute ? 'Over-voltage' : 'Module voltage above pack',
      diagnosis: absolute
        ? `${describeModules(highIds, modules)} above the safe charge limit. Possible charger or regenerative-braking fault, or failed cell balancing.`
        : `${describeModules(highIds, modules)} reading higher than the rest of the pack. Cell imbalance or a measurement fault.`,
      action: isCrit(sev)
        ? 'Stop charging and limit regenerative braking immediately. Inspect the charger and balancing circuit.'
        : 'Limit charging and regenerative braking, and schedule a balancing check.',
      since: earliest(conds),
    });
  }

  if (lowIds.length >= packWideCount) {
    const conds = voltConds(lowIds, LOW_VOLTAGE_CODES);
    const sev = worst(conds);
    problems.push({
      category: 'voltage',
      moduleIds: lowIds,
      severity: sev,
      title: 'Pack voltage low',
      diagnosis: 'Every module is at low voltage: the pack is deeply discharged.',
      action: isCrit(sev)
        ? 'Stop safely to avoid over-discharge damage and arrange a tow or charge.'
        : 'Return to the depot to charge. Avoid heavy acceleration.',
      since: earliest(conds),
    });
  } else {
    for (const id of lowIds) {
      const conds = voltConds([id], LOW_VOLTAGE_CODES);
      const sev = worst(conds);
      problems.push({
        category: 'voltage',
        moduleIds: [id],
        severity: sev,
        title: 'Module voltage drop',
        diagnosis: `${id} voltage is falling while the rest of the pack is stable. Cell degradation, internal leakage or a loose connection.`,
        action: isCrit(sev)
          ? 'Stop safely: the module risks over-discharge damage. Inspect before further use.'
          : 'Reduce load and schedule an inspection. Stop if it keeps falling.',
        forecast: voltageForecast(id, ctx),
        since: earliest(conds),
      });
    }
  }

  // ---- State of charge ----
  const soc = byModule('charge');
  if (soc.size) {
    const ids = [...soc.keys()];
    const conds = ids.flatMap((id) => soc.get(id)!);
    const sev = worst(conds);
    const packWide = ids.length >= packWideCount;
    problems.push({
      category: 'charge',
      moduleIds: ids,
      severity: sev,
      title: packWide ? 'Low state of charge' : `Low charge on ${describeModules(ids, modules)}`,
      diagnosis: packWide
        ? 'The pack is running low on charge.'
        : 'These modules hold much less charge than the rest of the pack. Cell imbalance or a failing module.',
      action: packWide
        ? isCrit(sev)
          ? 'Return to the depot immediately: risk of stranding.'
          : 'Plan a return to the depot to charge.'
        : 'Schedule cell balancing and a capacity check.',
      since: earliest(conds),
    });
  }

  // ---- State of health ----
  const soh = byModule('health');
  if (soh.size) {
    const ids = [...soh.keys()];
    const conds = ids.flatMap((id) => soh.get(id)!);
    problems.push({
      category: 'health',
      moduleIds: ids,
      severity: worst(conds),
      title: 'Degraded module health',
      diagnosis: `${describeModules(ids, modules)} below ${config.soh.low.warn} % state of health: end of service life.`,
      action: 'Schedule module replacement and avoid fast charging until then.',
      since: earliest(conds),
    });
  }

  // ---- Current ----
  for (const [id, conds] of byModule('current')) {
    problems.push({
      category: 'current',
      moduleIds: [id],
      severity: worst(conds),
      title: 'Abnormal module current',
      diagnosis: `Current through ${id} differs from the rest of the series pack. Possible short, bypass path or current-sensor fault.`,
      action: 'Reduce load and inspect the module and its current sensor.',
      since: earliest(conds),
    });
  }

  // ---- Sensors ----
  const sensor = byModule('sensor');
  const missingIds = [...sensor.entries()].filter(([, c]) => c.some((x) => x.code === 'sensor_missing')).map(([id]) => id);
  const commsLossCount = Math.max(2, Math.ceil(config.commsLossFraction * modules.length));

  if (missingIds.length >= commsLossCount) {
    const ids = [...sensor.keys()];
    const conds = ids.flatMap((id) => sensor.get(id)!);
    problems.push({
      category: 'sensor',
      moduleIds: ids,
      severity: 'data_fault',
      title: 'Communication loss',
      diagnosis: `${missingIds.length} of ${modules.length} modules stopped reporting at once. Likely a BMS communication or wiring-bus fault rather than a battery problem.`,
      action: 'The pack is unmonitored: reduce load until data returns, and check the BMS link.',
      since: earliest(conds),
    });
  } else {
    for (const [id, conds] of sensor) {
      const has = (code: ConditionCode) => conds.some((c) => c.code === code);
      const snap = ctx.snapshot.get(id);
      let title: string;
      let diagnosis: string;
      if (has('sensor_missing')) {
        title = 'Sensor dropout';
        diagnosis =
          snap?.current !== null && snap?.current !== undefined
            ? `${id} temperature/voltage are not reported while current is still flowing. Sensor or wiring-harness fault: the module is carrying load unmonitored.`
            : `${id} has stopped reporting. Sensor, wiring or communication fault.`;
      } else if (has('sensor_stuck')) {
        title = 'Stuck sensor';
        diagnosis = `${id} reading has not changed for an unusually long time. The sensor is likely frozen; its value is being ignored.`;
      } else if (has('sensor_implausible')) {
        title = 'Implausible readings';
        diagnosis = `${id} reported physically impossible values or an unrealistic jump. Sensor glitch or corrupted data; those readings are ignored.`;
      } else {
        title = 'Sensor fault reported';
        diagnosis = `${id} reports a non-OK sensor status. Readings may be unreliable.`;
      }
      const neighbourHot = modules
        .filter((_, i) => Math.abs(i - modules.indexOf(id)) === 1)
        .some((n) => thermal.has(n));
      problems.push({
        category: 'sensor',
        moduleIds: [id],
        severity: neighbourHot ? 'warning' : 'data_fault',
        title,
        diagnosis: neighbourHot ? `${diagnosis} A neighbouring module is overheating, so this module may be affected too.` : diagnosis,
        action: 'Treat this module as unverified. Watch its neighbours for heating and schedule a sensor repair.',
        since: earliest(conds),
      });
    }
  }

  // Always list modules in physical order.
  for (const p of problems) p.moduleIds.sort((a, b) => modules.indexOf(a) - modules.indexOf(b));
  return problems;
}
