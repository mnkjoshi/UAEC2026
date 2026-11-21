import { useEffect } from 'react';
import { motion, useSpring, useTransform } from 'motion/react';
import { DASH } from '../format';
import { valueSpring } from '../motion';

/**
 * A number that glides to each new value instead of jumping, so the eye can follow
 * a reading as it changes during playback. Missing values show a dash, never 0.
 */
export function AnimatedNumber({ value, digits = 1, unit }: { value: number | null | undefined; digits?: number; unit?: string }) {
  const mv = useSpring(value ?? 0, valueSpring);
  useEffect(() => {
    if (value !== null && value !== undefined && Number.isFinite(value)) mv.set(value);
  }, [value, mv]);
  const text = useTransform(mv, (v) => v.toFixed(digits));

  if (value === null || value === undefined || !Number.isFinite(value)) return <span>{DASH}</span>;
  return (
    <span className="anum">
      <motion.span>{text}</motion.span>
      {unit && <span className="anum-unit">{unit}</span>}
    </span>
  );
}
