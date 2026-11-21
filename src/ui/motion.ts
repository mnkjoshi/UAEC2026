/**
 * Motion tokens. One vocabulary for every animation in the app.
 *
 * Defaults are critically damped springs (no overshoot): calm and professional, and
 * interruptible because springs always start from the current on-screen value.
 * Bounce is reserved for things that carry momentum, which this app has very few of.
 */
import { useEffect, useState } from 'react';
import type { Transition } from 'motion/react';

/** Standard UI movement: panels, cards, list items. */
export const spring: Transition = { type: 'spring', bounce: 0, visualDuration: 0.45 };
/** Large, slow, deliberate movement: hero reveals, big visuals. */
export const springSlow: Transition = { type: 'spring', bounce: 0, visualDuration: 0.9 };
/** Small, quick feedback: badges, counters, presses. */
export const springFast: Transition = { type: 'spring', bounce: 0, visualDuration: 0.25 };

/** Spring parameters for useSpring-driven values (damping ratio ≈ 1). */
export const valueSpring = { stiffness: 220, damping: 30, mass: 1 };

/** Staggered children: each child uses `variants={rise}`. */
export const stagger = (each = 0.06, delay = 0) => ({
  hidden: {},
  show: { transition: { staggerChildren: each, delayChildren: delay } },
});

export const rise = {
  hidden: { opacity: 0, y: 18, filter: 'blur(6px)' },
  show: { opacity: 1, y: 0, filter: 'blur(0px)', transition: springSlow },
};

/** True while a media query matches (e.g. wide screens get the pinned scroll story). */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}
