import type { ModuleState } from '../../core';
import { motion } from 'motion/react';
import { fmt } from '../format';
import { springFast } from '../motion';
import { AnimatedNumber } from './AnimatedNumber';
import { StatusBadge } from './StatusBadge';

interface ModuleTileProps {
  module: ModuleState;
  selected: boolean;
  onSelect: (id: string) => void;
}

/** One battery module on the pack map: ID, key readings, severity and the reason for it. */
export function ModuleTile({ module: m, selected, onSelect }: ModuleTileProps) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.97 }}
      transition={springFast}
      className={`tile sev-${m.severity}${selected ? ' selected' : ''}`}
      onClick={() => onSelect(m.id)}
      aria-pressed={selected}
      aria-label={`${m.id}: ${m.severity.replace('_', ' ')}${m.label ? `, ${m.label}` : ''}`}
    >
      <div className="tile-head">
        <span className="tile-id">{m.id}</span>
        <StatusBadge severity={m.severity} compact />
      </div>
      <div className="tile-temp">
        <AnimatedNumber value={m.temperature} digits={1} />
        <small>°C</small>
      </div>
      <div className="tile-volt">
        <AnimatedNumber value={m.voltage} digits={3} />
        <small>V</small>
      </div>
      <div className="tile-soc">
        <div className="soc-bar" aria-hidden>
          <div style={{ width: `${Math.max(0, Math.min(100, m.soc ?? 0))}%` }} />
        </div>
        <span>SOC {fmt(m.soc, 0, '%')}</span>
      </div>
      <div className="tile-label">{m.label ?? ' '}</div>
    </motion.button>
  );
}
