import { useEffect, useRef, useState } from 'react';
import { motion, useInView, useReducedMotion } from 'motion/react';
import { heatColor } from '../heat';
import { spring, springSlow } from '../motion';

/**
 * A 12-module pack that assembles itself when it scrolls into view, then plays out a
 * failure story on a loop: M07 starts heating, the monitor flags it, heat spreads into
 * M06 and M08, the alert escalates, then the pack cools and the alert clears.
 *
 * A stylised preview of what the dashboard does with real telemetry.
 */

const MODULES = Array.from({ length: 12 }, (_, i) => `M${String(i + 1).padStart(2, '0')}`);
const CYCLE_MS = 17000;
const ASSEMBLE_MS = 1600;
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
  const cool = t > 14000 ? Math.max(0, 1 - (t - 14000) / 2500) : 1;
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

/** The story is told at the real rates from the competition data (the animation runs faster). */
const REAL_RATE_C_PER_MIN = 7.5;

const CALLOUT: Record<Phase, { status: string; tone: 'ok' | 'crit'; body: React.ReactNode }> = {
  normal: { status: 'Pack normal', tone: 'ok', body: '12 of 12 modules reporting. All within limits.' },
  isolated: { status: 'Pack critical', tone: 'crit', body: null }, // filled in with the live countdown
  propagation: {
    status: 'Pack critical',
    tone: 'crit',
    body: (
      <>
        <strong>Thermal propagation from M07</strong> into M06 and M08. Stop the bus and evacuate passengers.
      </>
    ),
  },
  cleared: { status: 'Pack normal', tone: 'ok', body: 'Alert cleared after the pack cooled for 30 s.' },
};

export function PackHero() {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.35 });
  const [t, setT] = useState(reduced ? 11000 : 0);

  useEffect(() => {
    if (reduced || !inView) return;
    const start = performance.now();
    const id = window.setInterval(() => {
      const elapsed = performance.now() - start;
      setT(elapsed < ASSEMBLE_MS ? 0 : (elapsed - ASSEMBLE_MS) % CYCLE_MS);
    }, 80);
    return () => window.clearInterval(id);
  }, [reduced, inView]);

  const phase = phaseAt(t);
  const temps = MODULES.map((_, i) => tempAt(i, t));
  const eta = Math.max(0, ((CRIT - temps[SOURCE]) / REAL_RATE_C_PER_MIN) * 60);
  const alerting = (i: number) =>
    (phase === 'isolated' && i === SOURCE) || (phase === 'propagation' && (i === SOURCE || NEIGHBOURS.includes(i)));
  const callout = CALLOUT[phase];
  const show = inView || reduced;

  return (
    <figure ref={ref} className="pack-hero" aria-label="Animated preview: a module overheats and the monitor raises an alert">
      <div className="pack-shell">
        <motion.div className="pack-terminal neg" aria-hidden initial={{ scale: 0 }} animate={show ? { scale: 1 } : {}} transition={{ ...spring, delay: 1.1 }}>
          −
        </motion.div>
        <motion.div className="pack-terminal pos" aria-hidden initial={{ scale: 0 }} animate={show ? { scale: 1 } : {}} transition={{ ...spring, delay: 1.2 }}>
          +
        </motion.div>
        <div className="cells">
          <svg className="busbars" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
            {[0, 1].map((row) =>
              [0, 1, 2, 3, 4].map((col) => {
                const x = col * (CELL_W + GAP_X) + CELL_W;
                const y = row * (CELL_H + GAP_Y) + CELL_H / 2;
                return (
                  <motion.line
                    key={`${row}-${col}`}
                    className="bar"
                    x1={x}
                    y1={y}
                    x2={x + GAP_X}
                    y2={y}
                    initial={{ pathLength: 0, opacity: 0 }}
                    animate={show ? { pathLength: 1, opacity: 1 } : {}}
                    transition={{ ...spring, delay: 0.7 + (row * 5 + col) * 0.05 }}
                  />
                );
              }),
            )}
            <motion.path
              className="bar"
              d={`M ${W} ${CELL_H / 2} C ${W + 22} ${CELL_H / 2} ${W + 22} ${H - CELL_H / 2} ${W} ${H - CELL_H / 2}`}
              initial={{ pathLength: 0, opacity: 0 }}
              animate={show ? { pathLength: 1, opacity: 1 } : {}}
              transition={{ ...springSlow, delay: 1.2 }}
            />
          </svg>
          {MODULES.map((id, i) => {
            // Series order snakes: top row left→right, bottom row right→left.
            const row = i < 6 ? 0 : 1;
            const col = i < 6 ? i : 11 - i;
            const temp = temps[i];
            return (
              <motion.div
                key={id}
                className={`cell${alerting(i) ? ' alerting' : ''}`}
                initial={{ opacity: 0, y: -24, scale: 0.92 }}
                animate={show ? { opacity: 1, y: 0, scale: 1 } : {}}
                transition={{ ...spring, delay: (row * 6 + col) * 0.045 }}
                style={{
                  left: `${((col * (CELL_W + GAP_X)) / W) * 100}%`,
                  top: `${((row * (CELL_H + GAP_Y)) / H) * 100}%`,
                  width: `${(CELL_W / W) * 100}%`,
                  height: `${(CELL_H / H) * 100}%`,
                  ['--heat' as string]: heatColor(temp, 30, CRIT),
                }}
              >
                <span className="cell-id">{id}</span>
                <span className="cell-temp">
                  {temp.toFixed(1)}
                  <small>°C</small>
                </span>
                <span className="cell-fill" style={{ height: `${Math.max(8, Math.min(100, ((temp - 25) / 35) * 100))}%` }} />
              </motion.div>
            );
          })}
        </div>
      </div>

      <figcaption className={`pack-callout tone-${callout.tone}`} aria-live="polite">
        <span className="callout-status">
          <span className="dot" aria-hidden />
          {callout.status}
        </span>
        <motion.span key={phase} className="callout-body" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
          {phase === 'isolated' ? (
            <>
              <strong>Isolated thermal event on M07.</strong> Rising {REAL_RATE_C_PER_MIN} °C/min while its neighbours hold steady. Reaches {CRIT} °C in ~
              {Math.round(eta)} s.
            </>
          ) : (
            callout.body
          )}
        </motion.span>
      </figcaption>
    </figure>
  );
}
