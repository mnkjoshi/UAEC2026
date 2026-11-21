import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { spring, springFast, springSlow } from '../motion';

/**
 * One illustration per step of the "how a reading becomes an alert" story.
 * Each is a miniature of what the engine actually does at that stage.
 */

/** Step 1: untrusted readings are set aside as data faults. */
export function SensorVisual() {
  const rows: Array<{ id: string; value: string; note?: string; tone?: 'data' }> = [
    { id: 'M08', value: '29.8 °C' },
    { id: 'M09', value: '30.1 °C' },
    { id: 'M10', value: '185.0 °C', note: 'Impossible jump, ignored', tone: 'data' },
    { id: 'M11', value: '—', note: 'Sensor missing, excluded', tone: 'data' },
    { id: 'M12', value: '31.2 °C' },
  ];
  return (
    <div className="sv sv-sensor">
      <div className="sv-head">Incoming readings, 12:02:30</div>
      {rows.map((r, i) => (
        <motion.div
          key={r.id}
          className={`sv-row${r.tone ? ' flagged' : ''}`}
          initial={{ opacity: 0, x: -16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ ...spring, delay: i * 0.08 }}
        >
          <span className="sv-id">{r.id}</span>
          <span className="sv-val">{r.value}</span>
          {r.note ? (
            <motion.span className="sv-flag" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ ...springFast, delay: 0.6 + i * 0.08 }}>
              {r.note}
            </motion.span>
          ) : (
            <span className="sv-ok">Trusted</span>
          )}
        </motion.div>
      ))}
    </div>
  );
}

/** Step 2: three independent views of one module. */
export function CompareVisual() {
  const meters = [
    { label: 'Against the safety limit', value: '42.3 °C', of: 'limit 55 °C', fill: 42.3 / 55, tone: 'warn' },
    { label: 'Against the rest of the pack', value: '+12.4 °C', of: 'limit +5 °C', fill: 1, tone: 'crit' },
    { label: 'Against its own trend', value: '+7.5 °C/min', of: 'limit 4 °C/min', fill: 1, tone: 'crit' },
  ];
  return (
    <div className="sv sv-compare">
      <div className="sv-head">Module M07</div>
      {meters.map((m, i) => (
        <div key={m.label} className="sv-meter">
          <div className="sv-meter-top">
            <span>{m.label}</span>
            <span className={`sv-meter-val tone-${m.tone}`}>{m.value}</span>
          </div>
          <div className="sv-track">
            <motion.div
              className={`sv-fill tone-${m.tone}`}
              initial={{ scaleX: 0 }}
              animate={{ scaleX: m.fill }}
              transition={{ ...springSlow, delay: 0.15 + i * 0.12 }}
            />
          </div>
          <span className="sv-of">{m.of}</span>
        </div>
      ))}
    </div>
  );
}

/** Step 3: a condition must persist before it becomes an alert. */
export function PersistenceVisual() {
  const [n, setN] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setN((v) => (v + 1) % 8), 650);
    return () => window.clearInterval(id);
  }, []);
  const samples = [false, false, true, false, true, true, true];
  // A blip at sample 3 is ignored; the run of 5–7 confirms.
  const confirmed = n >= 7;
  return (
    <div className="sv sv-persist">
      <div className="sv-head">Samples every 10 s</div>
      <div className="sv-dots">
        {samples.map((over, i) => {
          const seen = i < n;
          return (
            <motion.span
              key={i}
              className={`sv-dot${seen ? (over ? ' over' : ' ok') : ''}`}
              animate={{ scale: seen && i === n - 1 ? [1, 1.25, 1] : 1 }}
              transition={springFast}
            />
          );
        })}
      </div>
      <div className="sv-caption">
        {n <= 2 && 'Within limits.'}
        {n === 3 && 'One sample over the limit…'}
        {n === 4 && 'Back to normal: a blip, ignored.'}
        {n === 5 && 'Over the limit again: 1 of 3.'}
        {n === 6 && 'Still over: 2 of 3.'}
        {confirmed && <strong className="tone-crit">Persisted 3 samples: alert raised.</strong>}
      </div>
    </div>
  );
}

/** Step 4: a diagnosis with a countdown and an action. */
export function AdviseVisual() {
  return (
    <motion.div className="sv sv-alert" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={springSlow}>
      <div className="sv-alert-top">
        <span className="sv-badge">Critical</span>
        <span className="muted">since 12:02:20</span>
      </div>
      <h4>Thermal propagation from M07</h4>
      <div className="sv-chips">
        {['M06', 'M07', 'M08'].map((m) => (
          <span key={m}>{m}</span>
        ))}
      </div>
      <p>Heat is spreading from M07 into neighbouring modules. This is how thermal runaway cascades through a pack.</p>
      <motion.p className="sv-forecast" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ ...spring, delay: 0.4 }}>
        M07 reaches 55 °C in ~44 s at the current rate
      </motion.p>
      <motion.p className="sv-action" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.6 }}>
        <strong>Action:</strong> Stop the bus and evacuate passengers.
      </motion.p>
    </motion.div>
  );
}
