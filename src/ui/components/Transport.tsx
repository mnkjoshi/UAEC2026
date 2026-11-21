import { motion } from 'motion/react';
import { springFast } from '../motion';
import { SPEEDS } from '../store';
import { Icon } from './Icon';

export interface TransportMarker {
  key: string;
  position: number; // frame index
  color: string;
  title: string;
}

interface TransportProps {
  playing: boolean;
  position: number;
  last: number;
  currentLabel: string;
  startLabel: string;
  endLabel: string;
  markers?: TransportMarker[];
  speed?: number;
  onSpeed?: (speed: number) => void;
  onToggle: () => void;
  onSeek: (position: number) => void;
  onStep?: (delta: number) => void;
}

/**
 * Playback transport shared by the pack dashboard and the fleet view: quiet icon buttons
 * around a round play button, a thin scrubber with progress fill, alert ticks beneath it,
 * and the time range either side.
 */
export function Transport(props: TransportProps) {
  const { playing, position, last, currentLabel, startLabel, endLabel, markers = [], speed, onSpeed, onToggle, onSeek, onStep } = props;
  const pct = last > 0 ? (position / last) * 100 : 0;

  return (
    <section className="transport" aria-label="Playback">
      <div className="tp-controls">
        <button type="button" className="tp-btn" onClick={() => onSeek(0)} title="Restart" aria-label="Restart">
          <Icon name="restart" size={15} />
        </button>
        {onStep && (
          <button type="button" className="tp-btn" onClick={() => onStep(-1)} title="Step back (←)" aria-label="Step back">
            <Icon name="stepBack" size={17} />
          </button>
        )}
        <motion.button
          type="button"
          className="tp-play"
          onClick={onToggle}
          whileTap={{ scale: 0.92 }}
          transition={springFast}
          title={playing ? 'Pause (Space)' : 'Play (Space)'}
          aria-label={playing ? 'Pause' : 'Play'}
        >
          <Icon name={playing ? 'pause' : 'play'} size={16} />
        </motion.button>
        {onStep && (
          <button type="button" className="tp-btn" onClick={() => onStep(1)} title="Step forward (→)" aria-label="Step forward">
            <Icon name="stepForward" size={17} />
          </button>
        )}
        <button type="button" className="tp-btn" onClick={() => onSeek(last)} title="Jump to end" aria-label="Jump to end">
          <Icon name="end" size={15} />
        </button>
      </div>

      <span className="tp-now">{currentLabel}</span>

      <div className="tp-scrub">
        <span className="tp-edge">{startLabel}</span>
        <div className="tp-track-wrap">
          <input
            type="range"
            className="tp-range"
            min={0}
            max={last}
            value={position}
            onChange={(e) => onSeek(Number(e.target.value))}
            style={{ ['--p' as string]: `${pct}%` }}
            aria-label="Timeline position"
            aria-valuetext={currentLabel}
          />
          <div className="tp-ticks" aria-hidden>
            {markers.map((m) => (
              <span key={m.key} title={m.title} style={{ left: `${last ? (m.position / last) * 100 : 0}%`, background: m.color }} />
            ))}
          </div>
        </div>
        <span className="tp-edge">{endLabel}</span>
      </div>

      {speed !== undefined && onSpeed && (
        <label className="tp-speed" title="Playback speed">
          <span className="sr-only">Playback speed</span>
          <select value={speed} onChange={(e) => onSpeed(Number(e.target.value))}>
            {SPEEDS.map((s) => (
              <option key={s} value={s}>
                {s}×
              </option>
            ))}
          </select>
        </label>
      )}
    </section>
  );
}
