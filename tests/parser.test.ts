/** Ingestion edge cases: the parser must never crash on messy input. */
import { describe, expect, it } from 'vitest';
import { parseTelemetryCsv, ParseError, runEngine } from '../src/core';
import { parseNumber, parseTimestamp } from '../src/core/parser';
import { hazardAlerts, makeCsv, runCsv } from './helpers';

describe('parseNumber', () => {
  it.each(['', 'NaN', 'null', 'N/A', 'na', '-', '  '])('treats %j as missing', (raw) => {
    expect(parseNumber(raw)).toEqual({ value: null, issue: 'missing' });
  });
  it.each(['abc', 'ERR', '1.2.3'])('treats %j as invalid', (raw) => {
    expect(parseNumber(raw)).toEqual({ value: null, issue: 'invalid' });
  });
  it('parses numbers with whitespace', () => {
    expect(parseNumber(' 3.685 ')).toEqual({ value: 3.685 });
  });
});

describe('parseTimestamp', () => {
  it('parses the competition format as local time', () => {
    const d = parseTimestamp('2026-01-01 12:00:10')!;
    expect([d.getHours(), d.getMinutes(), d.getSeconds()]).toEqual([12, 0, 10]);
  });
  it('parses ISO and epoch formats', () => {
    expect(parseTimestamp('2026-01-01T12:00:00Z')).not.toBeNull();
    expect(parseTimestamp('1767268800')!.getUTCFullYear()).toBe(2026);
  });
  it('rejects garbage', () => {
    expect(parseTimestamp('not a time')).toBeNull();
    expect(parseTimestamp('')).toBeNull();
  });
});

describe('parseTelemetryCsv', () => {
  it('throws a clear ParseError for an empty file', () => {
    expect(() => parseTelemetryCsv('')).toThrow(ParseError);
  });

  it('throws a clear ParseError when required columns are missing', () => {
    expect(() => parseTelemetryCsv('foo,bar\n1,2')).toThrow(/Timestamp and Module ID/);
  });

  it('throws for a header-only file', () => {
    expect(() => parseTelemetryCsv(makeCsv({ frames: 0 }))).toThrow(ParseError);
  });

  it('accepts header variations, extra columns and reordered columns', () => {
    const csv = [
      ' module_id ,TIME,voltage,temp_c,Extra,soc,SOH,status',
      'M01,2026-01-01 12:00:00,3.68,28,x,78,95,ok',
      'M02,2026-01-01 12:00:00,3.68,28,x,78,95,OK',
    ].join('\n');
    const ds = parseTelemetryCsv(csv);
    expect(ds.modules).toEqual(['M01', 'M02']);
    const r = ds.frames[0].readings.get('M01')!;
    expect([r.temperature, r.voltage, r.statusOk]).toEqual([28, 3.68, true]);
    expect(ds.quality.ignoredColumns).toEqual(['Extra']);
    expect(ds.quality.missingColumns).toEqual(['current']);
  });

  it('sorts out-of-order rows, drops duplicates and skips bad timestamps', () => {
    const rows = makeCsv({ frames: 3, modules: 2 }).split('\n');
    const csv = [rows[0], rows[5], rows[1], rows[2], rows[2], 'garbage,M01,1,1,1,1,1,OK', rows[3], rows[4], rows[6]].join('\n');
    const ds = parseTelemetryCsv(csv);
    expect(ds.quality.outOfOrder).toBe(true);
    expect(ds.quality.duplicateRows).toBe(1);
    expect(ds.quality.rejectedRows).toBe(1);
    expect(ds.frames.map((f) => f.timestamp.getTime())).toEqual([...ds.frames.map((f) => f.timestamp.getTime())].sort());
  });

  it('sorts module IDs naturally and accepts counts other than 12', () => {
    const csv = makeCsv({ frames: 2, modules: 3 }, (row, _f, m) => ({ ...row, id: ['M10', 'M2', 'M1'][m] }));
    expect(parseTelemetryCsv(csv).modules).toEqual(['M1', 'M2', 'M10']);
  });
});

describe('engine robustness', () => {
  it('handles a file with a single timestamp', () => {
    const tl = runCsv(makeCsv({ frames: 1 }));
    expect(tl.states).toHaveLength(1);
    expect(tl.alertHistory).toEqual([]);
  });

  it('flags sentinel and out-of-range values as implausible, not as hazards', () => {
    const tl = runCsv(
      makeCsv({}, (row, f, m) => (m === 2 && f === 10 ? { ...row, temp: '-999' } : m === 4 && f === 20 ? { ...row, volt: '9.9' } : row)),
    );
    expect(tl.implausibleValues).toBe(2);
    expect(hazardAlerts(tl)).toEqual([]);
  });

  it('grades module-level voltage (cells in series) with per-cell limits', () => {
    const ds = parseTelemetryCsv(makeCsv({}, (row) => ({ ...row, volt: (Number(row.volt) * 12).toFixed(3) })));
    const tl = runEngine(ds);
    expect(tl.cellsInSeries).toBe(12);
    expect(tl.alertHistory).toEqual([]);
  });

  it('adapts the rate window to slow sampling', () => {
    const tl = runCsv(
      makeCsv({ intervalSec: 60 }, (row, f, m) => (m === 0 ? { ...row, temp: (28 + f * 5).toFixed(2) } : row)),
    );
    expect(hazardAlerts(tl).some((a) => a.category === 'thermal' && a.moduleIds.includes('M01'))).toBe(true);
  });

  it('flags a non-OK status reported alongside valid values', () => {
    const tl = runCsv(makeCsv({}, (row, f, m) => (m === 6 && f >= 5 ? { ...row, status: 'FAULT' } : row)));
    expect(tl.alertHistory.map((a) => a.title)).toEqual(['Sensor fault reported']);
  });
});
