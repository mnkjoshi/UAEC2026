/** Display formatting. Missing values always render as an em dash, never 0 or NaN. */
import type { Metric, Severity } from '../core';

export const DASH = '—';

export function fmt(value: number | null | undefined, digits = 1, unit = ''): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return DASH;
  return `${value.toFixed(digits)}${unit ? ` ${unit}` : ''}`;
}

export function fmtSigned(value: number | null | undefined, digits = 1, unit = ''): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return DASH;
  const sign = value > 0 ? '+' : value < 0 ? '−' : '±';
  return `${sign}${Math.abs(value).toFixed(digits)}${unit ? ` ${unit}` : ''}`;
}

export function fmtTime(d: Date | null | undefined): string {
  if (!d) return DASH;
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

/** "1 min 20 s" style duration. */
export function fmtDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  return s % 60 ? `${m} min ${s % 60} s` : `${m} min`;
}

export const METRIC_META: Record<Metric, { label: string; unit: string; digits: number }> = {
  temperature: { label: 'Temperature', unit: '°C', digits: 1 },
  voltage: { label: 'Voltage', unit: 'V', digits: 3 },
  current: { label: 'Current', unit: 'A', digits: 1 },
  soc: { label: 'State of charge', unit: '%', digits: 1 },
  soh: { label: 'State of health', unit: '%', digits: 1 },
};

/** Severity presentation: colour token, icon and words. Colour is never the only cue. */
export const SEVERITY_META: Record<Severity, { label: string; icon: string; color: string; banner: string }> = {
  normal: { label: 'Normal', icon: '✓', color: 'var(--sev-normal)', banner: 'All systems normal' },
  advisory: { label: 'Advisory', icon: 'i', color: 'var(--sev-advisory)', banner: 'Advisory' },
  data_fault: { label: 'No data', icon: '?', color: 'var(--sev-data-fault)', banner: 'Sensor / data fault' },
  warning: { label: 'Warning', icon: '!', color: 'var(--sev-warning)', banner: 'Warning' },
  critical: { label: 'Critical', icon: '✕', color: 'var(--sev-critical)', banner: 'Critical' },
};
