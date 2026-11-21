import { AnimatePresence, motion } from 'motion/react';
import { describeModules, type Alert } from '../../core';
import { fmtDuration, fmtTime } from '../format';
import { useBusLocation } from '../hooks';
import { spring } from '../motion';
import { isAcknowledged, useDashboard } from '../store';
import { Icon } from './Icon';
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
  const location = useBusLocation();
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
            <Icon name="check" size={26} />
          </span>
          <p>No active alerts</p>
          <p className="muted">All modules are within limits and reporting.</p>
        </div>
      ) : (
        <ul className="alert-list">
          <AnimatePresence initial={false} mode="popLayout">
          {alerts.map((a) => {
            const acked = isAcknowledged(acknowledged, a.id, a.severity);
            return (
              <motion.li
                key={a.id}
                layout
                initial={{ opacity: 0, y: -12, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, x: 40, transition: { duration: 0.2 } }}
                transition={spring}
                className={`alert-card sev-${a.severity}${acked ? ' acked' : ''}`}
              >
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
                {a.forecast && (
                  <p className="alert-forecast">
                    <Icon name="clock" size={15} /> {a.forecast}
                  </p>
                )}
                <p className="alert-action">
                  <strong>Action:</strong> {a.action}
                </p>
                {location?.guidance.depot && (a.severity === 'critical' || a.severity === 'warning') && (
                  <p className="alert-depot">
                    <Icon name="fleet" size={14} />
                    <span>
                      <strong>{location.guidance.headline}</strong> {location.guidance.detail}
                    </span>
                  </p>
                )}
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
              </motion.li>
            );
          })}
          </AnimatePresence>
        </ul>
      )}
    </section>
  );
}
