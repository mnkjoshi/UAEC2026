import type { PackState } from '../../core';
import { SEVERITY_ICON, SEVERITY_META, fmtTime } from '../format';
import { isAcknowledged, useDashboard } from '../store';
import { Icon } from './Icon';

/** Full-width pack status: the single most important thing on screen. */
export function StatusBanner({ state }: { state: PackState }) {
  const acknowledged = useDashboard((s) => s.acknowledged);
  const meta = SEVERITY_META[state.severity];
  const top = state.alerts[0];
  const counts = {
    critical: state.alerts.filter((a) => a.severity === 'critical').length,
    warning: state.alerts.filter((a) => a.severity === 'warning').length,
    data: state.alerts.filter((a) => a.severity === 'data_fault').length,
  };
  const needsAttention = state.alerts.some(
    (a) => a.severity === 'critical' && !isAcknowledged(acknowledged, a.id, a.severity),
  );

  return (
    <section
      className={`status-banner sev-${state.severity}${needsAttention ? ' attention' : ''}`}
      role="status"
      aria-live="assertive"
    >
      <div className="banner-icon" aria-hidden>
        <Icon name={SEVERITY_ICON[state.severity]} size={26} />
      </div>
      <div className="banner-text">
        <div className="banner-level">{meta.banner}</div>
        <div className="banner-detail">
          {top ? `${top.title}: ${top.moduleIds.length > 4 ? `${top.moduleIds.length} modules` : top.moduleIds.join(', ')}` : 'Every module is within limits and reporting.'}
        </div>
      </div>
      <div className="banner-counts">
        <span title="Critical alerts">{counts.critical} critical</span>
        <span title="Warnings">{counts.warning} warning</span>
        <span title="Data faults">{counts.data} data</span>
      </div>
      <div className="banner-time">
        <span className="muted">Telemetry time</span>
        <strong>{fmtTime(state.timestamp)}</strong>
      </div>
    </section>
  );
}
