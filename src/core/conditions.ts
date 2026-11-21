/**
 * Persistence and hysteresis: the false-alarm filter.
 *
 * A detector finding becomes an *active condition* only after it persists for several
 * consecutive samples, and it clears only after several samples back inside the relaxed
 * (hysteresis) threshold. While a module's sensor is unavailable, its hazard conditions
 * are frozen rather than cleared, so a dropout never makes a heating module look healthy.
 */
import type { DetectionConfig } from './config';
import type { Finding } from './detectors/grade';
import { SEVERITY_RANK, maxSeverity, type ActiveCondition, type ConditionCode, type Metric, type Severity } from './types';

/** Which measurement each condition depends on (null = sensor conditions, never frozen). */
const CODE_METRIC: Record<ConditionCode, Metric | null> = {
  temp_high: 'temperature',
  temp_dev: 'temperature',
  temp_rate: 'temperature',
  volt_low: 'voltage',
  volt_high: 'voltage',
  volt_dev_low: 'voltage',
  volt_dev_high: 'voltage',
  volt_rate: 'voltage',
  soc_low: 'soc',
  soh_low: 'soh',
  current_dev: 'current',
  sensor_missing: null,
  sensor_stuck: null,
  sensor_implausible: null,
  sensor_status: null,
};

export const isSensorCode = (code: ConditionCode) => code.startsWith('sensor_');

interface Tracked {
  moduleId: string;
  code: ConditionCode;
  confirmed: boolean;
  severity: Severity;
  pending: number; // consecutive samples the condition has been raised
  clearCount: number; // consecutive samples it has been absent
  since: Date;
  message: string;
}

/** A condition that appeared but vanished before being confirmed (e.g. a single-sample dropout). */
export interface TransientCondition {
  moduleId: string;
  code: ConditionCode;
  samples: number;
  message: string;
}

export class ConditionTracker {
  private readonly states = new Map<string, Tracked>();
  private readonly config: DetectionConfig;

  constructor(config: DetectionConfig) {
    this.config = config;
  }

  /**
   * @param findings     everything the detectors reported at this timestamp
   * @param unavailable  "moduleId:metric" keys whose value could not be trusted this timestamp
   */
  update(findings: Finding[], unavailable: Set<string>, time: Date) {
    const p = this.config.persistence;
    const transients: TransientCondition[] = [];
    const seen = new Set<string>();

    const raiseAfter = (code: ConditionCode, severity: Severity) =>
      isSensorCode(code) ? p.sensor : severity === 'critical' ? p.critical : p.warning;
    const clearAfter = (code: ConditionCode) => (isSensorCode(code) ? p.sensorClear : p.clear);
    const dropTransient = (key: string, s: Tracked) => {
      transients.push({ moduleId: s.moduleId, code: s.code, samples: s.pending, message: s.message });
      this.states.delete(key);
    };

    for (const f of findings) {
      const key = `${f.moduleId}:${f.code}`;
      seen.add(key);
      let s = this.states.get(key);

      if (f.raise) {
        if (!s) {
          s = { moduleId: f.moduleId, code: f.code, confirmed: false, severity: f.raise, pending: 0, clearCount: 0, since: time, message: f.message };
          this.states.set(key, s);
        }
        s.pending++;
        s.clearCount = 0;
        s.message = f.message;
        if (!s.confirmed) {
          s.severity = f.raise;
          if (s.pending >= raiseAfter(f.code, f.raise)) s.confirmed = true;
        } else {
          // Escalate immediately; de-escalate only once the relaxed threshold is crossed.
          const held = f.hold && SEVERITY_RANK[f.hold] >= SEVERITY_RANK[s.severity] ? s.severity : (f.hold ?? f.raise);
          s.severity = maxSeverity(f.raise, held);
        }
      } else if (s) {
        // Only within the hysteresis margin.
        if (s.confirmed) {
          s.clearCount = 0;
          s.message = f.message;
          if (f.hold && SEVERITY_RANK[f.hold] < SEVERITY_RANK[s.severity]) s.severity = f.hold;
        } else {
          dropTransient(key, s);
        }
      }
    }

    for (const [key, s] of this.states) {
      if (seen.has(key)) continue;
      const metric = CODE_METRIC[s.code];
      if (metric && unavailable.has(`${s.moduleId}:${metric}`)) continue; // unknown: hold state
      if (!s.confirmed) {
        dropTransient(key, s);
        continue;
      }
      if (++s.clearCount >= clearAfter(s.code)) this.states.delete(key);
    }

    const active: ActiveCondition[] = [...this.states.values()]
      .filter((s) => s.confirmed)
      .map((s) => ({ moduleId: s.moduleId, code: s.code, severity: s.severity, message: s.message, since: s.since }));

    return { active, transients };
  }
}
