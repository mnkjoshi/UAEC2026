# Project Plan

Working plan for the UAEC 2026 Programming challenge: a battery-safety monitoring dashboard for an electric-bus fleet.

## Goal

Build an interactive dashboard that:

- shows **live pack health** for a 12-module battery pack,
- **raises alerts** graded by hazard level,
- **diagnoses** what is wrong and tells the operator what to do,
- **reliably ingests an unseen CSV** at judging time without crashing or raising false alarms.

## How we are judged

| Programming criterion (/80) | Weight | What it means for us |
|---|---|---|
| Program design & architecture | ×4 | Clean pipeline: ingest → validate → detect → diagnose → display, with logic separate from UI |
| Solution completeness | ×4 | Pack + 12-module view, **historical trends**, anomaly detection, **sensor fault detection (missing, stuck, corrupted)** |
| GUI & accessibility | ×3 | Colour-coding that communicates urgency under pressure |
| Code quality & readability | ×2 | Clear structure and naming |
| Reliability | ×2 | Handles the unseen dataset with no crashes and **no false alarms** |
| Comments & documentation | ×1 | Clear README; logic explained |

Presentation (/40): visuals, organization, professionalism, Q&A, content quality, each ×2.

## Tech stack

| Layer | Choice | Reason |
|---|---|---|
| App | React + TypeScript + Vite | Fast to build, typed data model, runs fully in the browser |
| CSV parsing | PapaParse | Robust, handles malformed rows |
| Charts | ECharts or Recharts | Multi-series time charts with threshold bands |
| State | Zustand | Simple global store for playback and pack state |
| Tests | Vitest | Unit-test the detection engine against every dataset |
| Hosting | GitHub Pages | Judges can open a live link with no setup |

The detection engine is **pure TypeScript with no UI dependencies**, so it can be tested on its own and reused.

## Architecture

```
src/
  core/                 Detection engine (pure logic, fully tested)
    types.ts            Reading, ModuleState, Alert, PackState
    config.ts           All thresholds, each with a justification comment
    parser.ts           CSV → validated readings + data-quality report
    detectors/
      limits.ts         Absolute safety limits
      packRelative.ts   Deviation from pack median
      rateOfChange.ts   dT/dt, dV/dt
      sensorIntegrity.ts Missing, stuck, out-of-range, spikes
    diagnosis.ts        Rules → finding + recommended action
    alerts.ts           Persistence, hysteresis, alert lifecycle
    forecast.ts         Time-to-limit projection
    engine.ts           step(frame) → PackState  (stream or replay)
  ui/
    components/         PackMap, ModuleTile, AlertPanel, TrendChart, ModuleDetail,
                        KpiBar, PlaybackControls, DataQualityPanel, Settings
    store.ts            App state and playback clock
tests/
  scenarios.test.ts     One test per provided dataset (expected alerts)
  edgeCases.test.ts     Synthetic bad CSVs
  fixtures/             Generated edge-case CSVs
```

Detection details and thresholds: [DETECTION_LOGIC.md](DETECTION_LOGIC.md).
Dataset findings: [DATA_ANALYSIS.md](DATA_ANALYSIS.md).

## Features

### Must have

- [ ] Load any CSV in the provided format (drag-and-drop + file picker); the 5 provided scenarios built in
- [ ] Real-time replay: play, pause, step, scrub, speed 1×–20×
- [ ] Pack status banner (worst-of-modules)
- [ ] 12-module pack map, colour-coded, with a selectable metric (T / V / SOC / SOH)
- [ ] Alert panel: severity, diagnosis, recommended action, first-seen time, acknowledge
- [ ] Trend charts for all metrics with threshold bands; highlight a selected module
- [ ] Sensor-fault detection: missing, stuck, out-of-range, spikes
- [ ] Data-quality report: rows read, rows rejected, missing %, per-module faults
- [ ] Never crash on bad input

### Should have

- [ ] Module detail drawer (all metrics + diagnosis history)
- [ ] Time-to-limit forecast
- [ ] Alert history log with CSV export
- [ ] KPI bar: max T, temperature spread, min V, voltage spread, avg SOC/SOH, data quality
- [ ] Editable thresholds in a settings panel

### Nice to have

- [ ] Audible alarm for critical alerts (toggle)
- [ ] Light/dark mode
- [ ] Fleet view (multiple packs/buses side by side)

## Team roles

| Role | Owns |
|---|---|
| **A: Engine** | Parser, detectors, alert manager, diagnosis, tests |
| **B: UI shell** | Layout, pack map, playback controls, store |
| **C: Alerts & charts** | Alert panel, trend charts, module detail, KPI bar |
| **D: Docs & deck** (or shared) | README, threshold justification, edge-case CSVs, slides |

The **interface between A and B/C is `src/core/types.ts`**. Agree on it first; then the UI can be built against mock data while the engine is in progress.

## Timeline: Saturday, Nov 21

| Time | Milestone |
|---|---|
| 9:50 – 10:15 | Scaffold project, agree `types.ts`, first commit |
| 10:15 – 12:00 | Parallel build: engine passes the 5 scenario tests; UI layout running on mock data |
| 12:00 – 1:00 | Lunch (integrate if possible) |
| 1:00 – 2:30 | Full integration: diagnosis, forecasts, trends, alert lifecycle |
| 2:30 – 3:30 | **Robustness pass** with synthetic edge-case CSVs; UI polish |
| 3:30 – 4:30 | README, final docs, slides → PDF in `docs/` |
| **4:30** | **Code freeze.** Fresh clone + run test, deploy, make repo public |
| **4:50** | Submission email sent |
| **5:00** | **Hard deadline.** Commits after this are not accepted |

Commit early and often: judges review commit history.

## Submission checklist

- [ ] App runs from a fresh clone using only the README instructions
- [ ] README: overview, features, how to run, how to load a CSV, link to detection logic
- [ ] Presentation PDF committed to `docs/`
- [ ] All tests pass; normal dataset produces zero alerts
- [ ] Live demo link works (GitHub Pages)
- [ ] Repository set to **public** before 5:00 PM
- [ ] Email repo link to the category lead with the two required CCs (addresses in the Information Sheet in [`documentation/`](../documentation))

## Presentation: Sunday, Nov 22

~10 minutes + live demo on the judges' dataset, then 5 minutes Q&A. **Every team member must speak.**

| # | Section | Speaker |
|---|---|---|
| 1 | Problem & operator needs | |
| 2 | Architecture overview (diagram) | |
| 3 | Detection logic & threshold justification | |
| 4 | Data-integrity handling | |
| 5 | UI/UX decisions (colour, layout, alert design) | |
| 6 | Live demo on the unseen dataset | |
| 7 | Limitations & future work | |

**Rehearse:** load an unfamiliar CSV within the first minute of the demo.

**Likely questions to prepare for:**

- Why 45 °C / 55 °C? Why 30 mV?
- How do you avoid false alarms?
- What if every sensor drops out at once?
- How would this scale to a full fleet?
- Why compare to the pack median rather than a fixed value?
