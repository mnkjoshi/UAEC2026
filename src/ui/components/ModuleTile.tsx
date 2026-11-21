import type { Severity } from '../../core/types';

export interface ModuleTileProps {
  id: string; // "M07"
  temperature: number | null; // null = sensor missing
  voltage: number | null;
  soc: number | null;
  severity: Severity;
  label?: string; // short reason, e.g. "Rising 7.5 °C/min"
  selected?: boolean;
  onClick?: () => void;
}

/**
 * One battery module on the pack map.
 *
 * TODO(Elijah): this is a bare placeholder. See elijah/TASK.md for what it should look like.
 */
export function ModuleTile({ id, temperature, voltage, severity, label, onClick }: ModuleTileProps) {
  return (
    <button type="button" onClick={onClick} style={{ border: '1px solid #888', padding: 8, textAlign: 'left' }}>
      <strong>{id}</strong>
      <div>{temperature ?? '—'} °C</div>
      <div>{voltage ?? '—'} V</div>
      <div>{severity}</div>
      {label && <small>{label}</small>}
    </button>
  );
}
