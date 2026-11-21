import type { Band } from '../config';
import type { ConditionCode, Severity } from '../types';

/**
 * A detector's verdict for one module at one timestamp, before persistence filtering.
 *
 * `raise` is the severity using the normal thresholds (used to start or escalate an alert).
 * `hold` is the severity using thresholds relaxed by the hysteresis margin (used to keep an
 * existing alert alive). hold is always at least as severe as raise.
 */
export interface Finding {
  moduleId: string;
  code: ConditionCode;
  raise: Severity | null;
  hold: Severity | null;
  message: string;
}

/**
 * Grades a value against a warning/critical band.
 * `above` means higher is worse (temperature); `below` means lower is worse (low voltage).
 */
export function grade(
  value: number,
  band: Band,
  direction: 'above' | 'below',
): { raise: Severity | null; hold: Severity | null } {
  const beyond = (limit: number) => (direction === 'above' ? value >= limit : value <= limit);
  const relaxed = (limit: number) => (direction === 'above' ? limit - band.hyst : limit + band.hyst);

  const raise: Severity | null = beyond(band.crit) ? 'critical' : beyond(band.warn) ? 'warning' : null;
  const hold: Severity | null = beyond(relaxed(band.crit))
    ? 'critical'
    : beyond(relaxed(band.warn))
      ? 'warning'
      : null;
  return { raise, hold };
}

/** Builds a Finding only when the value is at least within the hysteresis margin of a threshold. */
export function finding(
  moduleId: string,
  code: ConditionCode,
  result: { raise: Severity | null; hold: Severity | null },
  message: string,
): Finding[] {
  return result.raise || result.hold ? [{ moduleId, code, ...result, message }] : [];
}
