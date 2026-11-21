/** Side-effect hooks: playback clock and the audible critical alarm. */
import { useEffect, useRef } from 'react';
import { useDashboard } from './store';

/**
 * Advances the cursor while playing. At 1x one frame is shown per real sample
 * interval (true real time); higher speeds compress time for demos.
 */
export function usePlaybackClock() {
  const playing = useDashboard((s) => s.playing);
  const speed = useDashboard((s) => s.speed);
  const intervalSec = useDashboard((s) => s.dataset?.quality.intervalSec || 10);

  useEffect(() => {
    if (!playing) return;
    const ms = Math.max(50, (intervalSec * 1000) / speed);
    const timer = window.setInterval(() => {
      const { cursor, timeline, setCursor } = useDashboard.getState();
      const last = (timeline?.states.length ?? 1) - 1;
      if (cursor >= last) useDashboard.setState({ playing: false });
      else setCursor(cursor + 1);
    }, ms);
    return () => window.clearInterval(timer);
  }, [playing, speed, intervalSec]);
}

/** Plays a short two-tone alarm when a new critical alert is raised or escalated during playback. */
export function useCriticalAlarm() {
  const cursor = useDashboard((s) => s.cursor);
  const timeline = useDashboard((s) => s.timeline);
  const soundOn = useDashboard((s) => s.soundOn);
  const playing = useDashboard((s) => s.playing);
  const ctxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (!soundOn || !playing || !timeline) return;
    const fresh = timeline.events.some(
      (e) => e.frameIndex === cursor && e.severity === 'critical' && (e.kind === 'raised' || e.kind === 'escalated'),
    );
    if (!fresh) return;
    try {
      const ctx = (ctxRef.current ??= new AudioContext());
      [880, 660, 880].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = freq;
        gain.gain.value = 0.08;
        osc.connect(gain).connect(ctx.destination);
        const at = ctx.currentTime + i * 0.18;
        osc.start(at);
        osc.stop(at + 0.15);
      });
    } catch {
      // Audio unavailable (autoplay policy etc.): visual alerts still work.
    }
  }, [cursor, timeline, soundOn, playing]);
}
