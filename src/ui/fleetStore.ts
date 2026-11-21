/**
 * Fleet mode: several packs (one CSV per bus) analysed side by side and replayed in sync.
 *
 * Each bus keeps its own precomputed engine timeline. Opening a bus hands its timeline
 * to the single-pack dashboard store, so the detailed view is exactly the normal dashboard.
 */
import { create } from 'zustand';
import { parseTelemetryCsv, runEngine, type ParsedDataset, type Timeline } from '../core';
import { useDashboard, type ScenarioEntry } from './store';

export interface Bus {
  id: string;
  name: string;
  route: string;
  sourceName: string;
  text: string;
  dataset: ParsedDataset;
  timeline: Timeline;
}

/** Scenarios used for the demo fleet, with a plausible bus number and route for each. */
const DEMO_FLEET: Array<[scenarioId: string, bus: string, route: string]> = [
  ['normal', 'Bus 4101', 'Route 9 · Downtown'],
  ['thermal_rise', 'Bus 4102', 'Route 4 · University'],
  ['low_voltage', 'Bus 4103', 'Route 8 · Abbottsfield'],
  ['sensor_failure', 'Bus 4104', 'Route 1 · West Edmonton'],
  ['multiple_module_heating', 'Bus 4105', 'Route 7 · Jasper Place'],
  ['internal_short', 'Bus 4106', 'Route 2 · Clareview'],
  ['stuck_sensor', 'Bus 4107', 'Route 5 · Westmount'],
  ['whole_pack_heating', 'Bus 4108', 'Route 3 · Mill Woods'],
];

interface FleetState {
  buses: Bus[];
  active: boolean; // fleet mode on
  viewingBusId: string | null; // a bus opened in the single-pack dashboard
  cursor: number;
  playing: boolean;
  loading: boolean;
  error: string | null;
  /** Card grid or map. */
  view: 'cards' | 'map';

  loadDemoFleet: (scenarios: ScenarioEntry[]) => Promise<void>;
  loadFiles: (files: File[]) => Promise<void>;
  openBus: (id: string) => void;
  backToFleet: () => void;
  exitFleet: () => void;
  setCursor: (i: number) => void;
  setPlaying: (playing: boolean) => void;
  setView: (view: 'cards' | 'map') => void;
}

/** Length of the longest bus recording, in frames. */
export const fleetLength = (buses: Bus[]) => Math.max(1, ...buses.map((b) => b.timeline.states.length));

/** A bus's state at the shared fleet cursor (shorter recordings hold their last frame). */
export const busState = (bus: Bus, cursor: number) =>
  bus.timeline.states[Math.min(cursor, bus.timeline.states.length - 1)];

export const useFleet = create<FleetState>((set, get) => {
  const build = (entries: Array<{ name: string; route: string; sourceName: string; text: string }>) => {
    const config = useDashboard.getState().config;
    const buses: Bus[] = [];
    const failed: string[] = [];
    entries.forEach((e, i) => {
      try {
        const dataset = parseTelemetryCsv(e.text, e.sourceName);
        buses.push({ id: `bus-${i}`, ...e, dataset, timeline: runEngine(dataset, config) });
      } catch {
        failed.push(e.sourceName);
      }
    });
    if (!buses.length) {
      const error = 'None of the files could be read as battery telemetry.';
      set({ loading: false, error });
      useDashboard.setState({ error });
      return;
    }
    useDashboard.getState().unload();
    set({
      buses,
      active: true,
      viewingBusId: null,
      cursor: 0,
      playing: true,
      loading: false,
      error: failed.length ? `Skipped ${failed.length} unreadable file(s): ${failed.join(', ')}` : null,
    });
  };

  return {
    buses: [],
    active: false,
    viewingBusId: null,
    cursor: 0,
    playing: false,
    loading: false,
    error: null,
    view: 'cards',

    loadDemoFleet: async (scenarios) => {
      set({ loading: true });
      const entries = await Promise.all(
        DEMO_FLEET.map(async ([id, name, route]) => {
          const entry = scenarios.find((s) => s.id === id);
          if (!entry) return null;
          const res = await fetch(`${import.meta.env.BASE_URL}${entry.file}`);
          return res.ok ? { name, route, sourceName: entry.name, text: await res.text() } : null;
        }),
      );
      build(entries.filter((e): e is NonNullable<typeof e> => e !== null));
    },

    loadFiles: async (files) => {
      set({ loading: true });
      const entries = await Promise.all(
        files.map(async (f, i) => ({
          name: f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '),
          route: `Uploaded file ${i + 1}`,
          sourceName: f.name,
          text: await f.text(),
        })),
      );
      build(entries);
    },

    openBus: (id) => {
      const bus = get().buses.find((b) => b.id === id);
      if (!bus) return;
      const last = bus.timeline.states.length - 1;
      useDashboard.setState({
        dataset: bus.dataset,
        timeline: bus.timeline,
        sourceName: `${bus.name}: ${bus.sourceName}`,
        sourceText: bus.text,
        cursor: Math.min(get().cursor, last),
        playing: false,
        acknowledged: {},
        selectedModule: null,
        error: null,
      });
      set({ viewingBusId: id, playing: false });
    },

    backToFleet: () => {
      const dash = useDashboard.getState();
      // Thresholds may have been edited in the bus view: re-analyse every bus with them.
      const buses = get().buses.map((b) => ({ ...b, timeline: runEngine(b.dataset, dash.config) }));
      set({ buses, viewingBusId: null, cursor: dash.cursor });
      dash.unload();
    },

    exitFleet: () => {
      set({ active: false, viewingBusId: null, buses: [], playing: false, cursor: 0 });
      useDashboard.getState().unload();
    },

    setView: (view) => set({ view }),
    setCursor: (i) => set({ cursor: Math.max(0, Math.min(fleetLength(get().buses) - 1, i)) }),
    setPlaying: (playing) => {
      if (playing && get().cursor >= fleetLength(get().buses) - 1) set({ cursor: 0 });
      set({ playing });
    },
  };
});
