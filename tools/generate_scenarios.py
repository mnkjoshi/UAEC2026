#!/usr/bin/env python3
"""
Generate synthetic battery-telemetry scenarios for the dashboard.

Each scenario starts from the provided "Normal operations" dataset and injects
one fault (or data problem). Output CSVs go to public/scenarios/ and are listed
in public/scenarios/index.json, which the dashboard reads to fill its scenario
picker.

Usage (from the repo root):
    python3 tools/generate_scenarios.py

Standard library only; no installs needed. Works on Python 3.9+.
"""

import csv
import json
import random
import copy
import argparse
from datetime import datetime
from pathlib import Path
from typing import Callable, Dict, List


ROOT = Path(__file__).resolve().parent.parent
BASE_CSV = ROOT / "public" / "scenarios" / "normal.csv"
OUT_DIR = ROOT / "public" / "scenarios"
MANIFEST = OUT_DIR / "index.json"

# Column names exactly as they appear in the provided data.
TS = "Timestamp"
MODULE = "Module ID"
TEMP = "Temperature (C)"
VOLT = "Voltage (V)"
CURRENT = "Current (A)"
SOC = "State of charge (%)"
SOH = "State of Health (%)"
STATUS = "Sensor Status"
COLUMNS = [TS, MODULE, TEMP, VOLT, CURRENT, SOC, SOH, STATUS]

TS_FORMAT = "%Y-%m-%d %H:%M:%S"

Row = Dict[str, str]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def load_base() -> List[Row]:
    """Read the normal dataset as a list of dicts with clean (trimmed) headers."""
    with BASE_CSV.open(newline="") as f:
        reader = csv.DictReader(f)
        return [{k.strip(): v.strip() for k, v in row.items()} for row in reader]


def seconds_since_start(row: Row, start: datetime) -> float:
    """Seconds between this row's timestamp and the first timestamp in the file."""
    return (datetime.strptime(row[TS], TS_FORMAT) - start).total_seconds()


def start_time(rows: List[Row]) -> datetime:
    return min(datetime.strptime(r[TS], TS_FORMAT) for r in rows)


def write_scenario(scenario_id: str, name: str, description: str, expected: str, rows: List[Row]) -> None:
    """Write rows to public/scenarios/<scenario_id>.csv and register it in index.json."""
    path = OUT_DIR / f"{scenario_id}.csv"
    with path.open("w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=COLUMNS, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)

    manifest = json.loads(MANIFEST.read_text())
    manifest = [s for s in manifest if s["id"] != scenario_id]  # replace if it already exists
    manifest.append({
        "id": scenario_id,
        "name": name,
        "file": f"scenarios/{scenario_id}.csv",
        "description": description,
        "expected": expected,
        "source": "generated",
    })
    MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"  wrote {path.relative_to(ROOT)} ({len(rows)} rows)")


# ---------------------------------------------------------------------------
# Scenarios
# Each function takes the normal rows and returns modified rows.
# ---------------------------------------------------------------------------

def whole_pack_heating(rows: List[Row]) -> List[Row]:
    """
    WORKED EXAMPLE: every module heats at 3 °C/min from 12:02:00.
    This is what a cooling-system failure or very hot day looks like.
    Pack-relative checks stay quiet (everything rises together),
    so absolute limits and rate-of-change must catch it.
    """
    start = start_time(rows)
    onset_s = 120           # fault starts 2 minutes in
    rate_c_per_s = 3 / 60   # 3 °C per minute

    for row in rows:
        t = seconds_since_start(row, start)
        if t >= onset_s and row[TEMP]:
            row[TEMP] = f"{float(row[TEMP]) + (t - onset_s) * rate_c_per_s:.2f}"
    return rows


# TODO(Elijah): add the rest of the scenarios from elijah/TASK.md here,
# following the same pattern as whole_pack_heating.

def overvoltage(rows: List[Row]) -> List[Row]:
    """M09 voltage climbs from 3.68 V to 4.25 V starting 12:02:00"""
    
    start = start_time(rows)
    onset_s = 120.0  #12:02:00
    end_s = max(seconds_since_start(r, start) for r in rows)  #12:05:50
    duration_s = max(end_s - onset_s, 1.0)

    onset_v = 3.68
    for row in rows:
        if row[MODULE] == "M09" and seconds_since_start(row, start) == onset_s:
            onset_v = float(row[VOLT])
            break

    target_v = 4.25
    total_rise = target_v - onset_v

    for row in rows:
        if row[MODULE] != "M09":
            continue
        t = seconds_since_start(row, start)
        if t >= onset_s and row[VOLT]:
            progress = min((t - onset_s) / duration_s, 1.0)
            ripple = float(row[VOLT]) - onset_v
            new_v = onset_v + total_rise * progress + ripple * (1.0 - 0.7 * progress)
            row[VOLT] = f"{new_v:.3f}"
    return rows
    
def internal_short(rows: List[Row]) -> List[Row]:
    """M02 voltage drops 0.1 V/min and temperature rises 4 C/min from 12:02:30"""
    
    start = start_time(rows)
    onset_s = 150.0  #12:02:30
    v_drop_per_s = 0.1 / 60.0
    t_rise_per_s = 4.0 / 60.0

    for row in rows:
        if row[MODULE] != "M02":
            continue
        t = seconds_since_start(row, start)
        if t >= onset_s:
            dt = t - onset_s
            if row[VOLT]:
                row[VOLT] = f"{float(row[VOLT]) - v_drop_per_s * dt:.3f}"
            if row[TEMP]:
                row[TEMP] = f"{float(row[TEMP]) + t_rise_per_s * dt:.2f}"
    return rows

def thermal_propagation(rows: List[Row]) -> List[Row]:
    """M07 heats 6 C/min from 12:01:30. After 60 s M06 and M08 heat 3 °C/min"""
    
    start = start_time(rows)
    primary_onset_s = 90.0     #12:01:30
    neighbour_onset_s = 150.0  #12:02:30
    primary_rate = 6.0 / 60.0
    neighbour_rate = 3.0 / 60.0

    for row in rows:
        t = seconds_since_start(row, start)
        mod = row[MODULE]
        if mod == "M07" and t >= primary_onset_s and row[TEMP]:
            row[TEMP] = f"{float(row[TEMP]) + (t - primary_onset_s) * primary_rate:.2f}"
        elif mod in ("M06", "M08") and t >= neighbour_onset_s and row[TEMP]:
            row[TEMP] = f"{float(row[TEMP]) + (t - neighbour_onset_s) * neighbour_rate:.2f}"
    return rows

def low_soc(rows: List[Row]) -> List[Row]:
    """SOC for all modules falls to 8 %"""
    
    start = start_time(rows)
    end_s = max(seconds_since_start(r, start) for r in rows)  #350.0 s

    for row in rows:
        t = seconds_since_start(row, start)
        progress = t / end_s if end_s > 0 else 0.0
        if row[SOC]:
            base_soc = float(row[SOC])
            offset = base_soc - 78.0
            new_soc = 78.0 - (70.0 * progress) + offset * (1.0 - 0.5 * progress)
            row[SOC] = f"{max(new_soc, 7.8):.2f}"
        if row[CURRENT]:
            row[CURRENT] = f"{float(row[CURRENT]) + 135.0 * min(progress * 5.0, 1.0):.2f}"
    return rows

def stuck_sensor(rows: List[Row]) -> List[Row]:
    """M08 temperature freezes at its 12:01:30 value"""
    
    start = start_time(rows)
    freeze_s = 90.0  #12:01:30
    frozen_temp = None

    for row in rows:
        if row[MODULE] != "M08":
            continue
        t = seconds_since_start(row, start)
        if t == freeze_s:
            frozen_temp = row[TEMP]
        elif t > freeze_s and frozen_temp is not None:
            row[TEMP] = frozen_temp
    return rows

def sensor_spike(rows: List[Row]) -> List[Row]:
    """M10 temperature reads 185.00 for only one sample at 12:03:00"""
    
    start = start_time(rows)
    spike_s = 180.0  #12:03:00

    for row in rows:
        if row[MODULE] == "M10" and seconds_since_start(row, start) == spike_s:
            row[TEMP] = "185.00"
    return rows

def comms_loss(rows: List[Row]) -> List[Row]:
    """every module has blank temperature, voltage and status missing from 12:03:00 to 12:03:30"""
    
    start = start_time(rows)
    loss_start_s = 180.0  # 12:03:00
    loss_end_s = 210.0    # 12:03:30

    for row in rows:
        t = seconds_since_start(row, start)
        if loss_start_s <= t <= loss_end_s:
            row[TEMP] = ""
            row[VOLT] = ""
            row[STATUS] = "MISSING"
    return rows

def missing_module(rows: List[Row]) -> List[Row]:
    """all rows for M05 are deleted from 12:02:00 and 12:04:00"""
    
    start = start_time(rows)
    drop_start_s = 120.0  #12:02:00
    drop_end_s = 240.0    #12:04:00

    return [
        row for row in rows
        if not (row[MODULE] == "M05" and drop_start_s <= seconds_since_start(row, start) <= drop_end_s)
    ]

def corrupted_values(rows: List[Row]) -> List[Row]:
    """15 bad values across the file"""
    rng = random.Random(42)
    bad_tokens = [
        "NaN", "null", "N/A", "ERR", "-999", "abc", "",
        "NaN", "null", "N/A", "ERR", "-999", "abc", "", "-999",
    ]
    numeric_cols = [TEMP, VOLT, CURRENT, SOC, SOH]

    chosen_indices = sorted(rng.sample(range(12, len(rows)), len(bad_tokens)))
    for idx, token in zip(chosen_indices, bad_tokens):
        col = rng.choice(numeric_cols)
        rows[idx][col] = token
    return rows

def messy_format(rows: List[Row]) -> List[Row]:
    """rows shuffled"""
    rng = random.Random(99)

    for i, row in enumerate(rows):
        if i % 17 == 0:
            row[STATUS] = rng.choice(["FAULT", "fault"])
        else:
            row[STATUS] = rng.choice(["ok", "Ok", "OK"])

    #5 duplicated rows
    for idx in rng.sample(range(len(rows)), 5):
        rows.append(copy.deepcopy(rows[idx]))

    #2 unparseable timestamps
    bad_ts_indices = rng.sample(range(12, len(rows) - 5), 2)
    rows[bad_ts_indices[0]][TS] = "INVALID_TIMESTAMP"
    rows[bad_ts_indices[1]][TS] = "2026-99-99 25:61:00"

    rng.shuffle(rows)
    return rows

def heating_with_dropout(rows: List[Row]) -> List[Row]:
    """M04 heats 5 C/min from 12:02:00 and no sensor readings for 40 s"""
    
    start = start_time(rows)
    heat_onset_s = 120.0     #12:02:00
    dropout_start_s = 190.0  #12:03:10
    dropout_end_s = 220.0    #12:03:40
    rate_c_per_s = 5.0 / 60.0

    for row in rows:
        if row[MODULE] != "M04":
            continue
        t = seconds_since_start(row, start)
        if t >= heat_onset_s:
            true_temp = float(row[TEMP]) + (t - heat_onset_s) * rate_c_per_s
            if dropout_start_s <= t <= dropout_end_s:
                row[TEMP] = ""
                row[STATUS] = "MISSING"
            else:
                row[TEMP] = f"{true_temp:.2f}"
    return rows
    
# ---------------------------------------------------------------------------
# Registry: add each new scenario here.
# (id, display name, function, one-line description, expected dashboard behaviour)
# ---------------------------------------------------------------------------

SCENARIOS: List[tuple] = [
    (
        "whole_pack_heating",
        "Whole-pack heating",
        whole_pack_heating,
        "All 12 modules heat at 3 °C/min from 12:02:00.",
        "Pack-level warning for rapid temperature rise; no single-module outlier alerts.",
    ),
    (
        "overvoltage",
        "Overvoltage (M09)",
        overvoltage,
        "M09 voltage climbs from ~3.68 V to 4.25 V starting at 12:02:00.",
        "Single-module high-voltage warning (>4.15 V) escalating to critical overvoltage (>=4.20 V) on M09.",
    ),
    (
        "internal_short",
        "Internal short circuit (M02)",
        internal_short,
        "M02 voltage drops ~0.1 V/min and temperature rises ~4 °C/min from 12:02:30.",
        "Correlated voltage sag and rapid heating alert on M02 diagnosing an internal short circuit.",
    ),
    (
        "thermal_propagation",
        "Thermal propagation (M07 -> M06, M08)",
        thermal_propagation,
        "M07 heats ~6 °C/min from 12:01:30; neighbours M06 and M08 heat ~3 °C/min starting 60 s later.",
        "Critical thermal alarm on M07 first, followed by adjacent-module propagation alerts on M06 and M08.",
    ),
    (
        "low_soc",
        "Fast drain / low SOC",
        low_soc,
        "State of charge across all 12 modules falls rapidly from ~78 % to ~8 % by 12:05:50.",
        "Pack-wide low-SOC warning (<20 %) escalating to critical reserve depletion (<10 %) without cell-fault false alarms.",
    ),
    (
        "stuck_sensor",
        "Stuck temperature sensor (M08)",
        stuck_sensor,
        "M08 temperature freezes at its 12:01:30 reading for the remainder of the run.",
        "Sensor-fault warning for frozen/zero-variance telemetry on M08; no false overheating alarm.",
    ),
    (
        "sensor_spike",
        "Single-sample sensor spike (M10)",
        sensor_spike,
        "M10 temperature spikes to 185.00 °C for one sample at 12:03:00, then returns to normal.",
        "Transient sensor glitch flagged on M10 without latching a persistent thermal runaway alarm.",
    ),
    (
        "comms_loss",
        "Pack-wide comms loss",
        comms_loss,
        "All modules have blank temperature/voltage and status MISSING from 12:03:00 to 12:03:30.",
        "No crashes on blank values; pack-wide communications dropout alert during 12:03:00-12:03:30 and clean recovery at 12:03:40.",
    ),
    (
        "missing_module",
        "Missing module rows (M05)",
        missing_module,
        "All rows for M05 are omitted from the CSV between 12:02:00 and 12:04:00.",
        "Missing-module heartbeat warning for M05 without breaking 12-module layout; automatic recovery at 12:04:10.",
    ),
    (
        "corrupted_values",
        "Corrupted / malformed values",
        corrupted_values,
        "15 bad tokens (NaN, null, N/A, ERR, -999, abc, empty) scattered across numeric fields.",
        "Graceful sanitization of non-numeric strings and -999 sentinels with data-quality warnings and zero crashes.",
    ),
    (
        "messy_format",
        "Messy format & out-of-order rows",
        messy_format,
        "Rows shuffled out of order, 5 duplicates, 2 unparseable timestamps, and mixed-case status (ok, Ok, FAULT).",
        "Chronological sorting, duplicate removal, safe skipping of 2 invalid timestamps, and case-insensitive status parsing.",
    ),
    (
        "heating_with_dropout",
        "Heating with sensor dropout (M04)",
        heating_with_dropout,
        "M04 heats ~5 °C/min from 12:02:00 with a 40 s sensor dropout (12:03:10 to 12:03:40) mid-event.",
        "Retains M04 thermal rise state across the 40 s dropout and immediately escalates overheating upon sensor recovery.",
    ),
]

#plot using matplotlib
def plot_scenario(scenario_id: str, name: str, rows: List[Row]) -> None:
    """save a PNG of temperature and voltage per module into docs/figures/"""
    
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    modules = [f"M{i:02d}" for i in range(1, 13)]
    parsed: List[tuple] = []
    for r in rows:
        try:
            parsed.append((datetime.strptime(r[TS], TS_FORMAT), r))
        except (ValueError, KeyError):
            continue
    if not parsed:
        return

    parsed.sort(key=lambda item: (item[0], item[1].get(MODULE, "")))
    t0 = parsed[0][0]

    series = {m: {"t": [], "temp": [], "volt": []} for m in modules}
    for ts_dt, r in parsed:
        mod = r.get(MODULE, "")
        if mod not in series:
            continue
        sec = (ts_dt - t0).total_seconds()
        try:
            temp_val = float(r[TEMP])
            if temp_val <= -100:
                temp_val = float("nan")
        except (ValueError, TypeError):
            temp_val = float("nan")

        try:
            volt_val = float(r[VOLT])
            if volt_val <= -100:
                volt_val = float("nan")
        except (ValueError, TypeError):
            volt_val = float("nan")

        series[mod]["t"].append(sec)
        series[mod]["temp"].append(temp_val)
        series[mod]["volt"].append(volt_val)

    fig, (ax_t, ax_v) = plt.subplots(2, 1, figsize=(11, 6.5), sharex=True)
    for mod in modules:
        ax_t.plot(series[mod]["t"], series[mod]["temp"], label=mod, linewidth=1.3)
        ax_v.plot(series[mod]["t"], series[mod]["volt"], label=mod, linewidth=1.3)

    ax_t.set_title(f"{name} ({scenario_id})", fontsize=12, fontweight="bold")
    ax_t.set_ylabel("Temperature (°C)")
    ax_t.grid(True, alpha=0.3)
    ax_t.legend(ncol=6, fontsize=8, loc="upper left")

    ax_v.set_ylabel("Voltage (V)")
    ax_v.set_xlabel("Seconds since start")
    ax_v.grid(True, alpha=0.3)

    FIGURES_DIR.mkdir(parents=True, exist_ok=True)
    out_png = FIGURES_DIR / f"{scenario_id}.png"
    fig.tight_layout()
    fig.savefig(out_png, dpi=150)
    plt.close(fig)


def main() -> None:
    print(f"Generating {len(SCENARIOS)} scenario(s) from {BASE_CSV.relative_to(ROOT)}")
    for scenario_id, name, fn, description, expected in SCENARIOS:
        rows = fn(load_base())  # fresh copy of the base data each time
        write_scenario(scenario_id, name, description, expected, rows)


if __name__ == "__main__":
    main()
