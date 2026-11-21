/**
 * Alert lifecycle: keeps one alert per ongoing problem.
 *
 * Each timestamp's problems are matched to existing alerts (same category, overlapping
 * modules) so an alert keeps its identity as it grows (M04 → M04–M06), escalates or
 * is renamed. Problems with no match raise new alerts; alerts with no problem are cleared.
 */
import type { Problem } from './diagnosis';
import { SEVERITY_RANK, maxSeverity, type Alert, type EventLogEntry } from './types';

export class AlertManager {
  private active: Alert[] = [];
  private readonly history: Alert[] = [];
  private counter = 0;

  update(problems: Problem[], time: Date, frameIndex: number, nextEventId: () => string) {
    const events: EventLogEntry[] = [];
    const matched = new Set<Alert>();
    const merged = new Set<Alert>();
    const log = (alert: Alert, kind: EventLogEntry['kind'], message: string) =>
      events.push({
        id: nextEventId(),
        frameIndex,
        time,
        severity: kind === 'cleared' || kind === 'merged' ? 'normal' : alert.severity,
        kind,
        moduleIds: [...alert.moduleIds],
        message,
        alertId: alert.id,
      });

    for (const p of problems) {
      const existing = this.active.find(
        (a) => !matched.has(a) && a.category === p.category && a.moduleIds.some((id) => p.moduleIds.includes(id)),
      );

      if (existing) {
        matched.add(existing);
        // Other alerts this problem now covers (e.g. two clusters that became one) are merged in.
        for (const other of this.active) {
          if (matched.has(other) || other.category !== p.category) continue;
          if (!other.moduleIds.some((id) => p.moduleIds.includes(id))) continue;
          matched.add(other);
          other.clearedAt = time;
          merged.add(other);
          log(other, 'merged', `${other.title}: merged into ${existing.id} (${p.title})`);
        }
        const before = existing.severity;
        const previousTitle = existing.title;
        Object.assign(existing, {
          moduleIds: [...p.moduleIds],
          severity: p.severity,
          peakSeverity: maxSeverity(existing.peakSeverity, p.severity),
          title: p.title,
          diagnosis: p.diagnosis,
          action: p.action,
          forecast: p.forecast,
          lastSeen: time,
        });
        if (SEVERITY_RANK[p.severity] > SEVERITY_RANK[before]) {
          log(existing, 'escalated', `${p.title}: escalated to ${p.severity.replace('_', ' ').toUpperCase()}`);
        } else if (SEVERITY_RANK[p.severity] < SEVERITY_RANK[before]) {
          log(existing, 'downgraded', `${p.title}: eased to ${p.severity.replace('_', ' ')}`);
        } else if (p.title !== previousTitle) {
          // Same urgency, new understanding (e.g. isolated event → propagation).
          log(existing, 'updated', `${previousTitle} → ${p.title}`);
        }
        continue;
      }

      const alert: Alert = {
        id: `ALT-${String(++this.counter).padStart(3, '0')}`,
        category: p.category,
        moduleIds: [...p.moduleIds],
        severity: p.severity,
        peakSeverity: p.severity,
        title: p.title,
        diagnosis: p.diagnosis,
        action: p.action,
        forecast: p.forecast,
        firstSeen: time,
        lastSeen: time,
      };
      this.active.push(alert);
      this.history.push(alert);
      matched.add(alert);
      log(alert, 'raised', p.title);
    }

    for (const alert of this.active) {
      if (matched.has(alert)) continue;
      alert.clearedAt = time;
      log(alert, 'cleared', `${alert.title}: cleared`);
    }
    this.active = this.active.filter((a) => matched.has(a) && !merged.has(a));

    // Snapshot copies, so later updates do not change earlier frames.
    const snapshot = this.active.map((a) => ({ ...a, moduleIds: [...a.moduleIds] }));
    return { alerts: snapshot, events };
  }

  /** Every alert raised so far, including cleared ones. */
  allAlerts(): Alert[] {
    return this.history.map((a) => ({ ...a, moduleIds: [...a.moduleIds] }));
  }
}
