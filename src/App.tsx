/**
 * Dashboard layout. Reading order follows operator priority:
 *   1. pack status banner   (is anything wrong?)
 *   2. alerts               (what, where, what to do)
 *   3. pack map + KPIs      (which modules, how bad)
 *   4. trends + detail      (how did we get here, where is it going)
 *   5. event log + data quality (audit trail, can I trust the data?)
 */
import { useEffect, useState } from 'react';
import { MotionConfig, motion } from 'motion/react';
import { spring } from './ui/motion';
import { AlertPanel } from './ui/components/AlertPanel';
import { DataQualityPanel } from './ui/components/DataQualityPanel';
import { ErrorBoundary } from './ui/components/ErrorBoundary';
import { EscalationBanner } from './ui/components/EscalationBanner';
import { EventLog } from './ui/components/EventLog';
import { FleetView } from './ui/components/FleetView';
import { KpiBar } from './ui/components/KpiBar';
import { LocationPanel } from './ui/components/LocationPanel';
import { ModuleDetail } from './ui/components/ModuleDetail';
import { PackMap } from './ui/components/PackMap';
import { PlaybackBar } from './ui/components/PlaybackBar';
import { SettingsDrawer } from './ui/components/SettingsDrawer';
import { StatusBanner } from './ui/components/StatusBanner';
import { TopBar } from './ui/components/TopBar';
import { TrendChart } from './ui/components/TrendChart';
import { Landing } from './ui/components/Landing';
import { useCriticalAlarm, useDesktopNotifications, usePlaybackClock } from './ui/hooks';
import { fleetLength, useFleet } from './ui/fleetStore';
import { useDashboard } from './ui/store';

export default function App() {
  const timeline = useDashboard((s) => s.timeline);
  const dataset = useDashboard((s) => s.dataset);
  const cursor = useDashboard((s) => s.cursor);
  const config = useDashboard((s) => s.config);
  const error = useDashboard((s) => s.error);
  const sourceName = useDashboard((s) => s.sourceName);
  const [dragging, setDragging] = useState(false);

  const fleetActive = useFleet((s) => s.active);
  const viewingBus = useFleet((s) => s.viewingBusId);

  usePlaybackClock();
  useCriticalAlarm();
  useDesktopNotifications();

  // Load the scenario list; ?scenario=<id>&frame=<n> opens a scenario at a given moment (handy for demos).
  useEffect(() => {
    const s = useDashboard.getState();
    s.loadScenarios().then(async () => {
      const params = new URLSearchParams(window.location.search);
      if (params.get('fleet') === 'demo') {
        await useFleet.getState().loadDemoFleet(useDashboard.getState().scenarios);
        const frame = params.get('frame');
        if (frame !== null) useFleet.setState({ cursor: frame === 'end' ? fleetLength(useFleet.getState().buses) - 1 : Number(frame), playing: false });
        return;
      }
      const entry = useDashboard.getState().scenarios.find((x) => x.id === params.get('scenario'));
      if (!entry) return;
      await useDashboard.getState().loadScenario(entry);
      const frame = params.get('frame');
      if (frame !== null) {
        useDashboard.getState().setCursor(frame === 'end' ? Number.MAX_SAFE_INTEGER : Number(frame));
        useDashboard.setState({ playing: false });
      }
    });
  }, []);

  // Keyboard: Space = play/pause, ←/→ = step.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(target.tagName)) return;
      const s = useDashboard.getState();
      if (!s.timeline) return;
      if (e.code === 'Space') {
        e.preventDefault();
        s.setPlaying(!s.playing);
      } else if (e.key === 'ArrowRight') s.step(1);
      else if (e.key === 'ArrowLeft') s.step(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Drag-and-drop a CSV anywhere on the page.
  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const files = [...(e.dataTransfer.files ?? [])];
    if (files.length > 1) useFleet.getState().loadFiles(files);
    else if (files[0]) useDashboard.getState().loadCsvText(await files[0].text(), files[0].name);
  };

  const state = timeline?.states[cursor];

  return (
    <MotionConfig reducedMotion="user" transition={spring}>
    <div
      className="app"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false);
      }}
      onDrop={onDrop}
    >
      {timeline && <TopBar />}
      {error && (
        <div className="error-bar" role="alert">
          {error}
          <button type="button" className="link" onClick={() => useDashboard.setState({ error: null })}>
            dismiss
          </button>
        </div>
      )}

      <ErrorBoundary>
        {fleetActive && !viewingBus ? (
          <FleetView />
        ) : !timeline || !dataset || !state ? (
          <Landing />
        ) : (
          <motion.main
            className="dashboard"
            key={sourceName ?? 'dashboard'}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <StatusBanner state={state} />
            <EscalationBanner />
            <PlaybackBar timeline={timeline} />
            <div className="grid-main">
              <div className="col-left">
                <PackMap state={state} />
                <KpiBar kpis={state.kpis} config={config} cellsInSeries={timeline.cellsInSeries} />
                <TrendChart timeline={timeline} cursor={cursor} config={config} />
              </div>
              <div className="col-right">
                <AlertPanel alerts={state.alerts} now={state.timestamp} modules={dataset.modules} />
                <LocationPanel />
                <ModuleDetail state={state} timeline={timeline} cursor={cursor} />
              </div>
            </div>
            <div className="grid-bottom">
              <EventLog timeline={timeline} cursor={cursor} sourceName={sourceName ?? 'dataset'} />
              <DataQualityPanel dataset={dataset} timeline={timeline} />
            </div>
          </motion.main>
        )}
      </ErrorBoundary>

      <SettingsDrawer />
      {dragging && (
        <div className="drop-overlay" aria-hidden>
          <div>Drop CSV to analyse</div>
        </div>
      )}
    </div>
    </MotionConfig>
  );
}
