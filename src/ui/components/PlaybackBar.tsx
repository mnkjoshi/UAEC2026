import type { Timeline } from '../../core';
import { SEVERITY_META, fmtTime } from '../format';
import { useDashboard } from '../store';
import { Transport } from './Transport';

/**
 * Replays the file as a live feed. Ticks under the scrubber show where alerts were raised,
 * so the operator (or a judge) can jump straight to each event.
 */
export function PlaybackBar({ timeline }: { timeline: Timeline }) {
  const cursor = useDashboard((s) => s.cursor);
  const playing = useDashboard((s) => s.playing);
  const speed = useDashboard((s) => s.speed);
  const { setCursor, step, setPlaying, setSpeed } = useDashboard.getState();
  const states = timeline.states;
  const last = states.length - 1;

  return (
    <Transport
      playing={playing}
      position={cursor}
      last={last}
      currentLabel={fmtTime(states[cursor]?.timestamp)}
      startLabel={fmtTime(states[0]?.timestamp)}
      endLabel={fmtTime(states[last]?.timestamp)}
      markers={timeline.events
        .filter((e) => e.kind === 'raised' || e.kind === 'escalated')
        .map((e) => ({ key: e.id, position: e.frameIndex, color: SEVERITY_META[e.severity].color, title: `${fmtTime(e.time)} ${e.message}` }))}
      speed={speed}
      onSpeed={setSpeed}
      onToggle={() => setPlaying(!playing)}
      onSeek={(i) => {
        setCursor(i);
        setPlaying(false);
      }}
      onStep={step}
    />
  );
}
