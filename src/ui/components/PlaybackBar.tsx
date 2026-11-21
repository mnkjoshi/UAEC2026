import type { Timeline } from '../../core';
import { SEVERITY_META, fmtTime } from '../format';
import { SPEEDS, useDashboard } from '../store';

/**
 * Replays the file as a live feed. The scrubber shows where alerts were raised,
 * so the operator (or a judge) can jump straight to each event.
 */
export function PlaybackBar({ timeline }: { timeline: Timeline }) {
  const cursor = useDashboard((s) => s.cursor);
  const playing = useDashboard((s) => s.playing);
  const speed = useDashboard((s) => s.speed);
  const { setCursor, step, setPlaying, setSpeed } = useDashboard.getState();
  const last = timeline.states.length - 1;
  const markers = timeline.events.filter((e) => e.kind === 'raised' || e.kind === 'escalated');

  return (
    <section className="playback" aria-label="Playback controls">
      <div className="pb-buttons">
        <button type="button" className="btn icon" onClick={() => setCursor(0)} title="Restart" aria-label="Restart">
          ⏮
        </button>
        <button type="button" className="btn icon" onClick={() => step(-1)} title="Step back" aria-label="Step back">
          ◀
        </button>
        <button
          type="button"
          className="btn icon primary"
          onClick={() => setPlaying(!playing)}
          title={playing ? 'Pause (Space)' : 'Play (Space)'}
          aria-label={playing ? 'Pause' : 'Play'}
        >
          {playing ? '❚❚' : '▶'}
        </button>
        <button type="button" className="btn icon" onClick={() => step(1)} title="Step forward" aria-label="Step forward">
          ▶|
        </button>
        <button type="button" className="btn icon" onClick={() => { setCursor(last); setPlaying(false); }} title="Jump to end" aria-label="Jump to end">
          ⏭
        </button>
      </div>

      <div className="pb-track">
        <input
          type="range"
          min={0}
          max={last}
          value={cursor}
          onChange={(e) => { setCursor(Number(e.target.value)); setPlaying(false); }}
          aria-label="Timeline position"
        />
        <div className="pb-markers" aria-hidden>
          {markers.map((e) => (
            <span
              key={e.id}
              className="pb-marker"
              title={`${fmtTime(e.time)} ${e.message}`}
              style={{ left: `${last ? (e.frameIndex / last) * 100 : 0}%`, background: SEVERITY_META[e.severity].color }}
            />
          ))}
        </div>
      </div>

      <div className="pb-info">
        <span className="pb-time">{fmtTime(timeline.states[cursor]?.timestamp)}</span>
        <span className="muted">
          {cursor + 1}/{last + 1}
        </span>
        <label className="pb-speed">
          <span className="muted">Speed</span>
          <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
            {SPEEDS.map((s) => (
              <option key={s} value={s}>
                {s}×
              </option>
            ))}
          </select>
        </label>
      </div>
    </section>
  );
}
