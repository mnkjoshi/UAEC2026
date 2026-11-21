/**
 * CSV ingestion: turns raw text into validated frames plus a data-quality report.
 *
 * Design goal: never throw on messy data. Bad cells become `null` with a reason,
 * bad rows are counted and skipped, and only an unusable file (no header, no
 * timestamp/module column, or no valid rows) raises a ParseError with a clear message.
 */
import Papa from 'papaparse';
import { median, naturalCompare } from './stats';
import type { DataIssue, DataQualityReport, Frame, Metric, ParsedDataset, Reading } from './types';

export class ParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ParseError';
  }
}

type Field = 'timestamp' | 'moduleId' | 'status' | Metric;

/** Header matchers, applied to a lower-cased header with punctuation and units removed. */
const FIELD_MATCHERS: Array<[Field, (h: string) => boolean]> = [
  ['timestamp', (h) => h.includes('timestamp') || h === 'time' || h === 'datetime' || h === 'date'],
  ['moduleId', (h) => h.includes('module') || h === 'id' || h === 'cell' || h === 'cellid'],
  ['status', (h) => h.includes('status')],
  ['temperature', (h) => h.startsWith('temp')],
  ['voltage', (h) => h.startsWith('volt') || h === 'v'],
  ['current', (h) => h.startsWith('current') || h.startsWith('amp') || h === 'i'],
  ['soc', (h) => h.includes('stateofcharge') || h.startsWith('soc')],
  ['soh', (h) => h.includes('stateofhealth') || h.startsWith('soh')],
];

const METRIC_FIELDS: Metric[] = ['temperature', 'voltage', 'current', 'soc', 'soh'];

/** Text that loggers commonly write instead of a number. */
const MISSING_TOKENS = /^(|nan|null|none|n\/?a|na|nil|undefined|-|--|—|\?)$/i;

/** Statuses that mean the sensor is healthy. Anything else is flagged. */
const OK_STATUSES = new Set(['OK', 'NORMAL', 'GOOD', 'VALID', 'ACTIVE', '']);

function normaliseHeader(h: string): string {
  return h
    .replace(/^\uFEFF/, '')
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/** Maps each recognised field to its column index. Unrecognised columns are reported. */
function mapColumns(header: string[]) {
  const columns = new Map<Field, number>();
  const ignored: string[] = [];
  header.forEach((raw, index) => {
    const h = normaliseHeader(raw);
    const match = FIELD_MATCHERS.find(([field, test]) => !columns.has(field) && test(h));
    if (match) columns.set(match[0], index);
    else if (raw.trim()) ignored.push(raw.trim());
  });
  return { columns, ignored };
}

/** Parses a numeric cell. Returns null plus the reason when it is unusable. */
export function parseNumber(raw: string | undefined): { value: number | null; issue?: 'missing' | 'invalid' } {
  const text = (raw ?? '').trim();
  if (MISSING_TOKENS.test(text)) return { value: null, issue: 'missing' };
  const value = Number(text);
  if (!Number.isFinite(value)) return { value: null, issue: 'invalid' };
  return { value };
}

/**
 * Parses a timestamp in the common formats: "2026-01-01 12:00:00", ISO 8601,
 * "01/01/2026 12:00:00", epoch seconds/milliseconds, or seconds since start.
 */
export function parseTimestamp(raw: string | undefined): Date | null {
  const text = (raw ?? '').trim();
  if (!text) return null;

  if (/^-?\d+(\.\d+)?$/.test(text)) {
    const n = Number(text);
    if (n > 1e11) return new Date(n); // epoch milliseconds
    if (n > 1e8) return new Date(n * 1000); // epoch seconds
    return new Date(Date.UTC(2000, 0, 1) + n * 1000); // seconds since start of recording
  }

  // "YYYY-MM-DD HH:MM:SS" is not ISO; the T makes every browser parse it as local time.
  const isoLike = text.replace(/^(\d{4}-\d{2}-\d{2})[ _](\d)/, '$1T$2');
  const parsed = new Date(isoLike);
  if (!Number.isNaN(parsed.getTime())) return parsed;

  const fallback = new Date(text);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

/** Parses telemetry CSV text into frames. Throws ParseError only when the file is unusable. */
export function parseTelemetryCsv(text: string, name = 'dataset'): ParsedDataset {
  const result = Papa.parse<string[]>(text.replace(/^\uFEFF/, ''), { skipEmptyLines: 'greedy' });
  const rows = result.data.filter((r) => Array.isArray(r) && r.some((c) => String(c).trim() !== ''));
  if (rows.length === 0) throw new ParseError('The file is empty.');

  const { columns, ignored } = mapColumns(rows[0]);
  if (!columns.has('timestamp') || !columns.has('moduleId')) {
    throw new ParseError(
      'Could not find the Timestamp and Module ID columns. Expected a header like: ' +
        'Timestamp, Module ID, Temperature (C), Voltage (V), Current (A), State of charge (%), State of Health (%), Sensor Status',
    );
  }
  const missingColumns = METRIC_FIELDS.filter((m) => !columns.has(m));

  const quality: DataQualityReport = {
    totalRows: rows.length - 1,
    acceptedRows: 0,
    rejectedRows: 0,
    duplicateRows: 0,
    missingValues: 0,
    invalidValues: 0,
    statusFlags: 0,
    outOfOrder: false,
    gaps: 0,
    intervalSec: 0,
    frameCount: 0,
    moduleCount: 0,
    missingColumns,
    ignoredColumns: ignored,
    notes: [],
  };

  const cell = (row: string[], field: Field) => {
    const index = columns.get(field);
    return index === undefined ? undefined : row[index];
  };

  const byTime = new Map<number, Map<string, Reading>>();
  let previousTime = -Infinity;

  for (const row of rows.slice(1)) {
    const timestamp = parseTimestamp(cell(row, 'timestamp'));
    const moduleId = (cell(row, 'moduleId') ?? '').trim().toUpperCase();
    if (!timestamp || !moduleId) {
      quality.rejectedRows++;
      continue;
    }

    const time = timestamp.getTime();
    if (time < previousTime) quality.outOfOrder = true;
    previousTime = Math.max(previousTime, time);

    let frame = byTime.get(time);
    if (!frame) byTime.set(time, (frame = new Map()));
    if (frame.has(moduleId)) {
      quality.duplicateRows++;
      continue; // keep the first reading for a (timestamp, module) pair
    }

    const issues: DataIssue[] = [];
    const values = {} as Record<Metric, number | null>;
    for (const metric of METRIC_FIELDS) {
      if (!columns.has(metric)) {
        values[metric] = null;
        continue;
      }
      const raw = cell(row, metric);
      const { value, issue } = parseNumber(raw);
      values[metric] = value;
      if (issue) {
        issues.push({ metric, kind: issue, raw: (raw ?? '').trim() });
        if (issue === 'missing') quality.missingValues++;
        else quality.invalidValues++;
      }
    }

    const sensorStatus = (cell(row, 'status') ?? '').trim().toUpperCase();
    const statusOk = OK_STATUSES.has(sensorStatus);
    if (!statusOk) quality.statusFlags++;

    frame.set(moduleId, { timestamp, moduleId, ...values, sensorStatus: sensorStatus || 'OK', statusOk, issues });
    quality.acceptedRows++;
  }

  if (byTime.size === 0) {
    throw new ParseError('No rows with a readable timestamp and module ID were found.');
  }

  const frames: Frame[] = [...byTime.entries()]
    .sort(([a], [b]) => a - b)
    .map(([time, readings]) => ({ timestamp: new Date(time), readings }));

  const modules = [...new Set(frames.flatMap((f) => [...f.readings.keys()]))].sort(naturalCompare);

  const spacings = frames.slice(1).map((f, i) => (f.timestamp.getTime() - frames[i].timestamp.getTime()) / 1000);
  quality.intervalSec = median(spacings) ?? 0;
  quality.gaps = spacings.filter((s) => quality.intervalSec > 0 && s > 3 * quality.intervalSec).length;
  quality.frameCount = frames.length;
  quality.moduleCount = modules.length;

  const notes = quality.notes;
  if (modules.length !== 12) notes.push(`Found ${modules.length} modules (expected 12). All are monitored.`);
  if (quality.rejectedRows) notes.push(`${quality.rejectedRows} row(s) skipped: unreadable timestamp or module ID.`);
  if (quality.duplicateRows) notes.push(`${quality.duplicateRows} duplicate row(s) ignored (first reading kept).`);
  if (quality.outOfOrder) notes.push('Rows were out of time order and have been sorted.');
  if (quality.gaps) notes.push(`${quality.gaps} gap(s) in the telemetry longer than 3x the normal interval.`);
  if (quality.missingValues) notes.push(`${quality.missingValues} blank or missing value(s): shown as "—" and excluded from detection.`);
  if (quality.invalidValues) notes.push(`${quality.invalidValues} non-numeric value(s) treated as corrupted.`);
  if (quality.statusFlags) notes.push(`${quality.statusFlags} row(s) reported a non-OK sensor status.`);
  if (missingColumns.length) notes.push(`Column(s) not found: ${missingColumns.join(', ')}.`);
  if (ignored.length) notes.push(`Unrecognised column(s) ignored: ${ignored.join(', ')}.`);
  const missingPerFrame = frames.filter((f) => f.readings.size < modules.length).length;
  if (missingPerFrame) notes.push(`${missingPerFrame} timestamp(s) are missing one or more modules.`);

  return { name, frames, modules, quality };
}
