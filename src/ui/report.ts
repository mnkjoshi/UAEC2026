/**
 * Incident report: a self-contained, printable HTML document describing what happened
 * up to the current playback position. Opens in a new tab; "Print / Save as PDF" from there.
 *
 * Charts are drawn as inline SVG so the report has no dependencies and prints crisply.
 */
import { SEVERITY_RANK, describeModules, type DetectionConfig, type ParsedDataset, type Severity, type Timeline } from '../core';
import { SEVERITY_META, fmt, fmtTime } from './format';

const SEV_COLOR: Record<Severity, string> = {
  normal: '#1a7f37',
  advisory: '#0969da',
  data_fault: '#8250df',
  warning: '#9a6700',
  critical: '#cf222e',
};

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

const badge = (s: Severity) =>
  `<span class="badge" style="color:${SEV_COLOR[s]};border-color:${SEV_COLOR[s]}">${SEVERITY_META[s].icon} ${SEVERITY_META[s].label}</span>`;

/** One metric over time for the given modules, with optional warning/critical lines. */
function traceSvg(
  timeline: Timeline,
  cursor: number,
  moduleIds: string[],
  metric: 'temperature' | 'voltage',
  lines: Array<{ value: number; color: string; label: string }>,
): string {
  const W = 640;
  const H = 180;
  const P = { l: 44, r: 10, t: 10, b: 22 };
  const states = timeline.states.slice(0, cursor + 1);
  const idx = moduleIds.map((id) => states[0].modules.findIndex((m) => m.id === id)).filter((i) => i >= 0);
  const all = states.flatMap((s) => s.modules.map((m) => m[metric])).filter((v): v is number => v !== null);
  if (!all.length || states.length < 2) return '';
  let lo = Math.min(...all);
  let hi = Math.max(...all);
  const visible = lines.filter((l) => l.value >= lo - (hi - lo) * 0.3 && l.value <= hi + (hi - lo) * 0.3);
  lo = Math.min(lo, ...visible.map((l) => l.value));
  hi = Math.max(hi, ...visible.map((l) => l.value));
  const pad = (hi - lo) * 0.08 || 1;
  lo -= pad;
  hi += pad;
  const x = (i: number) => P.l + (i / (states.length - 1)) * (W - P.l - P.r);
  const y = (v: number) => P.t + (1 - (v - lo) / (hi - lo)) * (H - P.t - P.b);

  const path = (mi: number) => {
    let d = '';
    let pen = false;
    states.forEach((s, i) => {
      const v = s.modules[mi]?.[metric];
      if (v === null || v === undefined) {
        pen = false;
        return;
      }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)} `;
      pen = true;
    });
    return d;
  };

  const others = states[0].modules.map((_, i) => i).filter((i) => !idx.includes(i));
  const palette = ['#cf222e', '#bc4c00', '#8250df', '#0969da'];
  const digits = metric === 'temperature' ? 0 : 2;
  return `<svg viewBox="0 0 ${W} ${H}" class="trace" role="img" aria-label="${metric} trace">
    ${[lo + pad, (lo + hi) / 2, hi - pad]
      .map((v) => `<text x="${P.l - 6}" y="${y(v) + 4}" text-anchor="end" class="axis">${v.toFixed(digits)}</text><line x1="${P.l}" x2="${W - P.r}" y1="${y(v)}" y2="${y(v)}" class="grid"/>`)
      .join('')}
    ${visible.map((l) => `<line x1="${P.l}" x2="${W - P.r}" y1="${y(l.value)}" y2="${y(l.value)}" stroke="${l.color}" stroke-dasharray="5 4"/><text x="${W - P.r - 4}" y="${y(l.value) - 4}" text-anchor="end" fill="${l.color}" class="axis">${l.label}</text>`).join('')}
    ${others.map((i) => `<path d="${path(i)}" fill="none" stroke="#c4ccd4" stroke-width="1"/>`).join('')}
    ${idx.map((i, n) => `<path d="${path(i)}" fill="none" stroke="${palette[n % palette.length]}" stroke-width="2.2"/>`).join('')}
    <text x="${P.l}" y="${H - 4}" class="axis">${fmtTime(states[0].timestamp)}</text>
    <text x="${W - P.r}" y="${H - 4}" text-anchor="end" class="axis">${fmtTime(states[states.length - 1].timestamp)}</text>
  </svg>
  <div class="legend">${idx.map((i, n) => `<span style="color:${palette[n % palette.length]}">■ ${states[0].modules[i].id}</span>`).join(' ')} <span style="color:#8c959f">■ other modules</span></div>`;
}

export function buildIncidentReport(
  dataset: ParsedDataset,
  timeline: Timeline,
  cursor: number,
  config: DetectionConfig,
  sourceName: string,
): string {
  const state = timeline.states[cursor];
  const start = timeline.states[0].timestamp;
  const alerts = timeline.alertHistory
    .filter((a) => a.firstSeen <= state.timestamp)
    .sort((a, b) => SEVERITY_RANK[b.peakSeverity] - SEVERITY_RANK[a.peakSeverity] || a.firstSeen.getTime() - b.firstSeen.getTime());
  const events = timeline.events.filter((e) => e.frameIndex <= cursor && e.kind !== 'transient');
  const worst = alerts.reduce<Severity>((w, a) => (SEVERITY_RANK[a.peakSeverity] > SEVERITY_RANK[w] ? a.peakSeverity : w), 'normal');
  const hazard = alerts.filter((a) => a.peakSeverity === 'critical' || a.peakSeverity === 'warning');
  const cells = timeline.cellsInSeries;
  const q = dataset.quality;

  const summary = alerts.length
    ? `Between ${fmtTime(start)} and ${fmtTime(state.timestamp)} the monitor raised <b>${alerts.length}</b> alert${alerts.length > 1 ? 's' : ''}
       (${hazard.length} battery hazard${hazard.length === 1 ? '' : 's'}, ${alerts.length - hazard.length} sensor/data). The most severe was
       <b>${esc(alerts[0].title)}</b> on ${esc(describeModules(alerts[0].moduleIds, dataset.modules))}, first detected at ${fmtTime(alerts[0].firstSeen)}.
       ${state.alerts.length ? `${state.alerts.length} alert${state.alerts.length > 1 ? 's were' : ' was'} still active at the end of the period.` : 'All alerts had cleared by the end of the period.'}`
    : `No alerts were raised between ${fmtTime(start)} and ${fmtTime(state.timestamp)}. All ${dataset.modules.length} modules stayed within limits.`;

  const traces = hazard
    .slice(0, 4)
    .map((a) => {
      const mods = a.moduleIds.slice(0, 4);
      const metric = a.category === 'voltage' ? 'voltage' : 'temperature';
      const lines =
        metric === 'temperature'
          ? [
              { value: config.temperature.high.warn, color: SEV_COLOR.warning, label: `${config.temperature.high.warn} °C warning` },
              { value: config.temperature.high.crit, color: SEV_COLOR.critical, label: `${config.temperature.high.crit} °C critical` },
            ]
          : [
              { value: config.voltage.low.warn * cells, color: SEV_COLOR.warning, label: `${(config.voltage.low.warn * cells).toFixed(2)} V warning` },
              { value: config.voltage.low.crit * cells, color: SEV_COLOR.critical, label: `${(config.voltage.low.crit * cells).toFixed(2)} V critical` },
            ];
      return `<figure><figcaption>${esc(a.id)} · ${esc(a.title)}: ${metric}</figcaption>${traceSvg(timeline, cursor, mods, metric, lines)}</figure>`;
    })
    .join('');

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Incident report: ${esc(sourceName)}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body { font: 14px/1.5 system-ui, -apple-system, 'Segoe UI', sans-serif; color: #1f2328; max-width: 860px; margin: 32px auto; padding: 0 24px; }
  h1 { font-size: 24px; margin: 0 0 4px; } h2 { font-size: 17px; margin: 28px 0 8px; border-bottom: 1px solid #d0d7de; padding-bottom: 4px; }
  .meta { color: #59636e; margin: 0 0 18px; }
  .status { display: flex; gap: 12px; align-items: center; padding: 12px 16px; border-radius: 8px; border: 1px solid ${SEV_COLOR[worst]}; background: ${SEV_COLOR[worst]}0f; }
  .badge { display: inline-block; border: 1px solid; border-radius: 999px; padding: 0 8px; font-size: 12px; font-weight: 600; white-space: nowrap; }
  table { border-collapse: collapse; width: 100%; font-size: 13px; } th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #d0d7de; vertical-align: top; }
  th { color: #59636e; font-weight: 600; } td.num { font-variant-numeric: tabular-nums; white-space: nowrap; }
  figure { margin: 14px 0; break-inside: avoid; } figcaption { font-weight: 600; margin-bottom: 4px; }
  .trace { width: 100%; height: auto; } .trace .axis { font-size: 10px; fill: #59636e; } .trace .grid { stroke: #eaeef2; }
  .legend { font-size: 12px; } .muted { color: #59636e; }
  .alert-detail { margin: 2px 0 0; color: #424a53; }
  .toolbar { position: sticky; top: 0; background: #fff; padding: 8px 0 12px; display: flex; gap: 8px; justify-content: flex-end; }
  .toolbar button { font: inherit; padding: 6px 14px; border-radius: 6px; border: 1px solid #d0d7de; background: #f6f8fa; cursor: pointer; }
  @media print { .toolbar { display: none; } body { margin: 0; } }
</style></head><body>
<div class="toolbar"><button onclick="print()">Print / Save as PDF</button></div>
<h1>Battery incident report</h1>
<p class="meta">${esc(sourceName)} · telemetry ${fmtTime(start)} to ${fmtTime(state.timestamp)} · ${dataset.modules.length} modules · generated ${new Date().toLocaleString()}</p>

<div class="status">${badge(worst)}<div>${summary}</div></div>

<h2>Alerts</h2>
${alerts.length ? `<table><tr><th>ID</th><th>Peak</th><th>Alert</th><th>Modules</th><th>Detected</th><th>Cleared</th></tr>
${alerts
  .map(
    (a) => `<tr><td class="num">${a.id}</td><td>${badge(a.peakSeverity)}</td>
  <td><b>${esc(a.title)}</b><p class="alert-detail">${esc(a.diagnosis)}</p><p class="alert-detail"><b>Action:</b> ${esc(a.action)}</p></td>
  <td>${esc(describeModules(a.moduleIds, dataset.modules))}</td><td class="num">${fmtTime(a.firstSeen)}</td>
  <td class="num">${a.clearedAt && a.clearedAt <= state.timestamp ? fmtTime(a.clearedAt) : '<b>Active</b>'}</td></tr>`,
  )
  .join('')}</table>` : '<p class="muted">None.</p>'}

${traces ? `<h2>Traces</h2>${traces}` : ''}

<h2>Pack at end of period (${fmtTime(state.timestamp)})</h2>
<table><tr><th>Module</th><th>Status</th><th>Temp</th><th>Voltage</th><th>Current</th><th>SOC</th><th>SOH</th><th>Note</th></tr>
${state.modules
  .map(
    (m) => `<tr><td class="num"><b>${m.id}</b></td><td>${badge(m.severity)}</td><td class="num">${fmt(m.temperature, 1, '°C')}</td>
  <td class="num">${fmt(m.voltage, 3, 'V')}</td><td class="num">${fmt(m.current, 1, 'A')}</td><td class="num">${fmt(m.soc, 1, '%')}</td>
  <td class="num">${fmt(m.soh, 1, '%')}</td><td>${esc(m.label ?? '')}</td></tr>`,
  )
  .join('')}</table>

<h2>Event log</h2>
${events.length ? `<table><tr><th>Time</th><th>Event</th><th>Detail</th></tr>${events
  .map((e) => `<tr><td class="num">${fmtTime(e.time)}</td><td>${badge(e.severity)} ${e.kind}</td><td>${esc(e.message)} <span class="muted">${esc(e.moduleIds.length > 4 ? `${e.moduleIds.length} modules` : e.moduleIds.join(', '))}</span></td></tr>`)
  .join('')}</table>` : '<p class="muted">No events.</p>'}

<h2>Data quality</h2>
<p>${q.acceptedRows} of ${q.totalRows} rows used · ${q.missingValues} missing and ${q.invalidValues + timeline.implausibleValues} corrupted values · ${q.duplicateRows} duplicates · sample interval ${q.intervalSec} s${cells > 1 ? ` · ${cells} cells per module` : ''}.</p>
${q.notes.length ? `<ul>${q.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}

<h2>Thresholds in force</h2>
<table>
<tr><th>Check</th><th>Warning</th><th>Critical</th></tr>
<tr><td>Temperature</td><td class="num">${config.temperature.high.warn} °C</td><td class="num">${config.temperature.high.crit} °C</td></tr>
<tr><td>Temperature above pack median</td><td class="num">${config.temperature.deviation.warn} °C</td><td class="num">${config.temperature.deviation.crit} °C</td></tr>
<tr><td>Temperature rise</td><td class="num">${config.temperature.riseRate.warn} °C/min</td><td class="num">${config.temperature.riseRate.crit} °C/min</td></tr>
<tr><td>Cell voltage low</td><td class="num">${config.voltage.low.warn} V</td><td class="num">${config.voltage.low.crit} V</td></tr>
<tr><td>Cell voltage high</td><td class="num">${config.voltage.high.warn} V</td><td class="num">${config.voltage.high.crit} V</td></tr>
<tr><td>Voltage from pack median</td><td class="num">${config.voltage.deviation.warn * 1000} mV</td><td class="num">${config.voltage.deviation.crit * 1000} mV</td></tr>
<tr><td>Persistence to raise</td><td class="num">${config.persistence.warning} samples</td><td class="num">${config.persistence.critical} samples</td></tr>
</table>
<p class="muted">Generated by Battery Safety Monitor. Detection is causal: each decision used only data available at that moment.</p>
</body></html>`;
}

/** Opens the report in a new tab. */
export function openIncidentReport(...args: Parameters<typeof buildIncidentReport>) {
  const html = buildIncidentReport(...args);
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
