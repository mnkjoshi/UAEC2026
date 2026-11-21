import type { Severity } from '../../core';
import { SEVERITY_META } from '../format';

/** Icon + word for a severity. Always shown with colour so it reads without colour vision. */
export function StatusBadge({ severity, compact = false }: { severity: Severity; compact?: boolean }) {
  const meta = SEVERITY_META[severity];
  return (
    <span className={`badge sev-${severity}`} title={meta.label}>
      <span className="badge-icon" aria-hidden>
        {meta.icon}
      </span>
      {!compact && <span>{meta.label}</span>}
    </span>
  );
}
