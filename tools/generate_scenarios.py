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
]


def main() -> None:
    print(f"Generating {len(SCENARIOS)} scenario(s) from {BASE_CSV.relative_to(ROOT)}")
    for scenario_id, name, fn, description, expected in SCENARIOS:
        rows = fn(load_base())  # fresh copy of the base data each time
        write_scenario(scenario_id, name, description, expected, rows)


if __name__ == "__main__":
    main()
