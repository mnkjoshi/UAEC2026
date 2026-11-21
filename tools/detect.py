#!/usr/bin/env python3
"""
Battery Detection Engine

for use: python tools/detect.py public/scenarios/normal.csv [--json]
"""
import argparse
import csv
import json
import math
import re
import statistics
import sys
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

# paths
ROOT = Path(__file__).resolve().parent.parent
SCENARIOS_DIR = ROOT / "public" / "scenarios"
MANIFEST_PATH = SCENARIOS_DIR / "index.json"

# rankings for severity
SEVERITY_ORDER: Dict[str, int] = {
    "normal": 0,
    "advisory": 1,
    "data_fault": 2,
    "warning": 3,
    "critical": 4,
}

# default thresholds and tuning parameters
DEFAULT_CONFIG: Dict[str, Any] = {
    "expected_module_count": 12,
    "ingestion": {
        "max_gap_multiplier": 3.0, # gap variable
    },
    "integrity": {
        "stuck_temp_consecutive_samples": 6, # reptation for frozen variables
        "stuck_volt_consecutive_samples": 9,
        "temp_min_c": -40.0, # physical bounds
        "temp_max_c": 150.0,
        "volt_min_v": 0.0,
        "volt_max_v": 5.0,
        "soc_min_pct": 0.0,
        "soc_max_pct": 100.0,
        "soh_min_pct": 0.0,
        "soh_max_pct": 100.0,
        "current_abs_max_a": 1000.0,
        "impossible_temp_jump_c": 10.0, # step thresholds
        "impossible_volt_jump_v": 0.5,
        "spike_return_window_samples": 2,
    },
    "absolute_limits": {
        "temp_warning_c": 45.0, # warining limit variables
        "temp_critical_c": 55.0,
        "temp_nominal_c": 30.0,
        "volt_low_warning_v": 3.4,
        "volt_low_critical_v": 3.2,
        "volt_high_warning_v": 4.15,
        "volt_high_critical_v": 4.2,
        "volt_nominal_v": 3.68,
        "soc_warning_pct": 20.0,
        "soc_critical_pct": 10.0,
        "soc_nominal_pct": 75.0,
        "soh_warning_pct": 80.0,
        "soh_critical_pct": 70.0,
        "soh_nominal_pct": 95.0,
        "current_warning_multiplier": 1.5, # current limits evaluated as multiples of the rolling pack current median
        "current_critical_multiplier": 2.0,
        "current_rolling_window_seconds": 60.0,
    },
    "relative_limits": {
        "temp_above_median_warning_c": 5.0, # peer-comparison limits against the instantaneous pack median across healthy modules
        "temp_above_median_critical_c": 10.0,
        "volt_deviation_warning_v": 0.03,
        "volt_deviation_critical_v": 0.10,
    },
    "rate_limits": {
        "window_seconds": 30.0, # trailing window and slope limits for rapid thermal rise or voltage sag
        "min_samples": 3,
        "temp_rise_warning_c_per_min": 2.0,
        "temp_rise_critical_c_per_min": 4.0,
        "volt_drop_warning_v_per_min": 0.05,
        "volt_drop_critical_v_per_min": 0.10,
    },
    "forecast": {
        "min_window_seconds": 30.0, # linear extrapolation bounds
        "max_window_seconds": 60.0,
        "max_horizon_seconds": 3600.0,
    },
    "diagnosis": {
        "whole_pack_fraction_threshold": 0.5, # fraction of modules for pack-wide diagnoses
        "pack_comms_loss_fraction_threshold": 0.5,
    },
    "lifecycle": {
        "persistence_warning_samples": 3, # amount of faults required before alert
        "persistence_critical_samples": 2,
        "persistence_data_fault_samples": 2,
        "hysteresis_clear_margin_fraction": 0.8, # hysteresis band and consecutive clean samples required to clear an active alert
        "hysteresis_clear_samples": 3,
    },
}

# normalized CSV column header aliases mapping
HEADER_ALIASES: Dict[str, List[str]] = {
    "timestamp": ["timestamp", "time", "datetime", "date", "ts", "recordedat"],
    "moduleId": ["moduleid", "module", "mod", "cellid", "unitid", "id"],
    "temperatureC": ["temperaturec", "temperature", "tempc", "temp", "moduletemp"],
    "voltageV": ["voltagev", "voltage", "voltv", "volt", "v", "cellvoltage"],
    "currentA": ["currenta", "current", "ampa", "amps", "i", "packcurrent"],
    "socPct": ["stateofcharge", "soc", "charge", "stateofchargepct"],
    "sohPct": ["stateofhealth", "soh", "health", "stateofhealthpct"],
    "sensorStatus": ["sensorstatus", "status", "healthstatus", "state", "sensorstate"],
}

# all "missing" values
MISSING_TOKENS: Set[str] = {
    "",
    "nan",
    "null",
    "n/a",
    "na",
    "none",
    "err",
    "error",
    "undefined",
    "missing",
    "-",
    "--",
}

# physical battery hazard rules
HAZARD_RULES: Set[str] = {
    "isolated_thermal_event",
    "adjacent_thermal_propagation",
    "whole_pack_warming",
    "single_module_voltage_drop",
    "internal_short_circuit",
    "overvoltage_event",
    "low_soc_depletion",
    "low_soh_degradation",
    "overcurrent_event",
}

# maps a narrower rule to broader rules that supersede it
SUPERSEDING_RULES: Dict[str, Set[str]] = {
    "isolated_thermal_event": {
        "adjacent_thermal_propagation",
        "whole_pack_warming",
        "internal_short_circuit",
    },
    "adjacent_thermal_propagation": {
        "whole_pack_warming",
    },
    "single_module_voltage_drop": {
        "internal_short_circuit",
    },
}

# signal codes that must recover before an alert clears
RELEVANT_CODES: Dict[str, List[str]] = {
    "isolated_thermal_event": ["abs_temp_high", "rel_temp_high", "rate_temp_rise"],
    "adjacent_thermal_propagation": ["abs_temp_high", "rel_temp_high", "rate_temp_rise"],
    "whole_pack_warming": ["abs_temp_high", "rel_temp_high", "rate_temp_rise"],
    "single_module_voltage_drop": ["abs_volt_low", "rel_volt_deviation", "rate_volt_drop"],
    "internal_short_circuit": [
        "abs_temp_high",
        "rel_temp_high",
        "rate_temp_rise",
        "abs_volt_low",
        "rel_volt_deviation",
        "rate_volt_drop",
    ],
    "overvoltage_event": ["abs_volt_high", "rel_volt_deviation"],
    "low_soc_depletion": ["abs_soc_low"],
    "low_soh_degradation": ["abs_soh_low"],
    "overcurrent_event": ["rel_current_high"],
}

# functions to parse, clean and sort required data
def normalize_header_key(raw: str) -> str:
    return re.sub(r"[^a-z0-9]", "", raw.lstrip("\ufeff").strip().lower())


def parse_strict_timestamp(raw: str) -> Optional[Tuple[float, str]]:
    trimmed = raw.strip()
    if not trimmed:
        return None
    m = re.match(
        r"^(\d{4})[-/](\d{2})[-/](\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:?\d{2})?$",
        trimmed,
        re.IGNORECASE,
    )
    if not m:
        return None
    year, month, day = int(m.group(1)), int(m.group(2)), int(m.group(3))
    hour, minute, second = int(m.group(4)), int(m.group(5)), int(m.group(6))
    ms_part = int(m.group(7)[:3].ljust(3, "0")) if m.group(7) else 0
    try:
        dt = datetime(
            year, month, day, hour, minute, second, ms_part * 1000, tzinfo=timezone.utc
        )
    except ValueError:
        return None
    canonical = f"{year:04d}-{month:02d}-{day:02d} {hour:02d}:{minute:02d}:{second:02d}"
    return dt.timestamp() * 1000.0, canonical


def parse_numeric(raw: Optional[str]) -> Tuple[Optional[float], bool, Optional[str]]:
    cleaned = (raw or "").strip()
    if cleaned == "":
        return None, False, "blank"
    if cleaned.lower() in MISSING_TOKENS:
        return None, False, "non_numeric"
    try:
        val = float(cleaned)
    except ValueError:
        return None, False, "non_numeric"
    if not math.isfinite(val):
        return None, False, "non_finite"
    return val, True, None


def module_sort_key(mod_id: str) -> Tuple[int, str]:
    m = re.search(r"\d+", mod_id)
    return (int(m.group(0)) if m else 10**9, mod_id)


def worst_severity(levels: List[str]) -> str:
    worst = "normal"
    for lvl in levels:
        if SEVERITY_ORDER[lvl] > SEVERITY_ORDER[worst]:
            worst = lvl
    return worst


def ols_slope_per_min(
    """ project the trajectory until the limits are reached """
    points: List[Tuple[float, float]],
    current_sec: float,
    window_sec: float,
    min_samples: int,
) -> Optional[float]:
    win = [(t, v) for (t, v) in points if current_sec - window_sec <= t <= current_sec]
    if len(win) < min_samples:
        return None
    if (win[-1][0] - win[0][0]) < window_sec * 0.65:
        return None
    xs = [t / 60.0 for (t, _) in win]
    ys = [v for (_, v) in win]
    mx = sum(xs) / len(xs)
    my = sum(ys) / len(ys)
    den = sum((x - mx) ** 2 for x in xs)
    if den <= 0:
        return 0.0
    num = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    return num / den


def build_forecast(
    mod_id: str,
    metric: str,
    cur_val: float,
    slope_per_min: float,
    limit_val: float,
    limit_label: str,
    max_horizon: float,
) -> Optional[Dict[str, Any]]:
    slope_per_sec = slope_per_min / 60.0
    if abs(slope_per_sec) < 1e-9:
        return None
    sec_to_limit = (limit_val - cur_val) / slope_per_sec
    if sec_to_limit <= 0 or sec_to_limit > max_horizon:
        return None
    rounded = round(sec_to_limit)
    t_str = f"~{rounded} s" if rounded < 120 else f"~{rounded / 60.0:.1f} min"
    return {
        "metric": metric,
        "limitValue": limit_val,
        "limitLabel": limit_label,
        "secondsToLimit": rounded,
        "slopePerMinute": round(slope_per_min, 3),
        "summary": f"{mod_id} reaches {limit_label} in {t_str}",
    }


class DetectionEngine:
    """ detection engine that ingests CSV and runs causal fault analysis """
    def __init__(self, config: Optional[Dict[str, Any]] = None) -> None:
        self.config = deepcopy(DEFAULT_CONFIG)
        if config:
            for k, v in config.items():
                if isinstance(v, dict) and isinstance(self.config.get(k), dict):
                    self.config[k].update(v)
                else:
                    self.config[k] = v

    def ingest_csv(self, csv_text: str) -> Dict[str, Any]:
        """ processes the CSV files """
        text = csv_text.lstrip("\ufeff")
        lines = [line for line in text.splitlines() if line.strip()]
        if not lines:
            raise ValueError("CSV file is empty: no headers or telemetry rows found.")

        records = list(csv.reader(lines))
        raw_headers = records[0]
        col_idx: Dict[str, int] = {}
        mapped_aliases = 0

        # match CSV columns to known header aliases
        for idx, h in enumerate(raw_headers):
            norm = normalize_header_key(h)
            for field_name, aliases in HEADER_ALIASES.items():
                if norm in aliases and field_name not in col_idx:
                    col_idx[field_name] = idx
                    if h.strip() != h or norm != aliases[0]:
                        mapped_aliases += 1

        if "timestamp" not in col_idx or "moduleId" not in col_idx:
            raise ValueError(
                f"CSV missing required columns (Timestamp, Module ID). Found: {raw_headers}"
            )
        if len(records) == 1:
            raise ValueError(
                "CSV file contains only a header row and zero telemetry samples."
            )

        invalid_counts = {k: 0 for k in HEADER_ALIASES}
        quarantined: List[Dict[str, Any]] = []
        accepted: List[Dict[str, Any]] = []
        seen_keys: Set[Tuple[float, str]] = set()
        dup_count = 0
        ooo_count = 0
        prev_ms = -float("inf")

        def get_cell(r: List[str], f: str) -> str:
            i = col_idx.get(f)
            return r[i] if (i is not None and i < len(r)) else ""

        # parse and validate individual rows
        for row_num, raw_row in enumerate(records[1:], start=2):
            raw_ts = get_cell(raw_row, "timestamp")
            mod_id = get_cell(raw_row, "moduleId").strip()
            if not mod_id:
                invalid_counts["moduleId"] += 1
                quarantined.append(
                    {
                        "rowIndex": row_num,
                        "rawTimestamp": raw_ts,
                        "moduleId": "",
                        "reason": "missing_module_id",
                    }
                )
                continue

            parsed_ts = parse_strict_timestamp(raw_ts)
            if not parsed_ts:
                invalid_counts["timestamp"] += 1
                quarantined.append(
                    {
                        "rowIndex": row_num,
                        "rawTimestamp": raw_ts,
                        "moduleId": mod_id,
                        "reason": "unparseable_timestamp",
                    }
                )
                continue

            ts_ms, ts_iso = parsed_ts
            key = (ts_ms, mod_id)
            if key in seen_keys:
                dup_count += 1
                quarantined.append(
                    {
                        "rowIndex": row_num,
                        "rawTimestamp": raw_ts,
                        "moduleId": mod_id,
                        "reason": "duplicate_timestamp_module",
                    }
                )
                continue
            seen_keys.add(key)

            # amount of out of order rows 
            if ts_ms < prev_ms:
                ooo_count += 1
            else:
                prev_ms = ts_ms

            t_val, t_ok, _ = parse_numeric(get_cell(raw_row, "temperatureC"))
            v_val, v_ok, _ = parse_numeric(get_cell(raw_row, "voltageV"))
            i_val, i_ok, _ = parse_numeric(get_cell(raw_row, "currentA"))
            soc_val, soc_ok, _ = parse_numeric(get_cell(raw_row, "socPct"))
            soh_val, soh_ok, _ = parse_numeric(get_cell(raw_row, "sohPct"))

            if not t_ok:
                invalid_counts["temperatureC"] += 1
            if not v_ok:
                invalid_counts["voltageV"] += 1
            if not i_ok:
                invalid_counts["currentA"] += 1
            if not soc_ok:
                invalid_counts["socPct"] += 1
            if not soh_ok:
                invalid_counts["sohPct"] += 1

            raw_status = get_cell(raw_row, "sensorStatus").strip()
            status = raw_status or "MISSING"
            status_ok = status.upper() == "OK"
            if not status_ok:
                invalid_counts["sensorStatus"] += 1

            accepted.append(
                {
                    "rowIndex": row_num,
                    "timestampMs": ts_ms,
                    "timestampIso": ts_iso,
                    "moduleId": mod_id,
                    "T": t_val if t_ok else None,
                    "V": v_val if v_ok else None,
                    "I": i_val if i_ok else None,
                    "SOC": soc_val if soc_ok else None,
                    "SOH": soh_val if soh_ok else None,
                    "sensorStatus": status,
                    "sensorStatusOk": status_ok,
                }
            )

        if not accepted:
            raise ValueError("CSV contains no rows with valid timestamps and module IDs.")
        # sort chronologically
        accepted.sort(key=lambda r: (r["timestampMs"], module_sort_key(r["moduleId"])))
        module_ids = sorted({r["moduleId"] for r in accepted}, key=module_sort_key)

        tick_map: Dict[float, Dict[str, Any]] = {}
        for r in accepted:
            entry = tick_map.setdefault(
                r["timestampMs"], {"iso": r["timestampIso"], "rows": {}}
            )
            entry["rows"][r["moduleId"]] = r

        sorted_ts = sorted(tick_map.keys())
        intervals = [
            (sorted_ts[i] - sorted_ts[i - 1]) / 1000.0
            for i in range(1, len(sorted_ts))
        ]
        med_interval = statistics.median(intervals) if intervals else 10.0
        gap_thresh = med_interval * self.config["ingestion"]["max_gap_multiplier"]

        gaps: List[Dict[str, Any]] = []
        ticks: List[Dict[str, Any]] = []
        missing_mod_ticks = 0
        t0 = sorted_ts[0]

        # aligned tick frames to detect sampling gaps or missing data
        for idx, ts_ms in enumerate(sorted_ts):
            entry = tick_map[ts_ms]
            prev_ms = sorted_ts[idx - 1] if idx > 0 else ts_ms
            dt_sec = (ts_ms - prev_ms) / 1000.0 if idx > 0 else 0.0
            is_gap = idx > 0 and dt_sec > gap_thresh
            if is_gap:
                gaps.append(
                    {
                        "from": tick_map[prev_ms]["iso"],
                        "to": entry["iso"],
                        "deltaSeconds": dt_sec,
                    }
                )
            rows_by_mod = {}
            for m in module_ids:
                row_m = entry["rows"].get(m)
                rows_by_mod[m] = row_m
                if row_m is None:
                    missing_mod_ticks += 1
            ticks.append(
                {
                    "tickIndex": idx,
                    "timestampMs": ts_ms,
                    "timestampIso": entry["iso"],
                    "elapsedSeconds": (ts_ms - t0) / 1000.0,
                    "dtSeconds": dt_sec,
                    "isGapTick": is_gap,
                    "rowsByModule": rows_by_mod,
                }
            )

        return {
            "ticks": ticks,
            "moduleIds": module_ids,
            "report": {
                "totalRawRows": len(records) - 1,
                "acceptedRows": len(accepted),
                "quarantinedCount": len(quarantined),
                "duplicateCount": dup_count,
                "outOfOrderCount": ooo_count,
                "mappedAliasCount": mapped_aliases,
                "invalidFieldCounts": invalid_counts,
                "discoveredModuleIds": module_ids,
                "medianIntervalSeconds": med_interval,
                "samplingGaps": gaps,
                "missingModuleTickCount": missing_mod_ticks,
            },
        }

    def run_all(self, csv_text: str) -> Dict[str, Any]:
        """ 
        run the full detection pipeline
        main features: Sensor integrity filtering, Signal extraction, Causal diagnosis and Alert lifecycle state machine
        """
        ingested = self.ingest_csv(csv_text)
        ticks = ingested["ticks"]
        module_ids = ingested["moduleIds"]
        cfg = self.config
        lim_int = cfg["integrity"]
        lim_abs = cfg["absolute_limits"]
        lim_rel = cfg["relative_limits"]
        lim_rate = cfg["rate_limits"]
        lim_fc = cfg["forecast"]
        hyst_frac = cfg["lifecycle"]["hysteresis_clear_margin_fraction"]

        integ_state = {
            m: {
                "last_T": None,
                "last_V": None,
                "prev_T": None,
                "prev_V": None,
                "streak_T": 0,
                "streak_V": 0,
                "spike_T": None,
                "spike_V": None,
            }
            for m in module_ids
        }
        temp_hist: Dict[str, List[Tuple[float, float]]] = {m: [] for m in module_ids}
        volt_hist: Dict[str, List[Tuple[float, float]]] = {m: [] for m in module_ids}
        pack_cur_hist: List[Tuple[float, float]] = []

        conditions: Dict[str, Dict[str, Any]] = {}
        alerts: List[Dict[str, Any]] = []
        alerts_by_id: Dict[str, Dict[str, Any]] = {}
        advisories: List[Dict[str, Any]] = []
        tick_snapshots: List[Dict[str, Any]] = []

        for tick in ticks:
            el_sec = tick["elapsedSeconds"]
            ts_iso = tick["timestampIso"]
            integrity_by_mod: Dict[str, Dict[str, Any]] = {}
            healthy_T, healthy_V, healthy_I, healthy_SOC, healthy_SOH = [], [], [], [], []
            healthy_mod_count = 0

            for m in module_ids:
                row = tick["rowsByModule"].get(m)
                st = integ_state[m]
                faults: List[str] = []

                if row is None:
                    faults.append("missing_row")
                    integrity_by_mod[m] = {
                        "isVerified": False,
                        "isMissingRow": True,
                        "T": None,
                        "V": None,
                        "I": None,
                        "SOC": None,
                        "SOH": None,
                        "faults": faults,
                    }
                    continue

                if not row["sensorStatusOk"]:
                    faults.append("status_not_ok")

                clean_T = None
                if row["T"] is None:
                    faults.append("missing_temperature")
                    st["streak_T"] = 0
                    st["prev_T"] = None
                else:
                    tv = row["T"]
                    in_range_t = lim_int["temp_min_c"] <= tv <= lim_int["temp_max_c"]
                    if not in_range_t:
                        st["streak_T"] = 0
                        st["prev_T"] = None
                    else:
                        st["streak_T"] = (
                            (st["streak_T"] + 1)
                            if (st["prev_T"] is not None and tv == st["prev_T"])
                            else 1
                        )
                        st["prev_T"] = tv

                    stuck_t = in_range_t and (
                        st["streak_T"] >= lim_int["stuck_temp_consecutive_samples"]
                    )
                    if stuck_t:
                        faults.append("stuck_temperature")

                    rej_jump = False
                    if st["spike_T"] is not None:
                        st["spike_T"]["age"] += 1
                        back = (
                            in_range_t
                            and st["last_T"] is not None
                            and abs(tv - st["last_T"]) <= lim_int["impossible_temp_jump_c"]
                        )
                        if (
                            back
                            and st["spike_T"]["age"] <= lim_int["spike_return_window_samples"]
                        ):
                            faults.append("spike_temperature_confirmed")
                            st["spike_T"] = None
                        elif st["spike_T"]["age"] > lim_int["spike_return_window_samples"]:
                            st["spike_T"] = None
                            if not in_range_t:
                                faults.append("out_of_range_temperature")
                        else:
                            rej_jump = True
                            faults.append("spike_temperature_candidate")
                    elif (
                        st["last_T"] is not None
                        and abs(tv - st["last_T"]) > lim_int["impossible_temp_jump_c"]
                    ):
                        st["spike_T"] = {"val": tv, "age": 0}
                        rej_jump = True
                        faults.append("spike_temperature_candidate")
                    elif not in_range_t:
                        faults.append("out_of_range_temperature")

                    if in_range_t and not stuck_t and not rej_jump and row["sensorStatusOk"]:
                        clean_T = tv
                        st["last_T"] = tv

                clean_V = None
                if row["V"] is None:
                    faults.append("missing_voltage")
                    st["streak_V"] = 0
                    st["prev_V"] = None
                else:
                    vv = row["V"]
                    in_range_v = lim_int["volt_min_v"] <= vv <= lim_int["volt_max_v"]
                    if not in_range_v:
                        st["streak_V"] = 0
                        st["prev_V"] = None
                    else:
                        st["streak_V"] = (
                            (st["streak_V"] + 1)
                            if (st["prev_V"] is not None and vv == st["prev_V"])
                            else 1
                        )
                        st["prev_V"] = vv

                    stuck_v = in_range_v and (
                        st["streak_V"] >= lim_int["stuck_volt_consecutive_samples"]
                    )
                    if stuck_v:
                        faults.append("stuck_voltage")

                    rej_jump = False
                    if st["spike_V"] is not None:
                        st["spike_V"]["age"] += 1
                        back = (
                            in_range_v
                            and st["last_V"] is not None
                            and abs(vv - st["last_V"]) <= lim_int["impossible_volt_jump_v"]
                        )
                        if (
                            back
                            and st["spike_V"]["age"] <= lim_int["spike_return_window_samples"]
                        ):
                            faults.append("spike_voltage_confirmed")
                            st["spike_V"] = None
                        elif st["spike_V"]["age"] > lim_int["spike_return_window_samples"]:
                            st["spike_V"] = None
                            if not in_range_v:
                                faults.append("out_of_range_voltage")
                        else:
                            rej_jump = True
                            faults.append("spike_voltage_candidate")
                    elif (
                        st["last_V"] is not None
                        and abs(vv - st["last_V"]) > lim_int["impossible_volt_jump_v"]
                    ):
                        st["spike_V"] = {"val": vv, "age": 0}
                        rej_jump = True
                        faults.append("spike_voltage_candidate")
                    elif not in_range_v:
                        faults.append("out_of_range_voltage")

                    if in_range_v and not stuck_v and not rej_jump and row["sensorStatusOk"]:
                        clean_V = vv
                        st["last_V"] = vv

                clean_I = (
                    row["I"]
                    if (row["I"] is not None and abs(row["I"]) <= lim_int["current_abs_max_a"])
                    else None
                )
                clean_SOC = (
                    row["SOC"]
                    if (
                        row["SOC"] is not None
                        and lim_int["soc_min_pct"] <= row["SOC"] <= lim_int["soc_max_pct"]
                    )
                    else None
                )
                clean_SOH = (
                    row["SOH"]
                    if (
                        row["SOH"] is not None
                        and lim_int["soh_min_pct"] <= row["SOH"] <= lim_int["soh_max_pct"]
                    )
                    else None
                )

                is_verified = (
                    row["sensorStatusOk"] and (clean_T is not None) and (clean_V is not None)
                )
                if is_verified:
                    healthy_mod_count += 1
                if clean_T is not None:
                    healthy_T.append(clean_T)
                    temp_hist[m].append((el_sec, clean_T))
                if clean_V is not None:
                    healthy_V.append(clean_V)
                    volt_hist[m].append((el_sec, clean_V))
                if clean_I is not None:
                    healthy_I.append(clean_I)
                if clean_SOC is not None:
                    healthy_SOC.append(clean_SOC)
                if clean_SOH is not None:
                    healthy_SOH.append(clean_SOH)

                integrity_by_mod[m] = {
                    "isVerified": is_verified,
                    "isMissingRow": False,
                    "T": clean_T,
                    "V": clean_V,
                    "I": clean_I,
                    "SOC": clean_SOC,
                    "SOH": clean_SOH,
                    "faults": faults,
                }

            med_T = statistics.median(healthy_T) if healthy_T else None
            med_V = statistics.median(healthy_V) if healthy_V else None
            med_I = statistics.median(healthy_I) if healthy_I else None
            if med_I is not None:
                pack_cur_hist.append((el_sec, abs(med_I)))
            win_cur = [
                v
                for (t, v) in pack_cur_hist
                if t >= el_sec - lim_abs["current_rolling_window_seconds"]
            ]
            roll_med_I = statistics.median(win_cur) if win_cur else None

            signals_by_mod: Dict[str, List[Dict[str, Any]]] = {m: [] for m in module_ids}
            for m in module_ids:
                integ = integrity_by_mod[m]
                T, V, I, SOC, SOH = (
                    integ["T"],
                    integ["V"],
                    integ["I"],
                    integ["SOC"],
                    integ["SOH"],
                )
                sigs: List[Dict[str, Any]] = []

                slope_T = (
                    ols_slope_per_min(
                        temp_hist[m],
                        el_sec,
                        lim_rate["window_seconds"],
                        lim_rate["min_samples"],
                    )
                    if T is not None
                    else None
                )
                slope_V = (
                    ols_slope_per_min(
                        volt_hist[m],
                        el_sec,
                        lim_rate["window_seconds"],
                        lim_rate["min_samples"],
                    )
                    if V is not None
                    else None
                )
                fc_slope_T = (
                    (
                        ols_slope_per_min(
                            temp_hist[m],
                            el_sec,
                            lim_fc["max_window_seconds"],
                            lim_rate["min_samples"],
                        )
                        or slope_T
                    )
                    if T is not None
                    else None
                )
                fc_slope_V = (
                    (
                        ols_slope_per_min(
                            volt_hist[m],
                            el_sec,
                            lim_fc["max_window_seconds"],
                            lim_rate["min_samples"],
                        )
                        or slope_V
                    )
                    if V is not None
                    else None
                )

                t_fc = (
                    build_forecast(
                        m,
                        "temperatureC",
                        T,
                        fc_slope_T,
                        lim_abs["temp_critical_c"],
                        f"{int(lim_abs['temp_critical_c'])} °C",
                        lim_fc["max_horizon_seconds"],
                    )
                    if (
                        T is not None
                        and fc_slope_T is not None
                        and fc_slope_T > lim_rate["temp_rise_warning_c_per_min"]
                        and T < lim_abs["temp_critical_c"]
                    )
                    else None
                )
                v_fc = (
                    build_forecast(
                        m,
                        "voltageV",
                        V,
                        fc_slope_V,
                        lim_abs["volt_low_critical_v"],
                        f"{lim_abs['volt_low_critical_v']:.2f} V",
                        lim_fc["max_horizon_seconds"],
                    )
                    if (
                        V is not None
                        and fc_slope_V is not None
                        and -fc_slope_V > lim_rate["volt_drop_warning_v_per_min"]
                        and V > lim_abs["volt_low_critical_v"]
                    )
                    else None
                )

                if T is not None:
                    clear_t = lim_abs["temp_warning_c"] - hyst_frac * (
                        lim_abs["temp_warning_c"] - lim_abs["temp_nominal_c"]
                    )
                    if T >= lim_abs["temp_warning_c"]:
                        sigs.append(
                            {
                                "code": "abs_temp_high",
                                "severity": (
                                    "critical" if T >= lim_abs["temp_critical_c"] else "warning"
                                ),
                                "recovered": False,
                                "forecast": t_fc,
                            }
                        )
                    elif T <= clear_t:
                        sigs.append(
                            {"code": "abs_temp_high", "severity": "warning", "recovered": True}
                        )

                if V is not None:
                    clear_vl = lim_abs["volt_low_warning_v"] + hyst_frac * (
                        lim_abs["volt_nominal_v"] - lim_abs["volt_low_warning_v"]
                    )
                    if V <= lim_abs["volt_low_warning_v"]:
                        sigs.append(
                            {
                                "code": "abs_volt_low",
                                "severity": (
                                    "critical" if V <= lim_abs["volt_low_critical_v"] else "warning"
                                ),
                                "recovered": False,
                                "forecast": v_fc,
                            }
                        )
                    elif V >= clear_vl:
                        sigs.append(
                            {"code": "abs_volt_low", "severity": "warning", "recovered": True}
                        )

                    clear_vh = lim_abs["volt_high_warning_v"] - hyst_frac * (
                        lim_abs["volt_high_warning_v"] - lim_abs["volt_nominal_v"]
                    )
                    if V >= lim_abs["volt_high_warning_v"]:
                        sigs.append(
                            {
                                "code": "abs_volt_high",
                                "severity": (
                                    "critical"
                                    if V >= lim_abs["volt_high_critical_v"]
                                    else "warning"
                                ),
                                "recovered": False,
                            }
                        )
                    elif V <= clear_vh:
                        sigs.append(
                            {"code": "abs_volt_high", "severity": "warning", "recovered": True}
                        )

                if SOC is not None:
                    clear_soc = lim_abs["soc_warning_pct"] + hyst_frac * (
                        lim_abs["soc_nominal_pct"] - lim_abs["soc_warning_pct"]
                    )
                    if SOC <= lim_abs["soc_warning_pct"]:
                        sigs.append(
                            {
                                "code": "abs_soc_low",
                                "severity": (
                                    "critical" if SOC <= lim_abs["soc_critical_pct"] else "warning"
                                ),
                                "recovered": False,
                            }
                        )
                    elif SOC >= clear_soc:
                        sigs.append(
                            {"code": "abs_soc_low", "severity": "warning", "recovered": True}
                        )

                if SOH is not None:
                    clear_soh = lim_abs["soh_warning_pct"] + hyst_frac * (
                        lim_abs["soh_nominal_pct"] - lim_abs["soh_warning_pct"]
                    )
                    if SOH <= lim_abs["soh_warning_pct"]:
                        sigs.append(
                            {
                                "code": "abs_soh_low",
                                "severity": (
                                    "critical" if SOH <= lim_abs["soh_critical_pct"] else "warning"
                                ),
                                "recovered": False,
                            }
                        )
                    elif SOH >= clear_soh:
                        sigs.append(
                            {"code": "abs_soh_low", "severity": "warning", "recovered": True}
                        )

                if I is not None and roll_med_I is not None and roll_med_I > 1e-3:
                    ratio = abs(I) / roll_med_I
                    clear_r = lim_abs["current_warning_multiplier"] - hyst_frac * (
                        lim_abs["current_warning_multiplier"] - 1.0
                    )
                    if ratio >= lim_abs["current_warning_multiplier"]:
                        sigs.append(
                            {
                                "code": "rel_current_high",
                                "severity": (
                                    "critical"
                                    if ratio >= lim_abs["current_critical_multiplier"]
                                    else "warning"
                                ),
                                "recovered": False,
                            }
                        )
                    elif ratio <= clear_r:
                        sigs.append(
                            {"code": "rel_current_high", "severity": "warning", "recovered": True}
                        )

                if T is not None and med_T is not None:
                    dt_med = T - med_T
                    clear_dt = lim_rel["temp_above_median_warning_c"] * (1.0 - hyst_frac)
                    if dt_med > lim_rel["temp_above_median_warning_c"]:
                        sigs.append(
                            {
                                "code": "rel_temp_high",
                                "severity": (
                                    "critical"
                                    if dt_med > lim_rel["temp_above_median_critical_c"]
                                    else "warning"
                                ),
                                "recovered": False,
                                "forecast": t_fc,
                            }
                        )
                    elif dt_med <= clear_dt:
                        sigs.append(
                            {"code": "rel_temp_high", "severity": "warning", "recovered": True}
                        )

                if V is not None and med_V is not None:
                    dv_med = V - med_V
                    abs_dv = abs(dv_med)
                    clear_dv = lim_rel["volt_deviation_warning_v"] * (1.0 - hyst_frac)
                    if abs_dv > lim_rel["volt_deviation_warning_v"]:
                        sigs.append(
                            {
                                "code": "rel_volt_deviation",
                                "dir": "below" if dv_med < 0 else "above",
                                "severity": (
                                    "critical"
                                    if abs_dv > lim_rel["volt_deviation_critical_v"]
                                    else "warning"
                                ),
                                "recovered": False,
                                "forecast": v_fc if dv_med < 0 else None,
                            }
                        )
                    elif abs_dv <= clear_dv:
                        sigs.append(
                            {"code": "rel_volt_deviation", "severity": "warning", "recovered": True}
                        )

                if slope_T is not None:
                    clear_st = lim_rate["temp_rise_warning_c_per_min"] * (1.0 - hyst_frac)
                    if slope_T > lim_rate["temp_rise_warning_c_per_min"]:
                        sigs.append(
                            {
                                "code": "rate_temp_rise",
                                "severity": (
                                    "critical"
                                    if slope_T > lim_rate["temp_rise_critical_c_per_min"]
                                    else "warning"
                                ),
                                "recovered": False,
                                "forecast": t_fc,
                            }
                        )
                    elif slope_T <= clear_st:
                        sigs.append(
                            {"code": "rate_temp_rise", "severity": "warning", "recovered": True}
                        )

                if slope_V is not None:
                    drop_v = -slope_V
                    clear_sv = lim_rate["volt_drop_warning_v_per_min"] * (1.0 - hyst_frac)
                    if drop_v > lim_rate["volt_drop_warning_v_per_min"]:
                        sigs.append(
                            {
                                "code": "rate_volt_drop",
                                "severity": (
                                    "critical"
                                    if drop_v > lim_rate["volt_drop_critical_v_per_min"]
                                    else "warning"
                                ),
                                "recovered": False,
                                "forecast": v_fc,
                            }
                        )
                    elif drop_v <= clear_sv:
                        sigs.append(
                            {"code": "rate_volt_drop", "severity": "warning", "recovered": True}
                        )

                signals_by_mod[m] = sigs

            findings: List[Dict[str, Any]] = []
            data_loss_mods: List[str] = []

            for m in module_ids:
                integ = integrity_by_mod[m]
                if integ["isMissingRow"]:
                    data_loss_mods.append(m)
                    continue
                fcodes = set(integ["faults"])
                if "spike_temperature_confirmed" in fcodes or "spike_voltage_confirmed" in fcodes:
                    findings.append(
                        {
                            "ruleId": "transient_sensor_spike",
                            "targetKey": m,
                            "modules": [m],
                            "severity": "advisory",
                            "title": f"Sensor glitch ({m})",
                        }
                    )
                if "stuck_temperature" in fcodes or "stuck_voltage" in fcodes:
                    findings.append(
                        {
                            "ruleId": "stuck_sensor_fault",
                            "targetKey": m,
                            "modules": [m],
                            "severity": "data_fault",
                            "title": f"Frozen sensor ({m})",
                        }
                    )
                if fcodes & {
                    "status_not_ok",
                    "missing_temperature",
                    "missing_voltage",
                    "out_of_range_temperature",
                    "out_of_range_voltage",
                }:
                    data_loss_mods.append(m)

            if len(data_loss_mods) >= 2 and (
                len(data_loss_mods) / max(len(module_ids), 1)
            ) >= cfg["diagnosis"]["pack_comms_loss_fraction_threshold"]:
                findings.append(
                    {
                        "ruleId": "pack_comms_bus_fault",
                        "targetKey": "PACK",
                        "modules": data_loss_mods,
                        "severity": "data_fault",
                        "title": "Communication / BMS bus fault",
                    }
                )
            else:
                for m in data_loss_mods:
                    integ = integrity_by_mod[m]
                    if integ["isMissingRow"]:
                        findings.append(
                            {
                                "ruleId": "module_dropout",
                                "targetKey": m,
                                "modules": [m],
                                "severity": "data_fault",
                                "title": f"Missing module telemetry ({m})",
                            }
                        )
                    else:
                        findings.append(
                            {
                                "ruleId": "sensor_wiring_fault_under_load",
                                "targetKey": m,
                                "modules": [m],
                                "severity": "data_fault",
                                "title": f"Sensor / wiring fault ({m})",
                            }
                        )

            heat_mods, vdrop_mods, overv_mods, lowsoc_mods, lowsoh_mods, overcur_mods = (
                [],
                [],
                [],
                [],
                [],
                [],
            )
            for m in module_ids:
                act = [s for s in signals_by_mod[m] if not s["recovered"]]
                if not act:
                    continue
                if any(
                    s["code"] in {"abs_temp_high", "rel_temp_high", "rate_temp_rise"}
                    for s in act
                ):
                    heat_mods.append(m)
                if any(
                    s["code"] in {"abs_volt_low", "rate_volt_drop"}
                    or (s["code"] == "rel_volt_deviation" and s.get("dir") == "below")
                    for s in act
                ):
                    vdrop_mods.append(m)
                if any(
                    s["code"] == "abs_volt_high"
                    or (s["code"] == "rel_volt_deviation" and s.get("dir") == "above")
                    for s in act
                ):
                    overv_mods.append(m)
                if any(s["code"] == "abs_soc_low" for s in act):
                    lowsoc_mods.append(m)
                if any(s["code"] == "abs_soh_low" for s in act):
                    lowsoh_mods.append(m)
                if any(s["code"] == "rel_current_high" for s in act):
                    overcur_mods.append(m)

            ishort_mods = set(heat_mods) & set(vdrop_mods)
            for m in sorted(ishort_mods, key=module_sort_key):
                act = [s for s in signals_by_mod[m] if not s["recovered"]]
                fc = next((s.get("forecast") for s in act if s.get("forecast")), None)
                findings.append(
                    {
                        "ruleId": "internal_short_circuit",
                        "targetKey": m,
                        "modules": [m],
                        "severity": "critical",
                        "title": f"Internal short circuit ({m})",
                        "forecast": fc,
                    }
                )

            pure_heat = [m for m in heat_mods if m not in ishort_mods]
            h_count = max(healthy_mod_count, 1)
            if (
                len(pure_heat) >= 3
                and (len(pure_heat) / h_count)
                >= cfg["diagnosis"]["whole_pack_fraction_threshold"]
            ):
                hsigs = [
                    s
                    for m in pure_heat
                    for s in signals_by_mod[m]
                    if not s["recovered"]
                    and s["code"] in {"abs_temp_high", "rel_temp_high", "rate_temp_rise"}
                ]
                sev = worst_severity([s["severity"] for s in hsigs])
                findings.append(
                    {
                        "ruleId": "whole_pack_warming",
                        "targetKey": "PACK",
                        "modules": pure_heat,
                        "severity": "critical" if sev == "critical" else "warning",
                        "title": "Whole-pack thermal rise",
                    }
                )
            elif pure_heat:
                sorted_h = sorted(pure_heat, key=module_sort_key)
                clusters: List[List[str]] = [[sorted_h[0]]]
                for m in sorted_h[1:]:
                    if module_sort_key(m)[0] - module_sort_key(clusters[-1][-1])[0] == 1:
                        clusters[-1].append(m)
                    else:
                        clusters.append([m])
                for cl in clusters:
                    hsigs = [
                        s
                        for m in cl
                        for s in signals_by_mod[m]
                        if not s["recovered"]
                        and s["code"] in {"abs_temp_high", "rel_temp_high", "rate_temp_rise"}
                    ]
                    fcs = [s["forecast"] for s in hsigs if s.get("forecast")]
                    fcs.sort(key=lambda f: f["secondsToLimit"])
                    fc = fcs[0] if fcs else None
                    if len(cl) >= 2:
                        lbl = f"{cl[0]}–{cl[-1]}"
                        findings.append(
                            {
                                "ruleId": "adjacent_thermal_propagation",
                                "targetKey": lbl,
                                "modules": cl,
                                "severity": "critical",
                                "title": f"Cooling failure / thermal propagation ({lbl})",
                                "forecast": fc,
                            }
                        )
                    else:
                        findings.append(
                            {
                                "ruleId": "isolated_thermal_event",
                                "targetKey": cl[0],
                                "modules": cl,
                                "severity": "critical",
                                "title": f"Isolated thermal event ({cl[0]})",
                                "forecast": fc,
                            }
                        )

            for m in [x for x in vdrop_mods if x not in ishort_mods]:
                vsigs = [
                    s
                    for s in signals_by_mod[m]
                    if not s["recovered"]
                    and s["code"] in {"abs_volt_low", "rel_volt_deviation", "rate_volt_drop"}
                ]
                sev = worst_severity([s["severity"] for s in vsigs])
                fc = next((s.get("forecast") for s in vsigs if s.get("forecast")), None)
                findings.append(
                    {
                        "ruleId": "single_module_voltage_drop",
                        "targetKey": m,
                        "modules": [m],
                        "severity": sev,
                        "title": f"Abnormal voltage drop ({m})",
                        "forecast": fc,
                    }
                )

            for m in overv_mods:
                ovsigs = [
                    s
                    for s in signals_by_mod[m]
                    if not s["recovered"]
                    and s["code"] in {"abs_volt_high", "rel_volt_deviation"}
                ]
                sev = worst_severity([s["severity"] for s in ovsigs])
                findings.append(
                    {
                        "ruleId": "overvoltage_event",
                        "targetKey": m,
                        "modules": [m],
                        "severity": sev,
                        "title": f"Module overvoltage ({m})",
                    }
                )

            if lowsoc_mods:
                ssigs = [
                    s
                    for m in lowsoc_mods
                    for s in signals_by_mod[m]
                    if not s["recovered"] and s["code"] == "abs_soc_low"
                ]
                sev = worst_severity([s["severity"] for s in ssigs])
                findings.append(
                    {
                        "ruleId": "low_soc_depletion",
                        "targetKey": (
                            "PACK" if len(lowsoc_mods) >= 3 else ",".join(lowsoc_mods)
                        ),
                        "modules": lowsoc_mods,
                        "severity": sev,
                        "title": "Low battery SOC",
                    }
                )

            if lowsoh_mods:
                ssigs = [
                    s
                    for m in lowsoh_mods
                    for s in signals_by_mod[m]
                    if not s["recovered"] and s["code"] == "abs_soh_low"
                ]
                sev = worst_severity([s["severity"] for s in ssigs])
                findings.append(
                    {
                        "ruleId": "low_soh_degradation",
                        "targetKey": (
                            "PACK" if len(lowsoh_mods) >= 3 else ",".join(lowsoh_mods)
                        ),
                        "modules": lowsoh_mods,
                        "severity": sev,
                        "title": "Low battery SOH",
                    }
                )

            if overcur_mods:
                csigs = [
                    s
                    for m in overcur_mods
                    for s in signals_by_mod[m]
                    if not s["recovered"] and s["code"] == "rel_current_high"
                ]
                sev = worst_severity([s["severity"] for s in csigs])
                findings.append(
                    {
                        "ruleId": "overcurrent_event",
                        "targetKey": (
                            "PACK" if len(overcur_mods) >= 3 else ",".join(overcur_mods)
                        ),
                        "modules": overcur_mods,
                        "severity": sev,
                        "title": "High pack current",
                    }
                )

            present_keys: Set[str] = set()
            for a in alerts:
                if a["state"] == "raised":
                    a["state"] = "active"

            for f in findings:
                for ckey in list(conditions.keys()):
                    ex_rule = ckey.split("::")[0]
                    if f["ruleId"] not in SUPERSEDING_RULES.get(ex_rule, set()):
                        continue
                    cond = conditions[ckey]
                    ex_alert = (
                        alerts_by_id.get(cond["alertId"]) if cond["alertId"] else None
                    )
                    ex_mods = (
                        ex_alert["affectedModules"]
                        if ex_alert
                        else cond.get("modules", [])
                    )
                    if ex_mods and all(m in f["modules"] for m in ex_mods):
                        if ex_alert and ex_alert["state"] != "cleared":
                            ex_alert["state"] = "cleared"
                            ex_alert["clearedAtIso"] = ts_iso
                            ex_alert["supersededBy"] = f["ruleId"]
                        del conditions[ckey]

            for f in findings:
                key = f"{f['ruleId']}::{f['targetKey']}"
                present_keys.add(key)
                if f["severity"] == "advisory":
                    advisories.append(
                        {
                            "timestampIso": ts_iso,
                            "ruleId": f["ruleId"],
                            "targetKey": f["targetKey"],
                            "title": f["title"],
                        }
                    )
                    continue

                cond = conditions.setdefault(
                    key,
                    {
                        "trigger": 0,
                        "recovery": 0,
                        "alertId": None,
                        "modules": list(f["modules"]),
                    },
                )
                cond["modules"] = list(f["modules"])
                cond["trigger"] += 1
                cond["recovery"] = 0
                req = (
                    cfg["lifecycle"]["persistence_data_fault_samples"]
                    if f["severity"] == "data_fault"
                    else (
                        cfg["lifecycle"]["persistence_critical_samples"]
                        if f["severity"] == "critical"
                        else cfg["lifecycle"]["persistence_warning_samples"]
                    )
                )

                if cond["alertId"] and cond["alertId"] in alerts_by_id:
                    ex = alerts_by_id[cond["alertId"]]
                    if ex["state"] != "cleared":
                        ex["updatedAtIso"] = ts_iso
                        ex["heldDuringDropout"] = False
                        if f.get("forecast"):
                            ex["forecast"] = f["forecast"]
                        if SEVERITY_ORDER[f["severity"]] > SEVERITY_ORDER[ex["severity"]]:
                            ex["severity"] = f["severity"]
                            ex["title"] = f["title"]
                            ex["escalatedAtIso"] = ts_iso
                        continue

                if cond["trigger"] >= req:
                    aid = f"ALT-{len(alerts) + 1:04d}"
                    new_alert = {
                        "id": aid,
                        "key": key,
                        "ruleId": f["ruleId"],
                        "targetKey": f["targetKey"],
                        "affectedModules": list(f["modules"]),
                        "severity": f["severity"],
                        "state": "raised",
                        "title": f["title"],
                        "raisedAtIso": ts_iso,
                        "updatedAtIso": ts_iso,
                        "clearedAtIso": None,
                        "escalatedAtIso": None,
                        "supersededBy": None,
                        "heldDuringDropout": False,
                        "forecast": f.get("forecast"),
                    }
                    alerts.append(new_alert)
                    alerts_by_id[aid] = new_alert
                    cond["alertId"] = aid

            for key in list(conditions.keys()):
                if key in present_keys:
                    continue
                cond = conditions[key]
                rule_id = key.split("::")[0]
                ex = alerts_by_id.get(cond["alertId"]) if cond["alertId"] else None
                aff_mods = ex["affectedModules"] if ex else cond.get("modules", [])

                if (
                    rule_id in HAZARD_RULES
                    and aff_mods
                    and all(not integrity_by_mod[m]["isVerified"] for m in aff_mods)
                ):
                    if ex and ex["state"] != "cleared":
                        ex["heldDuringDropout"] = True
                        ex["updatedAtIso"] = ts_iso
                    continue

                if rule_id not in HAZARD_RULES:
                    recovered = True
                else:
                    recovered = True
                    for m in aff_mods:
                        for code in RELEVANT_CODES.get(rule_id, []):
                            sig = next(
                                (s for s in signals_by_mod[m] if s["code"] == code),
                                None,
                            )
                            if not sig or not sig["recovered"]:
                                recovered = False
                                break

                if recovered:
                    cond["recovery"] += 1
                    if ex and ex["state"] != "cleared":
                        ex["heldDuringDropout"] = False
                        ex["updatedAtIso"] = ts_iso
                        if cond["recovery"] >= cfg["lifecycle"]["hysteresis_clear_samples"]:
                            ex["state"] = "cleared"
                            ex["clearedAtIso"] = ts_iso
                            del conditions[key]
                    elif cond["recovery"] >= cfg["lifecycle"]["hysteresis_clear_samples"]:
                        del conditions[key]
                else:
                    cond["recovery"] = 0
                    if ex and ex["state"] != "cleared":
                        ex["heldDuringDropout"] = False
                        ex["updatedAtIso"] = ts_iso

            tick_snapshots.append(
                {
                    "timestampIso": ts_iso,
                    "activeAlerts": [deepcopy(a) for a in alerts if a["state"] != "cleared"],
                    "findings": findings,
                }
            )

        return {
            "dataQuality": ingested["report"],
            "moduleIds": module_ids,
            "ticks": tick_snapshots,
            "finalAlerts": alerts,
            "advisories": advisories,
        }


def inspect_single_csv(csv_path: Path, as_json: bool = False) -> int:
    if not csv_path.exists():
        print(f"ERROR: File not found: {csv_path}", file=sys.stderr)
        return 1

    engine = DetectionEngine()
    result = engine.run_all(csv_path.read_text(encoding="utf-8-sig"))

    if as_json:
        output = {
            "file": str(csv_path),
            "dataQuality": result["dataQuality"],
            "finalAlerts": result["finalAlerts"],
            "advisories": result["advisories"],
        }
        print(json.dumps(output, indent=2))
        return 0

    dq = result["dataQuality"]
    print(f"=== Detection Report: {csv_path.name} ===")
    print(
        f"Rows: {dq['acceptedRows']}/{dq['totalRawRows']} accepted | "
        f"Quarantined: {dq['quarantinedCount']} | Duplicates: {dq['duplicateCount']} | "
        f"Out-of-order: {dq['outOfOrderCount']} | Gaps: {len(dq['samplingGaps'])}"
    )
    print(
        f"Modules ({len(result['moduleIds'])}): {', '.join(result['moduleIds'])} | "
        f"Median cadence: {dq['medianIntervalSeconds']} s"
    )
    print(f"\nAlerts ({len(result['finalAlerts'])}):")
    if not result["finalAlerts"]:
        print("  None (pack healthy)")
    for a in result["finalAlerts"]:
        fc_txt = f" | Forecast: {a['forecast']['summary']}" if a.get("forecast") else ""
        clr_txt = f" -> cleared {a['clearedAtIso']}" if a.get("clearedAtIso") else ""
        print(
            f"  [{a['id']}] {a['severity'].upper():<10} {a['title']} "
            f"(raised {a['raisedAtIso']}{clr_txt}, state={a['state']}){fc_txt}"
        )

    if result["advisories"]:
        print(f"\nAdvisories ({len(result['advisories'])}):")
        for adv in result["advisories"]:
            print(f"  - {adv['timestampIso']}: {adv['title']}")

    return 0


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Inspect a battery telemetry CSV file using the causal BMS detection engine."
    )
    parser.add_argument(
        "csv_file",
        type=Path,
        help="Path to the telemetry CSV file to inspect.",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Output inspection results as formatted JSON.",
    )
    args = parser.parse_args()
    return inspect_single_csv(args.csv_file, as_json=args.json)


if __name__ == "__main__":
    raise SystemExit(main())
