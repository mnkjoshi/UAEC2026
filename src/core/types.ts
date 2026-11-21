/**
 * Shared data contract between the detection engine (src/core) and the UI (src/ui).
 *
 * The engine produces these objects; UI components only render them.
 * Change this file only with the whole team's agreement, since both sides depend on it.
 */

/** How urgent a module's or the pack's condition is. See docs/DETECTION_LOGIC.md §6. */
export type Severity =
  | 'normal' // within all limits
  | 'advisory' // logged event, no action needed
  | 'warning' // developing problem, act soon
  | 'critical' // immediate action required
  | 'data_fault'; // sensor/data problem; module state cannot be verified

/** One row of telemetry after parsing. `null` means the value was missing or invalid. */
export interface Reading {
  timestamp: Date;
  moduleId: string;
  temperature: number | null; // °C
  voltage: number | null; // V
  current: number | null; // A
  soc: number | null; // state of charge, %
  soh: number | null; // state of health, %
  sensorStatus: string; // raw status text, e.g. "OK", "MISSING"
}

/** Current evaluated state of one module, as shown on the pack map. */
export interface ModuleState {
  id: string; // e.g. "M07"
  temperature: number | null;
  voltage: number | null;
  current: number | null;
  soc: number | null;
  soh: number | null;
  severity: Severity;
  /** Short human-readable reason for the severity, e.g. "Rising 7.5 °C/min". */
  label?: string;
}

/** An alert raised by the engine. */
export interface Alert {
  id: string;
  moduleIds: string[]; // one or more modules (e.g. an adjacent heating cluster)
  severity: Severity;
  title: string; // e.g. "Isolated thermal event"
  diagnosis: string; // what is likely wrong
  action: string; // what the operator should do
  firstSeen: Date;
  lastSeen: Date;
  acknowledged: boolean;
  cleared: boolean;
}

/** Snapshot of the whole pack at one point in time. */
export interface PackState {
  timestamp: Date;
  severity: Severity; // worst of all modules
  modules: ModuleState[];
  alerts: Alert[];
}
