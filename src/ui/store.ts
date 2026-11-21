/**
 * Global UI state: the loaded dataset, the engine's timeline, playback position,
 * selection and operator actions (acknowledgements, settings).
 *
 * The engine runs once per load (or settings change) over the whole file; playback
 * then reveals one precomputed, causal state per tick, exactly as live data would.
 */
import { create } from 'zustand';
import {
  SEVERITY_RANK,
  cloneDefaultConfig,
  parseTelemetryCsv,
  runEngine,
  type DetectionConfig,
  type Metric,
  type ParsedDataset,
  type Severity,
  type Timeline,
} from '../core';

export interface ScenarioEntry {
  id: string;
  name: string;
  file: string;
  description: string;
  expected: string;
  source: 'provided' | 'generated' | string;
}

export const SPEEDS = [1, 5, 10, 20, 50] as const;

interface DashboardState {
  scenarios: ScenarioEntry[];
  sourceName: string | null;
  sourceText: string | null;
  dataset: ParsedDataset | null;
  timeline: Timeline | null;
  error: string | null;
  loading: boolean;

  cursor: number;
  playing: boolean;
  speed: number;

  selectedModule: string | null;
  chartMetric: Metric;
  /** Alert id → severity at the time it was acknowledged (re-alerts if it escalates). */
  acknowledged: Record<string, Severity>;
  soundOn: boolean;
  /** Browser (desktop) notifications for new critical alerts. */
  desktopAlerts: boolean;
  settingsOpen: boolean;
  config: DetectionConfig;

  loadScenarios: () => Promise<void>;
  loadScenario: (entry: ScenarioEntry) => Promise<void>;
  loadCsvText: (text: string, name: string) => void;
  /** Back to the landing page. */
  unload: () => void;
  setCursor: (i: number) => void;
  step: (delta: number) => void;
  setPlaying: (playing: boolean) => void;
  setSpeed: (speed: number) => void;
  selectModule: (id: string | null) => void;
  setChartMetric: (m: Metric) => void;
  acknowledge: (alertId: string, severity: Severity) => void;
  acknowledgeAll: () => void;
  toggleSound: () => void;
  toggleDesktopAlerts: () => Promise<void>;
  setSettingsOpen: (open: boolean) => void;
  updateConfig: (config: DetectionConfig) => void;
}

export const useDashboard = create<DashboardState>((set, get) => {
  /** Parses and analyses CSV text; keeps the previous dataset if the new one is unusable. */
  const analyse = (text: string, name: string, keepCursor = false) => {
    try {
      const dataset = parseTelemetryCsv(text, name);
      const timeline = runEngine(dataset, get().config);
      const last = timeline.states.length - 1;
      set({
        dataset,
        timeline,
        sourceName: name,
        sourceText: text,
        error: null,
        loading: false,
        cursor: keepCursor ? Math.min(get().cursor, last) : 0,
        playing: keepCursor ? get().playing : timeline.states.length > 1,
        acknowledged: keepCursor ? get().acknowledged : {},
        selectedModule: keepCursor ? get().selectedModule : null,
      });
    } catch (e) {
      set({ error: `Could not load "${name}": ${e instanceof Error ? e.message : String(e)}`, loading: false });
    }
  };

  return {
    scenarios: [],
    sourceName: null,
    sourceText: null,
    dataset: null,
    timeline: null,
    error: null,
    loading: false,
    cursor: 0,
    playing: false,
    speed: 10,
    selectedModule: null,
    chartMetric: 'temperature',
    acknowledged: {},
    soundOn: false,
    desktopAlerts: false,
    settingsOpen: false,
    config: cloneDefaultConfig(),

    loadScenarios: async () => {
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}scenarios/index.json`);
        if (res.ok) set({ scenarios: (await res.json()) as ScenarioEntry[] });
      } catch {
        // No manifest: the operator can still upload a CSV.
      }
    },

    loadScenario: async (entry) => {
      set({ loading: true, playing: false });
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}${entry.file}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        analyse(await res.text(), entry.name);
      } catch (e) {
        set({ error: `Could not fetch scenario "${entry.name}": ${e instanceof Error ? e.message : e}`, loading: false });
      }
    },

    loadCsvText: (text, name) => analyse(text, name),
    unload: () =>
      set({ dataset: null, timeline: null, sourceName: null, sourceText: null, playing: false, cursor: 0, selectedModule: null, error: null }),

    setCursor: (i) => {
      const n = get().timeline?.states.length ?? 0;
      set({ cursor: Math.max(0, Math.min(n - 1, i)) });
    },
    step: (delta) => {
      get().setCursor(get().cursor + delta);
      set({ playing: false });
    },
    setPlaying: (playing) => {
      const { timeline, cursor } = get();
      if (playing && timeline && cursor >= timeline.states.length - 1) set({ cursor: 0 });
      set({ playing });
    },
    setSpeed: (speed) => set({ speed }),
    selectModule: (id) => set({ selectedModule: id }),
    setChartMetric: (chartMetric) => set({ chartMetric }),
    acknowledge: (alertId, severity) => set({ acknowledged: { ...get().acknowledged, [alertId]: severity } }),
    acknowledgeAll: () => {
      const { timeline, cursor, acknowledged } = get();
      const alerts = timeline?.states[cursor]?.alerts ?? [];
      set({ acknowledged: { ...acknowledged, ...Object.fromEntries(alerts.map((a) => [a.id, a.severity])) } });
    },
    toggleSound: () => set({ soundOn: !get().soundOn }),
    toggleDesktopAlerts: async () => {
      if (get().desktopAlerts) return set({ desktopAlerts: false });
      if (typeof Notification === 'undefined') return set({ error: 'This browser does not support desktop notifications.' });
      const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
      if (permission === 'granted') set({ desktopAlerts: true });
      else set({ error: 'Desktop notifications are blocked. Allow them in the browser\'s site settings to use this.' });
    },
    setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
    updateConfig: (config) => {
      set({ config });
      const { sourceText, sourceName } = get();
      if (sourceText && sourceName) analyse(sourceText, sourceName, true);
    },
  };
});

/** True if the alert has been acknowledged at (or above) its current severity. */
export function isAcknowledged(acknowledged: Record<string, Severity>, id: string, severity: Severity): boolean {
  const ack = acknowledged[id];
  return ack !== undefined && SEVERITY_RANK[ack] >= SEVERITY_RANK[severity];
}
