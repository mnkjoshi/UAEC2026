/**
 * Shared data contract between the detection engine (src/core) and the UI (src/ui).
 *
 * The engine produces these objects; UI components only render them.
 * Change this file only with the whole team's agreement, since both sides depend on it.
 */

// ---------------------------------------------------------------------------
// Severity
// ---------------------------------------------------------------------------

/** How urgent a module's or the pack's condition is. See docs/DETECTION_LOGIC.md §6. */
export type Severity =
  | 'normal' // within all limits
  | 'advisory' // logged event, no action needed
  | 'data_fault' // sensor/data problem; module state cannot be verified
  | 'warning' // developing problem, act soon
  | 'critical'; // immediate action required

/**
 * Ordering used everywhere severities are compared.
 * A data fault ranks above advisory (it hides the module's true state)
 * but below real hazards, so a confirmed hazard is never masked by a sensor dropout.
 */
export const SEVERITY_RANK: Record<Severity, number> = {
  normal: 0,
  advisory: 1,
  data_fault: 2,
  warning: 3,
  critical: 4,
};

/** Returns the most severe of the given severities. */
export function maxSeverity(...severities: Severity[]): Severity {
  return severities.reduce<Severity>(
    (worst, s) => (SEVERITY_RANK[s] > SEVERITY_RANK[worst] ? s : worst),
    'normal',
  );
}

// ---------------------------------------------------------------------------
// Telemetry
// ---------------------------------------------------------------------------

/** The five numeric measurements reported for each module. */
export type Metric = 'temperature' | 'voltage' | 'current' | 'soc' | 'soh';

export const METRICS: Metric[] = ['temperature', 'voltage', 'current', 'soc', 'soh'];

/** Why a value could not be used. */
export type DataIssueKind = 'missing' | 'invalid';

export interface DataIssue {
  metric: Metric;
  kind: DataIssueKind;
  raw: string; // the original cell text
}

/** One row of telemetry after parsing. `null` means the value was missing or invalid. */
export interface Reading {
  timestamp: Date;
  moduleId: string;
  temperature: number | null; // °C
  voltage: number | null; // V
  current: number | null; // A
  soc: number | null; // state of charge, %
  soh: number | null; // state of health, %
  sensorStatus: string; // normalised status text, e.g. "OK", "MISSING"
  statusOk: boolean; // true when the status column reports a healthy sensor
  issues: DataIssue[];
}

/** All readings that share one timestamp. A module may be absent from a frame. */
export interface Frame {
  timestamp: Date;
  readings: Map<string, Reading>;
}

/** Summary of everything that was wrong with an input file. */
export interface DataQualityReport {
  totalRows: number;
  acceptedRows: number;
  rejectedRows: number; // unreadable timestamp or module ID
  duplicateRows: number;
  missingValues: number;
  invalidValues: number; // non-numeric text in a numeric column
  statusFlags: number; // rows whose sensor status was not OK
  outOfOrder: boolean;
  gaps: number; // spacing larger than 3x the normal interval
  intervalSec: number; // median spacing between timestamps
  frameCount: number;
  moduleCount: number;
  missingColumns: string[];
  ignoredColumns: string[];
  /** Plain-language notes shown in the Data Quality panel. */
  notes: string[];
}

/** A parsed, validated CSV ready for the engine. */
export interface ParsedDataset {
  name: string;
  frames: Frame[];
  modules: string[]; // natural-sorted; order = physical adjacency
  quality: DataQualityReport;
}

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

/** Every distinct condition a detector can report. */
export type ConditionCode =
  | 'temp_high'
  | 'temp_dev'
  | 'temp_rate'
  | 'volt_low'
  | 'volt_high'
  | 'volt_dev_low'
  | 'volt_dev_high'
  | 'volt_rate'
  | 'soc_low'
  | 'soh_low'
  | 'current_dev'
  | 'sensor_missing'
  | 'sensor_stuck'
  | 'sensor_implausible'
  | 'sensor_status';

export type AlertCategory = 'thermal' | 'voltage' | 'charge' | 'health' | 'current' | 'sensor';

/** A condition that has passed persistence filtering and is currently in force. */
export interface ActiveCondition {
  moduleId: string;
  code: ConditionCode;
  severity: Severity;
  message: string; // short, e.g. "+7.5 °C/min"
  since: Date;
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
  conditions: ActiveCondition[];
  /** Rate of change over the recent window, or null when it cannot be computed. */
  tempRatePerMin: number | null;
  voltRatePerMin: number | null;
  /** Difference from the pack median at this timestamp. */
  tempDeviation: number | null;
  voltDeviation: number | null;
  /** 'ok' = all values present, 'partial' = some missing, 'none' = no row this tick. */
  dataStatus: 'ok' | 'partial' | 'none';
}

/** An alert: one diagnosed problem affecting one or more modules. */
export interface Alert {
  id: string;
  category: AlertCategory;
  moduleIds: string[];
  severity: Severity;
  peakSeverity: Severity;
  title: string; // e.g. "Isolated thermal event"
  diagnosis: string; // what is likely wrong
  action: string; // what the operator should do
  forecast?: string; // e.g. "M07 reaches 55 °C in ~40 s"
  firstSeen: Date;
  lastSeen: Date;
  clearedAt?: Date;
}

/** One line of the event log. */
export interface EventLogEntry {
  id: string;
  frameIndex: number;
  time: Date;
  severity: Severity;
  kind: 'raised' | 'escalated' | 'downgraded' | 'updated' | 'cleared' | 'merged' | 'transient' | 'data';
  moduleIds: string[];
  message: string;
  alertId?: string;
}

/** Headline numbers for the KPI bar. */
export interface PackKpis {
  maxTemp: { value: number; moduleId: string } | null;
  minTemp: { value: number; moduleId: string } | null;
  tempSpread: number | null;
  minVolt: { value: number; moduleId: string } | null;
  maxVolt: { value: number; moduleId: string } | null;
  voltSpreadMv: number | null;
  avgSoc: number | null;
  avgSoh: number | null;
  meanCurrent: number | null;
  reportingModules: number;
  totalModules: number;
}

/** Snapshot of the whole pack at one point in time. */
export interface PackState {
  frameIndex: number;
  timestamp: Date;
  severity: Severity; // worst of all modules and alerts
  modules: ModuleState[];
  alerts: Alert[]; // alerts active at this moment
  kpis: PackKpis;
}

/** The engine's full output for a dataset: one state per frame plus the event log. */
export interface Timeline {
  states: PackState[];
  events: EventLogEntry[];
  /** Every alert ever raised, including cleared ones. */
  alertHistory: Alert[];
  /** Number of readings rejected by the engine as physically impossible. */
  implausibleValues: number;
  /** Cells in series per module, inferred from the voltage level (1 = cell-level data). */
  cellsInSeries: number;
}
