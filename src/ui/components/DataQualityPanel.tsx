import type { ParsedDataset, Timeline } from '../../core';
import { fmtDuration } from '../format';

/** What was wrong with the input file and how it was handled. Proves the data was not silently trusted. */
export function DataQualityPanel({ dataset, timeline }: { dataset: ParsedDataset; timeline: Timeline }) {
  const q = dataset.quality;
  const expectedRows = q.frameCount * q.moduleCount;
  const coverage = expectedRows ? (q.acceptedRows / expectedRows) * 100 : 0;
  const badCells = q.missingValues + q.invalidValues + timeline.implausibleValues;
  const score = Math.max(0, Math.min(100, coverage - (badCells / Math.max(1, expectedRows * 5)) * 100));
  const scoreClass = score >= 99 ? 'sev-normal' : score >= 90 ? 'sev-warning' : 'sev-critical';

  const stats: Array<[string, string | number]> = [
    ['Rows read', q.totalRows],
    ['Rows used', q.acceptedRows],
    ['Rows skipped', q.rejectedRows],
    ['Duplicates', q.duplicateRows],
    ['Missing values', q.missingValues],
    ['Corrupted values', q.invalidValues + timeline.implausibleValues],
    ['Status flags', q.statusFlags],
    ['Timestamps', q.frameCount],
    ['Interval', fmtDuration(q.intervalSec * 1000)],
    ['Modules', q.moduleCount],
    ['Gaps', q.gaps],
    ['Voltage level', timeline.cellsInSeries > 1 ? `${timeline.cellsInSeries} cells/module` : 'Cell-level'],
  ];

  return (
    <section className="panel data-quality" aria-label="Data quality">
      <header className="panel-head">
        <h2>Data quality</h2>
        <span className={`dq-score ${scoreClass}`}>{score.toFixed(1)}%</span>
      </header>
      <p className="muted small">{dataset.name}</p>
      <dl className="dq-grid">
        {stats.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      {q.notes.length > 0 ? (
        <ul className="dq-notes">
          {q.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      ) : (
        <p className="muted small">No structural problems found in this file.</p>
      )}
    </section>
  );
}
