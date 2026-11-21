import type { DetectionConfig, PackKpis, Severity } from '../../core';
import { fmt } from '../format';

interface Kpi {
  label: string;
  value: string;
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
      label: 'Max temperature',
      value: fmt(kpis.maxTemp?.value, 1, '°C'),
      sub: kpis.maxTemp?.moduleId,
      severity: level(kpis.maxTemp?.value, t.warn, t.crit, 'above'),
    },
    {
      label: 'Temp spread',
      value: fmt(kpis.tempSpread, 1, '°C'),
      sub: 'max − min',
      severity: level(kpis.tempSpread ?? undefined, config.temperature.deviation.warn * 2, config.temperature.deviation.crit * 2, 'above'),
    },
    {
      label: 'Min voltage',
      value: fmt(kpis.minVolt?.value, 3, 'V'),
      sub: kpis.minVolt?.moduleId,
      severity: level(minCell, v.warn, v.crit, 'below'),
    },
    {
      label: 'Voltage spread',
      value: fmt(kpis.voltSpreadMv, 0, 'mV'),
      sub: 'max − min',
      severity: level(kpis.voltSpreadMv ?? undefined, config.voltage.deviation.warn * 2000, config.voltage.deviation.crit * 2000, 'above'),
    },
    { label: 'Avg SOC', value: fmt(kpis.avgSoc, 1, '%'), severity: level(kpis.avgSoc ?? undefined, config.soc.low.warn, config.soc.low.crit, 'below') },
    { label: 'Avg SOH', value: fmt(kpis.avgSoh, 1, '%'), severity: level(kpis.avgSoh ?? undefined, config.soh.low.warn, config.soh.low.crit, 'below') },
    { label: 'Pack current', value: fmt(kpis.meanCurrent, 1, 'A'), sub: 'module mean' },
    {
      label: 'Sensors reporting',
      value: `${kpis.reportingModules}/${kpis.totalModules}`,
      severity: kpis.reportingModules < kpis.totalModules ? 'data_fault' : undefined,
    },
  ];

  return (
    <section className="kpi-bar" aria-label="Pack summary">
      {items.map((k) => (
        <div key={k.label} className={`kpi${k.severity ? ` sev-${k.severity}` : ''}`}>
          <span className="kpi-label">{k.label}</span>
          <span className="kpi-value">{k.value}</span>
          <span className="kpi-sub">{k.sub ?? ' '}</span>
        </div>
      ))}
    </section>
  );
}
