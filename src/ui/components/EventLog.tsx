import { useMemo, useState } from 'react';
import type { Timeline } from '../../core';
import { fmtTime } from '../format';
import { StatusBadge } from './StatusBadge';

const KIND_LABEL: Record<string, string> = {
  raised: 'Raised',
  escalated: 'Escalated',
  downgraded: 'Eased',
  updated: 'Updated',
  cleared: 'Cleared',
  merged: 'Merged',
  transient: 'Ignored',
  data: 'Data',
};

/** Escapes a value for CSV output. */
const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** Chronological record of everything the engine decided, up to the playback position. Exportable. */
export function EventLog({ timeline, cursor, sourceName }: { timeline: Timeline; cursor: number; sourceName: string }) {
  const [showMinor, setShowMinor] = useState(true);
  const events = useMemo(
    () =>
      timeline.events
        .filter((e) => e.frameIndex <= cursor)
        .filter((e) => showMinor || (e.kind !== 'transient' && e.kind !== 'data'))
        .reverse(),
    [timeline, cursor, showMinor],
  );

  const exportCsv = () => {
    const header = ['Time', 'Event', 'Severity', 'Modules', 'Alert ID', 'Message'];
    const rows = timeline.events
      .filter((e) => e.frameIndex <= cursor)
      .map((e) => [e.time.toISOString(), KIND_LABEL[e.kind], e.severity, e.moduleIds.join(' '), e.alertId ?? '', e.message]);
    const text = [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `alert-log-${sourceName.replace(/[^a-z0-9]+/gi, '_')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="panel event-log" aria-label="Event log">
      <header className="panel-head">
        <h2>
          Event log <span className="count">{events.length}</span>
        </h2>
        <div className="row-gap">
          <label className="check">
            <input type="checkbox" checked={showMinor} onChange={(e) => setShowMinor(e.target.checked)} /> Show ignored blips
          </label>
          <button type="button" className="btn small" onClick={exportCsv} disabled={!events.length}>
            ⬇ Export CSV
          </button>
        </div>
      </header>
      {events.length === 0 ? (
        <p className="muted pad">No events yet.</p>
      ) : (
        <ol className="log-list">
          {events.map((e) => (
            <li key={e.id} className={`log-${e.kind}`}>
              <span className="log-time">{fmtTime(e.time)}</span>
              <StatusBadge severity={e.severity} compact />
              <span className="log-kind">{KIND_LABEL[e.kind]}</span>
              <span className="log-msg">{e.message}</span>
              <span className="log-mods muted">{e.moduleIds.length > 4 ? `${e.moduleIds.length} modules` : e.moduleIds.join(', ')}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
