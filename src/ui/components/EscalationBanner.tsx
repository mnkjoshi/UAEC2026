import { fmtDuration } from '../format';
import { useEscalation } from '../hooks';
import { useDashboard } from '../store';
import { Icon } from './Icon';

/**
 * Shown when a critical alert has gone unacknowledged too long: in a real depot this is
 * the point where the system pages the shift supervisor.
 */
export function EscalationBanner() {
  const escalated = useEscalation();
  const acknowledge = useDashboard((s) => s.acknowledge);
  if (!escalated.length) return null;

  return (
    <section className="escalation" role="alert">
      <span className="esc-icon" aria-hidden>
        <Icon name="warningTriangle" size={22} />
      </span>
      <div className="esc-text">
        <strong>Escalated to depot supervisor.</strong>{' '}
        {escalated.map(({ alert, waitedMs }, i) => (
          <span key={alert.id}>
            {i > 0 && '; '}
            {alert.title} ({alert.moduleIds.join(', ')}) unacknowledged for {fmtDuration(waitedMs)}
          </span>
        ))}
        .
      </div>
      <button
        type="button"
        className="btn small"
        onClick={() => escalated.forEach(({ alert }) => acknowledge(alert.id, alert.severity))}
      >
        Acknowledge {escalated.length > 1 ? 'all' : ''}
      </button>
    </section>
  );
}
