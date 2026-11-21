import type { DetectionConfig, PackKpis, Severity } from '../../core';
import { AnimatedNumber } from './AnimatedNumber';

interface Kpi {
  label: string;
  /** A number animates between values; a string (e.g. "11/12") is shown as-is. */
  value: number | null | undefined | string;
  digits?: number;
  unit?: string;
  sub?: string;
  severity?: Severity;
}

/** Headline pack numbers. A value turns amber/red when it crosses the same limits the engine uses. */
export function KpiBar({ kpis, config, cellsInSeries }: { kpis: PackKpis; config: DetectionConfig; cellsInSeries: number }) {
  const t = config.temperature.high;
  const v = config.voltage.low;
  const level = (value: number | undefined, warn: number, crit: number, dir: 'above' | 'below'): Severity | undefined => {
    if (value === undefined) return undefined;
    const beyond = (lim: number) => (dir === 'above' ? value >= lim : value <= lim);
    return beyond(crit) ? 'critical' : beyond(warn) ? 'warning' : undefined;
  };
  const minCell = kpis.minVolt ? kpis.minVolt.value / cellsInSeries : undefined;

  const items: Kpi[] = [
    {
      label: 'Max temp',
      value: kpis.maxTemp?.value, digits: 1, unit: '°C',
      sub: kpis.maxTemp?.moduleId,
      severity: level(kpis.maxTemp?.value, t.warn, t.crit, 'above'),
    },
    {
      label: 'Temp spread',
      value: kpis.tempSpread, digits: 1, unit: '°C',
      sub: 'max − min',
      severity: level(kpis.tempSpread ?? undefined, config.temperature.deviation.warn * 2, config.temperature.deviation.crit * 2, 'above'),
    },
    {
      label: 'Min voltage',
      value: kpis.minVolt?.value, digits: 3, unit: 'V',
      sub: kpis.minVolt?.moduleId,
      severity: level(minCell, v.warn, v.crit, 'below'),
    },
    {
      label: 'Voltage spread',
      value: kpis.voltSpreadMv, digits: 0, unit: 'mV',
      sub: 'max − min',
      severity: level(kpis.voltSpreadMv ?? undefined, config.voltage.deviation.warn * 2000, config.voltage.deviation.crit * 2000, 'above'),
    },
    { label: 'Avg SOC', value: kpis.avgSoc, digits: 1, unit: '%', severity: level(kpis.avgSoc ?? undefined, config.soc.low.warn, config.soc.low.crit, 'below') },
    { label: 'Avg SOH', value: kpis.avgSoh, digits: 1, unit: '%', severity: level(kpis.avgSoh ?? undefined, config.soh.low.warn, config.soh.low.crit, 'below') },
    { label: 'Pack current', value: kpis.meanCurrent, digits: 1, unit: 'A', sub: 'module mean' },
    {
      label: 'Sensors',
      value: `${kpis.reportingModules}/${kpis.totalModules}`,
      severity: kpis.reportingModules < kpis.totalModules ? 'data_fault' : undefined,
    },
  ];

  return (
    <section className="kpi-bar" aria-label="Pack summary">
      {items.map((k) => (
        <div key={k.label} className={`kpi${k.severity ? ` sev-${k.severity}` : ''}`}>
          <span className="kpi-label">{k.label}</span>
          <span className="kpi-value">
            {typeof k.value === 'string' ? k.value : <AnimatedNumber value={k.value} digits={k.digits} unit={k.unit} />}
          </span>
          <span className="kpi-sub">{k.sub ?? ' '}</span>
        </div>
      ))}
    </section>
  );
}
