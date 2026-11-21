/** Side-effect hooks: playback clock and the audible critical alarm. */
import { useEffect, useRef, useState } from 'react';
import { isAcknowledged, useDashboard } from './store';

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

/** Sends a desktop notification for each new or escalated critical alert during playback. */
export function useDesktopNotifications() {
  const cursor = useDashboard((s) => s.cursor);
  const timeline = useDashboard((s) => s.timeline);
  const enabled = useDashboard((s) => s.desktopAlerts);
  const playing = useDashboard((s) => s.playing);
  const sourceName = useDashboard((s) => s.sourceName);

  useEffect(() => {
    if (!enabled || !playing || !timeline || typeof Notification === 'undefined') return;
    for (const e of timeline.events) {
      if (e.frameIndex !== cursor || e.severity !== 'critical' || (e.kind !== 'raised' && e.kind !== 'escalated')) continue;
      const alert = timeline.states[cursor].alerts.find((a) => a.id === e.alertId);
      try {
        new Notification(`Critical: ${alert?.title ?? e.message}`, {
          body: `${sourceName ?? 'Pack'} · ${e.moduleIds.join(', ')}\n${alert?.action ?? ''}`,
          tag: e.alertId,
        });
      } catch {
        // Some browsers only allow notifications from a service worker; the banner still shows.
      }
    }
  }, [cursor, timeline, enabled, playing, sourceName]);
}

/** Wall-clock time a critical may stay unacknowledged before it escalates to a supervisor. */
export const ESCALATE_AFTER_MS = 20_000;

/**
 * Tracks how long each critical alert has been on screen without acknowledgement
 * (in real time, since that is what matters for a human response) and returns the
 * ones that have passed the escalation limit.
 */
export function useEscalation() {
  const timeline = useDashboard((s) => s.timeline);
  const cursor = useDashboard((s) => s.cursor);
  const acknowledged = useDashboard((s) => s.acknowledged);
  const seen = useRef(new Map<string, number>());
  const [now, setNow] = useState(() => Date.now());

  const unacked = (timeline?.states[cursor]?.alerts ?? []).filter(
    (a) => a.severity === 'critical' && !isAcknowledged(acknowledged, a.id, a.severity),
  );
  const key = unacked.map((a) => a.id).join(',');

  // New dataset: forget previous timers.
  useEffect(() => seen.current.clear(), [timeline]);

  useEffect(() => {
    const t = Date.now();
    for (const a of unacked) if (!seen.current.has(a.id)) seen.current.set(a.id, t);
    for (const id of [...seen.current.keys()]) if (!unacked.some((a) => a.id === id)) seen.current.delete(id);
    if (!unacked.length) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` captures the unacknowledged set
  }, [key]);

  return unacked
    .map((a) => ({ alert: a, waitedMs: now - (seen.current.get(a.id) ?? now) }))
    .filter((x) => x.waitedMs >= ESCALATE_AFTER_MS);
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
