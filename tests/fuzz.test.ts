/**
 * Fuzz test: randomly corrupt a valid file in hundreds of ways and check the pipeline
 * never crashes. The only acceptable failure is a ParseError for an unusable file.
 */
import { describe, expect, it } from 'vitest';
import { parseTelemetryCsv, ParseError, runEngine } from '../src/core';
import { parseTimestamp } from '../src/core/parser';
import { makeCsv } from './helpers';

/** Small deterministic PRNG so failures are reproducible. */
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

const JUNK = ['', 'NaN', 'null', '-999', '9999', 'ERR', '1e309', '-0', '  ', '"quoted"', '3,7', '∞', '#VALUE!', '0x1F', '1/0'];

function corrupt(csv: string, rand: () => number): string {
  const lines = csv.split('\n');
  const out: string[] = [lines[0]];
  for (const line of lines.slice(1)) {
    const r = rand();
    if (r < 0.03) continue; // drop row
    if (r < 0.05) {
      out.push(line, line); // duplicate row
      continue;
    }
    const cells = line.split(',');
    if (rand() < 0.15) cells[Math.floor(rand() * cells.length)] = JUNK[Math.floor(rand() * JUNK.length)];
    if (rand() < 0.02) cells.pop(); // short row
    if (rand() < 0.02) cells.push('extra'); // long row
    out.push(cells.join(','));
  }
  if (rand() < 0.3) out.splice(1, out.length - 1, ...out.slice(1).sort(() => rand() - 0.5)); // shuffle
  return out.join(rand() < 0.2 ? '\r\n' : '\n');
}

describe('fuzzing', () => {
  it('never crashes on 300 randomly corrupted files', () => {
    const base = makeCsv();
    for (let seed = 1; seed <= 300; seed++) {
      const text = corrupt(base, rng(seed));
      try {
        const tl = runEngine(parseTelemetryCsv(text));
        expect(tl.states.length).toBeGreaterThan(0);
      } catch (e) {
        if (!(e instanceof ParseError)) throw new Error(`seed ${seed}: ${e}`);
      }
    }
  });

  it('survives pure garbage input', () => {
    for (const text of ['\u0000\u0001', ',,,,\n,,,', 'a\nb\nc', '﻿', 'Timestamp,Module ID\n,\n,']) {
      expect(() => runEngine(parseTelemetryCsv(text))).toThrow(ParseError);
    }
  });

  it('accepts semicolon- and tab-delimited files', () => {
    for (const sep of [';', '\t']) {
      const ds = parseTelemetryCsv(makeCsv({ frames: 3 }).replace(/,/g, sep));
      expect(ds.modules).toHaveLength(12);
    }
  });
});

describe('timestamp formats', () => {
  it.each([
    ['12:00:10', [12, 0, 10]],
    ['21/11/2026 13:05:07', [13, 5, 7]],
    ['2026/01/01 12:00:00', [12, 0, 0]],
    ['2026-01-01 12:00', [12, 0, 0]],
  ])('parses %s', (raw, [h, m, s]) => {
    const d = parseTimestamp(raw)!;
    expect(d).not.toBeNull();
    expect([d.getHours(), d.getMinutes(), d.getSeconds()]).toEqual([h, m, s]);
  });

  it('runs a whole file with time-only timestamps', () => {
    const csv = makeCsv({ frames: 5 }).replace(/2026-01-01 /g, '');
    expect(runEngine(parseTelemetryCsv(csv)).states).toHaveLength(5);
  });
});
