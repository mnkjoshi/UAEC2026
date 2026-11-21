/**
 * Batter-eye logo: an eye inside a battery cell. The iris is split between coolant cyan
 * (healthy) and high-voltage orange (attention); the pupil is the charge indicator.
 * Concept explored in Canva, redrawn here as a geometric SVG so it stays crisp at any size.
 */
export function LogoMark({ size = 28, title }: { size?: number; title?: string }) {
  return (
    <svg
      width={size * (40 / 26)}
      height={size}
      viewBox="0 0 40 26"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      className="logo-mark"
    >
      {/* Cell casing and terminal */}
      <rect x="1" y="1" width="33" height="24" rx="4.5" fill="none" stroke="currentColor" strokeWidth="2" />
      <rect x="35.5" y="8.5" width="3.5" height="9" rx="1.5" fill="currentColor" />
      {/* Eye */}
      <path d="M5 13 C 10 5.2, 25 5.2, 30 13 C 25 20.8, 10 20.8, 5 13 Z" fill="currentColor" />
      {/* Iris: cyan / orange halves */}
      <path d="M17.5 7.4 A 5.6 5.6 0 0 0 17.5 18.6" fill="none" stroke="#5cc8d6" strokeWidth="2.2" />
      <path d="M17.5 7.4 A 5.6 5.6 0 0 1 17.5 18.6" fill="none" stroke="#ff7a1a" strokeWidth="2.2" />
      {/* Pupil: charge bars */}
      <circle cx="17.5" cy="13" r="4.5" fill="#0f1720" />
      <rect x="14.6" y="11" width="1.4" height="4" rx="0.3" fill="#5cc8d6" />
      <rect x="16.8" y="11" width="1.4" height="4" rx="0.3" fill="#5cc8d6" />
      <rect x="19" y="11" width="1.4" height="4" rx="0.3" fill="#ff7a1a" />
    </svg>
  );
}

/** Mark plus the "Batter-eye" wordmark. */
export function Logo({ size = 26, subtitle }: { size?: number; subtitle?: string }) {
  return (
    <span className="logo">
      <LogoMark size={size} />
      <span className="logo-text">
        <span className="logo-name">Batter-eye</span>
        {subtitle && <span className="logo-sub">{subtitle}</span>}
      </span>
    </span>
  );
}
