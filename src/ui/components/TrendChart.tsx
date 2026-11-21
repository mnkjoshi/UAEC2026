import { useMemo } from 'react';
import { METRICS, type DetectionConfig, type Metric, type Timeline } from '../../core';
import { COLORS, useEChart, type ChartOption } from '../charts';
import { METRIC_META, fmtTime } from '../format';
import { useDashboard } from '../store';

/** Warning/critical reference lines for each metric, in display units. */
function thresholdLines(metric: Metric, config: DetectionConfig, cells: number) {
  const line = (value: number, sev: 'warning' | 'critical', name: string) => ({
    yAxis: value,
    name,
    lineStyle: { color: COLORS.severity[sev], type: 'dashed', width: 1 },
    label: { formatter: name, color: COLORS.severity[sev], position: 'insideEndTop', fontSize: 10 },
  });
  switch (metric) {
    case 'temperature':
      return [line(config.temperature.high.warn, 'warning', `Warn ${config.temperature.high.warn} °C`), line(config.temperature.high.crit, 'critical', `Crit ${config.temperature.high.crit} °C`)];
    case 'voltage':
      return [
        line(config.voltage.low.warn * cells, 'warning', `Low warn ${config.voltage.low.warn * cells} V`),
        line(config.voltage.low.crit * cells, 'critical', `Low crit ${config.voltage.low.crit * cells} V`),
        line(config.voltage.high.warn * cells, 'warning', `High warn ${config.voltage.high.warn * cells} V`),
      ];
    case 'soc':
      return [line(config.soc.low.warn, 'warning', `Warn ${config.soc.low.warn} %`), line(config.soc.low.crit, 'critical', `Crit ${config.soc.low.crit} %`)];
    case 'soh':
      return [line(config.soh.low.warn, 'warning', `Warn ${config.soh.low.warn} %`)];
    default:
      return [];
  }
}

/**
 * Historical trend for one metric, all modules. Healthy modules are drawn as quiet grey
 * lines; modules in trouble take their severity colour; the selected module is highlighted.
 * Only data up to the playback position is shown (no peeking into the future).
 */
export function TrendChart({ timeline, cursor, config }: { timeline: Timeline; cursor: number; config: DetectionConfig }) {
  const metric = useDashboard((s) => s.chartMetric);
  const setMetric = useDashboard((s) => s.setChartMetric);
  const selected = useDashboard((s) => s.selectedModule);
  const selectModule = useDashboard((s) => s.selectModule);

  const option = useMemo<ChartOption>(() => {
    const states = timeline.states.slice(0, cursor + 1);
    const now = timeline.states[cursor];
    const meta = METRIC_META[metric];
    const first = timeline.states[0].timestamp.getTime();
    const lastT = timeline.states[timeline.states.length - 1].timestamp.getTime();

    const series = now.modules.map((m, i) => {
      const isSel = m.id === selected;
      const troubled = m.severity !== 'normal';
      const color = isSel ? COLORS.accent : troubled ? COLORS.severity[m.severity] : COLORS.line;
      return {
        name: m.id,
        type: 'line',
        showSymbol: false,
        connectNulls: false,
        z: isSel ? 5 : troubled ? 4 : 2,
        lineStyle: { width: isSel ? 3 : troubled ? 2 : 1.2, color, opacity: isSel || troubled || !selected ? 1 : 0.55 },
        itemStyle: { color },
        emphasis: { focus: 'series' },
        data: states.map((s) => [s.timestamp.getTime(), s.modules[i]?.[metric] ?? null]),
        ...(i === 0 ? { markLine: { symbol: 'none', silent: true, data: thresholdLines(metric, config, timeline.cellsInSeries) } } : {}),
      };
    });

    return {
      animation: false,
      grid: { left: 56, right: 24, top: 16, bottom: 32 },
      tooltip: {
        trigger: 'axis',
        order: 'valueDesc',
        backgroundColor: '#111821',
        borderColor: COLORS.grid,
        textStyle: { color: COLORS.text, fontSize: 12 },
        valueFormatter: (v: unknown) => (typeof v === 'number' ? `${v.toFixed(meta.digits)} ${meta.unit}` : '—'),
      },
      xAxis: {
        type: 'time',
        min: first,
        max: lastT,
        axisLabel: { color: COLORS.muted, formatter: (v: number) => fmtTime(new Date(v)) },
        axisLine: { lineStyle: { color: COLORS.grid } },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'value',
        scale: true,
        name: meta.unit,
        nameTextStyle: { color: COLORS.muted },
        axisLabel: { color: COLORS.muted },
        splitLine: { lineStyle: { color: COLORS.grid } },
      },
      series,
    };
  }, [timeline, cursor, metric, selected, config]);

  const ref = useEChart(option);

  return (
    <section className="panel trend" aria-label="Historical trends">
      <header className="panel-head">
        <h2>Trends</h2>
        <div className="tabs" role="tablist">
          {METRICS.map((m) => (
            <button key={m} type="button" role="tab" aria-selected={m === metric} className={`tab${m === metric ? ' active' : ''}`} onClick={() => setMetric(m)}>
              {METRIC_META[m].label}
            </button>
          ))}
        </div>
      </header>
      <div className="chart" ref={ref} />
      <div className="chart-legend muted">
        Grey: normal modules · coloured: modules with a problem · blue: selected
        {selected && (
          <button type="button" className="link" onClick={() => selectModule(null)}>
            clear selection
          </button>
        )}
      </div>
    </section>
  );
}
