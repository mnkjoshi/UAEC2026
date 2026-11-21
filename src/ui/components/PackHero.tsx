import { useEffect, useState } from 'react';

/**
 * The landing page's hero: a 12-module pack that assembles itself, then plays out
 * a real failure story on a loop: M07 starts heating, the monitor flags it,
 * heat spreads into M06 and M08, the alert escalates, then the pack cools and resets.
 *
 * It is a stylised preview of what the dashboard does with real telemetry.
 */

const MODULES = Array.from({ length: 12 }, (_, i) => `M${String(i + 1).padStart(2, '0')}`);
const CYCLE_MS = 17000;
const ASSEMBLE_MS = 1800;
const SOURCE = 6; // M07
const NEIGHBOURS = [5, 7]; // M06, M08
const CRIT = 55;

// Layout of the pack drawing, in SVG units. Cells and busbars share this coordinate system.
const CELL_W = 80;
const CELL_H = 100;
const GAP_X = 24;
const GAP_Y = 30;
const W = 6 * CELL_W + 5 * GAP_X; // 600
const H = 2 * CELL_H + GAP_Y; // 230

/** Temperature of module i at time t (ms into the loop). */
function tempAt(i: number, t: number): number {
  const base = 27.4 + i * 0.32 + Math.sin(t / 900 + i * 1.7) * 0.18;
  const cool = t > 14000 ? Math.max(0, 1 - (t - 14000) / 2500) : 1; // cool-down at the end of the loop
  let rise = 0;
  if (i === SOURCE && t > 3800) rise = Math.min(31, ((t - 3800) / 1000) * 3.4);
  if (NEIGHBOURS.includes(i) && t > 7600) rise = Math.min(15, ((t - 7600) / 1000) * 1.9);
  return base + rise * cool;
}

type Phase = 'normal' | 'isolated' | 'propagation' | 'cleared';
function phaseAt(t: number): Phase {
  if (t < 4900) return 'normal';
  if (t < 8800) return 'isolated';
  if (t < 14600) return 'propagation';
  return 'cleared';
}

/**
 * Coolant cyan → neutral → amber → red as a module heats up.
 * Interpolated through a neutral stop so a warming cell never passes through "healthy" green.
 */
const HEAT_STOPS: Array<[number, [number, number, number]]> = [
  [0, [92, 200, 214]], // coolant cyan
  [0.25, [138, 151, 163]], // neutral
  [0.55, [242, 165, 58]], // amber
  [1, [255, 59, 48]], // red
];
function heatColor(temp: number): string {
  const x = Math.max(0, Math.min(1, (temp - 30) / (CRIT - 30)));
  const i = HEAT_STOPS.findIndex(([stop]) => stop >= x);
  if (i <= 0) return `rgb(${HEAT_STOPS[0][1].join(' ')})`;
  const [a, ca] = HEAT_STOPS[i - 1];
  const [b, cb] = HEAT_STOPS[i];
  const k = (x - a) / (b - a);
  return `rgb(${ca.map((v, j) => Math.round(v + (cb[j] - v) * k)).join(' ')})`;
}

/** The story is told at the real rates from the competition data (the animation runs faster). */
const REAL_RATE_C_PER_MIN = 7.5;

export function PackHero() {
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const [t, setT] = useState(reduced ? 11000 : 0);

  useEffect(() => {
    if (reduced) return;
    const start = performance.now();
    const id = window.setInterval(() => {
      const elapsed = performance.now() - start;
      // First pass waits for the pack to assemble; later loops start straight away.
      setT(elapsed < ASSEMBLE_MS ? 0 : (elapsed - ASSEMBLE_MS) % CYCLE_MS);
    }, 80);
    return () => window.clearInterval(id);
  }, [reduced]);

  const phase = phaseAt(t);
  const temps = MODULES.map((_, i) => tempAt(i, t));
  const srcTemp = temps[SOURCE];
  const eta = Math.max(0, ((CRIT - srcTemp) / REAL_RATE_C_PER_MIN) * 60);
  const alerting = (i: number) =>
    (phase === 'isolated' && i === SOURCE) || (phase === 'propagation' && (i === SOURCE || NEIGHBOURS.includes(i)));

  const status =
    phase === 'normal' || phase === 'cleared'
      ? { label: 'Pack normal', tone: 'ok' }
      : { label: 'Pack critical', tone: 'crit' };

  return (
    <figure className="pack-hero" aria-label="Animated preview: a module overheats and the monitor raises an alert">
      <div className="pack-shell">
        <div className="pack-terminal neg" aria-hidden>−</div>
        <div className="pack-terminal pos" aria-hidden>+</div>
        <div className="cells">
          <svg className="busbars" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
            {[0, 1].map((row) =>
              [0, 1, 2, 3, 4].map((col) => {
                const x = col * (CELL_W + GAP_X) + CELL_W;
                const y = row * (CELL_H + GAP_Y) + CELL_H / 2;
                return (
                  <line key={`${row}-${col}`} className="bar" x1={x} y1={y} x2={x + GAP_X} y2={y} style={{ animationDelay: `${900 + (row * 5 + col) * 60}ms` }} />
                );
              }),
            )}
            <path className="bar" d={`M ${W} ${CELL_H / 2} C ${W + 22} ${CELL_H / 2} ${W + 22} ${H - CELL_H / 2} ${W} ${H - CELL_H / 2}`} style={{ animationDelay: '1500ms' }} />
          </svg>
          {MODULES.map((id, i) => {
            // Series order snakes: top row left→right, bottom row right→left.
            const row = i < 6 ? 0 : 1;
            const col = i < 6 ? i : 11 - i;
            const temp = temps[i];
            const hot = alerting(i);
            return (
              <div
                key={id}
                className={`cell${hot ? ' alerting' : ''}`}
                style={{
                  left: `${((col * (CELL_W + GAP_X)) / W) * 100}%`,
                  top: `${((row * (CELL_H + GAP_Y)) / H) * 100}%`,
                  width: `${(CELL_W / W) * 100}%`,
                  height: `${(CELL_H / H) * 100}%`,
                  ['--heat' as string]: heatColor(temp),
                  ['--glow' as string]: `${Math.max(0, (temp - 34) * 1.4)}px`,
                  animationDelay: `${(row * 6 + col) * 70}ms`,
                }}
              >
                <span className="cell-id">{id}</span>
                <span className="cell-temp">
                  {temp.toFixed(1)}
                  <small>°C</small>
                </span>
                <span className="cell-fill" style={{ height: `${Math.max(8, Math.min(100, ((temp - 25) / 35) * 100))}%` }} />
              </div>
            );
          })}
        </div>
      </div>

      <figcaption className={`pack-callout tone-${status.tone}`} aria-live="polite">
        <span className="callout-status">
          <span className="dot" aria-hidden />
          {status.label}
        </span>
        {phase === 'normal' && <span className="callout-body">12 of 12 modules reporting. All within limits.</span>}
        {phase === 'isolated' && (
          <span className="callout-body">
            <strong>Isolated thermal event on M07.</strong> Rising {REAL_RATE_C_PER_MIN} °C/min while its neighbours hold steady. Reaches {CRIT} °C in ~{Math.round(eta)} s.
          </span>
        )}
        {phase === 'propagation' && (
          <span className="callout-body">
            <strong>Thermal propagation from M07</strong> into M06 and M08. Stop the bus and evacuate passengers.
          </span>
        )}
        {phase === 'cleared' && <span className="callout-body">Alert cleared after the pack cooled for 30 s.</span>}
      </figcaption>
    </figure>
  );
}
