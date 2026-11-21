import { useMemo } from 'react';
import { SEVERITY_RANK, type PackState, type Timeline } from '../../core';
import { COLORS, useEChart, type ChartOption } from '../charts';
import { fmt, fmtSigned, fmtTime } from '../format';
import { useDashboard } from '../store';
import { StatusBadge } from './StatusBadge';

/**
 * Deep-dive on one module: every reading, its trend and deviation from the pack, and the
 * conditions currently active. Defaults to the most severe module when none is selected.
 */
export function ModuleDetail({ state, timeline, cursor }: { state: PackState; timeline: Timeline; cursor: number }) {
  const selected = useDashboard((s) => s.selectedModule);
  const worst = [...state.modules].sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity])[0];
  const module = state.modules.find((m) => m.id === selected) ?? worst;
  const index = state.modules.indexOf(module);
  const isAuto = !selected || module.id !== selected;

  const option = useMemo<ChartOption>(() => {
    const states = timeline.states.slice(0, cursor + 1);
    const mk = (key: 'temperature' | 'voltage', color: string, axis: number) => ({
      name: key === 'temperature' ? 'Temp (°C)' : 'Voltage (V)',
      type: 'line',
      yAxisIndex: axis,
      showSymbol: false,
      lineStyle: { color, width: 2 },
      itemStyle: { color },
      data: states.map((s) => [s.timestamp.getTime(), s.modules[index]?.[key] ?? null]),
    });
    return {
      animation: false,
      grid: { left: 40, right: 48, top: 24, bottom: 24 },
      legend: { top: 0, textStyle: { color: COLORS.muted, fontSize: 11 }, itemHeight: 8 },
      tooltip: { trigger: 'axis', backgroundColor: '#111821', borderColor: COLORS.grid, textStyle: { color: COLORS.text, fontSize: 12 } },
      xAxis: {
        type: 'time',
        min: timeline.states[0].timestamp.getTime(),
        max: timeline.states[timeline.states.length - 1].timestamp.getTime(),
        axisLabel: { color: COLORS.muted, fontSize: 10, formatter: (v: number) => fmtTime(new Date(v)) },
        splitLine: { show: false },
      },
      yAxis: [
        { type: 'value', scale: true, axisLabel: { color: COLORS.muted, fontSize: 10 }, splitLine: { lineStyle: { color: COLORS.grid } } },
        { type: 'value', scale: true, axisLabel: { color: COLORS.muted, fontSize: 10 }, splitLine: { show: false } },
      ],
      series: [mk('temperature', COLORS.severity.warning, 0), mk('voltage', COLORS.accent, 1)],
    };
  }, [timeline, cursor, index]);
  const ref = useEChart(option);

  const rows: Array<[string, string, string?]> = [
    ['Temperature', fmt(module.temperature, 2, '°C'), `${fmtSigned(module.tempDeviation, 1, '°C')} vs pack`],
    ['Temp rate', fmtSigned(module.tempRatePerMin, 2, '°C/min')],
    ['Voltage', fmt(module.voltage, 3, 'V'), `${fmtSigned(module.voltDeviation === null ? null : module.voltDeviation * 1000, 0, 'mV')} vs pack`],
    ['Voltage rate', fmtSigned(module.voltRatePerMin, 3, 'V/min')],
    ['Current', fmt(module.current, 1, 'A')],
    ['State of charge', fmt(module.soc, 1, '%')],
    ['State of health', fmt(module.soh, 1, '%')],
    ['Data', module.dataStatus === 'ok' ? 'All sensors reporting' : module.dataStatus === 'none' ? 'No data received' : 'Some values missing'],
  ];

  return (
    <section className="panel module-detail" aria-label={`Module ${module.id} detail`}>
      <header className="panel-head">
        <h2>
          Module {module.id} {isAuto && <span className="muted small">(most severe)</span>}
        </h2>
        <StatusBadge severity={module.severity} />
      </header>
      <dl className="detail-grid">
        {rows.map(([k, v, sub]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>
              {v}
              {sub && <small>{sub}</small>}
            </dd>
          </div>
        ))}
      </dl>
      <div className="mini-chart" ref={ref} />
      <h3 className="sub-head">Active conditions</h3>
      {module.conditions.length === 0 ? (
        <p className="muted">None. All checks passing.</p>
      ) : (
        <ul className="condition-list">
          {module.conditions.map((c) => (
            <li key={c.code}>
              <StatusBadge severity={c.severity} compact />
              <span className="cond-code">{c.code.replace(/_/g, ' ')}</span>
              <span>{c.message}</span>
              <span className="muted">since {fmtTime(c.since)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
