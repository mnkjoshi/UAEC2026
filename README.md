# UAEC 2026: Battery Safety Monitoring Dashboard

An interactive battery-management dashboard for an electric-bus fleet operator.
It replays battery telemetry in real time, shows the health of every module in the pack,
raises graded alerts, and explains what is wrong and what the operator should do.

Built for the University of Alberta Engineering Competition 2026, Programming category.

> **Status:** in development. Planning and detection design are complete; the application is being built.
> Run instructions below describe the planned setup and will be confirmed once the app is scaffolded.

## Features (planned)

- **Live pack overview:** a 12-module pack map, colour-coded by severity, with a pack-level status banner
- **Real-time replay:** play, pause, step, scrub and speed control over any telemetry CSV
- **Fault detection:**
  - absolute safety limits (temperature, voltage, SOC, SOH, current)
  - deviation from the rest of the pack, for early warning
  - rate-of-change detection for thermal events and voltage collapse
- **Diagnosis:** plain-language findings (e.g. *isolated thermal event*, *cooling failure across adjacent modules*, *sensor wiring fault*) with recommended operator actions
- **Sensor and data-integrity checks:** missing, stuck, out-of-range and spiking sensors are reported separately from battery hazards
- **Historical trends:** per-metric charts for all modules with threshold bands
- **Time-to-limit forecast:** e.g. "M07 reaches 55 °C in ~40 s"
- **Alert history:** acknowledge alerts and export the log
- **Robust CSV ingestion:** malformed or incomplete files load with a data-quality report instead of crashing

## Running the app (planned)

Requires Node.js 18+.

```bash
npm install
npm run dev      # start the dashboard at http://localhost:5173
npm test         # run the detection-engine tests
npm run build    # production build
```

Then drag a CSV onto the dashboard, or pick one of the built-in scenarios.

## Input format

One row per module per timestamp:

```
Timestamp,Module ID,Temperature (C),Voltage (V),Current (A),State of charge (%),State of Health (%),Sensor Status
2026-01-01 12:00:00,M01,27.57,3.685,85.61,78.07,95.8,OK
```

Header spacing and case are tolerated, and blank or invalid values are handled.
Module IDs and the sample interval are read from the file, not hard-coded.

## Documentation

| Document | Contents |
|---|---|
| [docs/PROJECT_PLAN.md](docs/PROJECT_PLAN.md) | Goals, architecture, features, team roles, timeline, submission checklist |
| [docs/DETECTION_LOGIC.md](docs/DETECTION_LOGIC.md) | Every threshold and detection rule, with justification |
| [docs/DATA_ANALYSIS.md](docs/DATA_ANALYSIS.md) | What the provided datasets contain and the measured normal baseline |
| [documentation/](documentation) | Official competition brief and rubric |

## Repository layout

```
data/            Provided competitor datasets (5 scenarios)
docs/            Project documentation (and the final presentation PDF)
documentation/   Official competition materials
src/core/        Detection engine and shared types (no UI code)
src/ui/          React components and preview pages
tools/           Python scenario generator (synthetic fault datasets)
public/scenarios Built-in scenarios shown in the app (provided + generated)
elijah/          Task brief for a teammate (to be removed before submission)
```
