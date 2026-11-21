import { describeModules, type Alert } from '../../core';
import { fmtDuration, fmtTime } from '../format';
import { isAcknowledged, useDashboard } from '../store';
import { StatusBadge } from './StatusBadge';

/**
 * Active alerts, most severe first. Each card answers: what is wrong, where, since when,
 * what will happen next (forecast) and what to do. Unacknowledged criticals pulse.
 */
export function AlertPanel({ alerts, now, modules }: { alerts: Alert[]; now: Date; modules: string[] }) {
  const acknowledged = useDashboard((s) => s.acknowledged);
  const acknowledge = useDashboard((s) => s.acknowledge);
  const acknowledgeAll = useDashboard((s) => s.acknowledgeAll);
  const selectModule = useDashboard((s) => s.selectModule);
  const unacked = alerts.filter((a) => !isAcknowledged(acknowledged, a.id, a.severity)).length;

  return (
    <section className="panel alert-panel" aria-label="Active alerts" aria-live="polite">
      <header className="panel-head">
        <h2>
          Active alerts <span className="count">{alerts.length}</span>
        </h2>
        {unacked > 1 && (
          <button type="button" className="btn small" onClick={acknowledgeAll}>
            Acknowledge all
          </button>
        )}
      </header>

      {alerts.length === 0 ? (
        <div className="empty-alerts">
          <span className="big-check" aria-hidden>
            ✓
          </span>
          <p>No active alerts</p>
          <p className="muted">All modules are within limits and reporting.</p>
        </div>
      ) : (
        <ul className="alert-list">
          {alerts.map((a) => {
            const acked = isAcknowledged(acknowledged, a.id, a.severity);
            return (
              <li key={a.id} className={`alert-card sev-${a.severity}${acked ? ' acked' : ''}`}>
                <div className="alert-top">
                  <StatusBadge severity={a.severity} />
                  <span className="alert-age" title={`First seen ${fmtTime(a.firstSeen)}`}>
                    {fmtDuration(now.getTime() - a.firstSeen.getTime())} ago
                  </span>
                </div>
                <h3>{a.title}</h3>
                <div className="alert-modules">
                  {a.moduleIds.length > 6 ? (
                    <span className="chip">{describeModules(a.moduleIds, modules)}</span>
                  ) : (
                    a.moduleIds.map((id) => (
                      <button type="button" key={id} className="chip" onClick={() => selectModule(id)}>
                        {id}
                      </button>
                    ))
                  )}
                </div>
                <p className="alert-diagnosis">{a.diagnosis}</p>
                {a.forecast && <p className="alert-forecast">⏱ {a.forecast}</p>}
                <p className="alert-action">
                  <strong>Action:</strong> {a.action}
                </p>
                <div className="alert-foot">
                  <span className="muted">
                    {a.id} · since {fmtTime(a.firstSeen)}
                  </span>
                  {acked ? (
                    <span className="muted">Acknowledged</span>
                  ) : (
                    <button type="button" className="btn small" onClick={() => acknowledge(a.id, a.severity)}>
                      Acknowledge
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
