/**
 * Line icons (24×24, 1.75 px stroke) drawn as inline SVG, so the interface never relies
 * on emoji or font glyphs that render differently on every machine.
 */
const PATHS = {
  upload: 'M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3',
  download: 'M12 4v12M7 11l5 5 5-5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3',
  report: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h6',
  bell: 'M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0',
  bellOff: 'M8.7 3A6 6 0 0 1 18 8c0 2.7.4 4.7 1 6.1M17 17H3s3-2 3-9a5.9 5.9 0 0 1 .3-1.9M10.3 21a1.94 1.94 0 0 0 3.4 0M2 2l20 20',
  monitor: 'M3 4h18v12H3zM8 20h8M12 16v4',
  sliders: 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6',
  play: 'M7 4.5v15l13-7.5z',
  pause: 'M7 4h4v16H7zM13 4h4v16h-4z',
  restart: 'M4.5 4.5H7v15H4.5zM20 5 8.5 12 20 19z',
  end: 'M17 4.5h2.5v15H17zM4 5l11.5 7L4 19z',
  stepBack: 'M15 18l-6-6 6-6',
  stepForward: 'M9 18l6-6-6-6',
  arrowLeft: 'M19 12H5M11 18l-6-6 6-6',
  close: 'M18 6 6 18M6 6l12 12',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  info: 'M12 11v6M12 7.5v.01',
  question: 'M9.2 9a3 3 0 0 1 5.8 1c0 2-3 2.5-3 4.5M12 17.5v.01',
  alert: 'M12 8v5M12 16.5v.01',
  cross: 'M8 8l8 8M16 8l-8 8',
  warningTriangle: 'M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01',
  clock: 'M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
  fleet: 'M4 6h12a3 3 0 0 1 3 3v7H4zM4 11h15M7 19.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM16 19.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
} as const;

export type IconName = keyof typeof PATHS;

/** Icons that read better filled than stroked. */
const FILLED: ReadonlySet<IconName> = new Set(['play', 'pause', 'restart', 'end']);

export function Icon({ name, size = 16, className }: { name: IconName; size?: number; className?: string }) {
  const filled = FILLED.has(name);
  return (
    <svg
      className={className ? `icon ${className}` : 'icon'}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
