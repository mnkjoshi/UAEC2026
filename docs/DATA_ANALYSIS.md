# Dataset Analysis

What the five provided competitor datasets contain, and what they imply for detection.
All numbers below were measured directly from the CSVs in [`data/`](../data).

## Format

Every file uses the same long format: one row per module per timestamp.

| Column | Type | Notes |
|---|---|---|
| `Timestamp` | `YYYY-MM-DD HH:MM:SS` | 10 s cadence, 36 timestamps (12:00:00 → 12:05:50) |
| `Module ID` | `M01` … `M12` | 12 modules per pack |
| `Temperature (C)` | float | |
| `Voltage (V)` | float, 3 decimals | Cell-level values (~3.68 V) |
| `Current (A)` | float | |
| `State of charge (%)` | float | |
| `State of Health (%)` | float | |
| `Sensor Status` | string | `OK` or `MISSING` in the provided data |

Quirks the parser must tolerate:

- Some files have a trailing space in the header (`Sensor Status `), others do not.
- Missing readings appear as **empty cells**, not `NaN` or `0`.
- Filenames contain irregular spacing; the scenario name must not be inferred from the filename.

## Normal operating baseline

Measured on `Normal operations`. These values set our relative thresholds (see [DETECTION_LOGIC.md](DETECTION_LOGIC.md)).

| Metric | Range | Notes |
|---|---|---|
| Temperature | 26.97 – 31.66 °C | Positional gradient: M01 coolest → M12 warmest |
| Voltage | 3.669 – 3.691 V | |
| Current | 81.07 – 88.95 A | Shared load, all modules move together |
| State of charge | 76.63 – 78.15 % | Slow discharge |
| State of health | 95.20 – 96.05 % | Effectively constant |

| Noise statistic (normal data) | Temperature | Voltage |
|---|---|---|
| Max deviation from pack median at same timestamp | 2.33 °C | 13 mV |
| Max change between consecutive samples (10 s) | 0.27 °C | 6 mV |
| Max rate over a 30 s window | 0.86 °C/min | 16 mV/min |
| Longest run of identical consecutive values | 2 samples | 4 samples |

The last row matters for stuck-sensor detection: voltage is reported to 1 mV, so short runs of
identical values are normal and must not be flagged.

## Anomaly scenarios

| Scenario | Affected module(s) | Onset | Behaviour | End state |
|---|---|---|---|---|
| Low Voltage | **M03** | 12:02:30 | Voltage falls ~20 mV per 10 s (~0.11 V/min); temperature and current stay normal | 3.301 V |
| Thermal Rise | **M07** | 12:02:00 | Temperature climbs ~1.25 °C per 10 s (~7.5 °C/min), linear | 59.88 °C |
| Multiple Module Heating | **M04, M05, M06** (physically adjacent) | 12:03:00 | All three climb together ~0.85 °C per 10 s (~5 °C/min) | ~44–45 °C |
| Sensor Failure | **M11** | 12:02:20 | Temperature **and** voltage blank for 10 consecutive samples (100 s), then recover | Recovered |
| Sensor Failure | **M03**, **M06** | 12:05:10, 12:05:40 | Single-sample dropouts | Recovered |

In the sensor-failure rows, current, SOC and SOH are still reported and `Sensor Status` is `MISSING`.
This means the module is still connected and carrying load; only the T/V sense lines are lost.

## How early can each fault be caught?

First timestamp at which each candidate rule fires (single sample, before persistence filtering):

| Fault | Relative rule | Absolute rule |
|---|---|---|
| M03 low voltage | > 30 mV below median at **12:02:40** (10 s after onset) | < 3.4 V at 12:05:00 |
| M07 thermal rise | > 5 °C above median at **12:02:40** | > 45 °C at 12:04:00; > 55 °C at 12:05:20 |
| M04–M06 heating | > 5 °C above median at **12:04:10** | > 45 °C only at 12:05:50 (M06) |

**Takeaway:** pack-relative and rate-of-change rules find these faults **1.5–2.5 minutes earlier** than
fixed limits. Absolute limits are still needed as a safety backstop (for example, if the whole pack heats
together, the median rises with it and relative rules stay quiet).

## Edge cases the judging dataset may include

The organizers state the judging CSV has "unfamiliar anomaly patterns, missing values and edge cases",
and the rubric names **missing, stuck, and corrupted** sensor data. We plan and test for:

- Blank, `NaN`, `null`, `N/A` or non-numeric values in any numeric column
- Status values other than `OK` / `MISSING` (e.g. `FAULT`, `ERROR`, `STUCK`, lowercase variants)
- Stuck sensors (a value that stops changing)
- Physically impossible values (e.g. `-999`, `500 °C`, negative SOC)
- Single-sample spikes that immediately return (glitch, not real heating)
- Unparseable, duplicated, out-of-order or irregularly spaced timestamps
- Missing modules at a timestamp, extra or unknown module IDs, a module count other than 12
- Header variations (case, spacing, column order, extra columns)
- New fault types: over-voltage, over-current, SOC collapse, SOH drop, whole-pack heating, combined T + V faults
- Empty file / header-only file
