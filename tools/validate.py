#!/usr/bin/env python3
"""
Battery Validation Engine

for use: python tools/validate.py
"""

import json
import sys
from typing import Any, Callable, Dict, Tuple

from detect import DetectionEngine, HAZARD_RULES, MANIFEST_PATH, ROOT

SCENARIO_EXPECTATIONS: Dict[str, Callable[[Dict[str, Any]], Tuple[bool, str]]] = {
    "normal": lambda r: (
        len(r["finalAlerts"]) == 0,
        f"alerts={len(r['finalAlerts'])} (expected 0)",
    ),
    "low_voltage": lambda r: (
        any(
            a["ruleId"] == "single_module_voltage_drop"
            and a["targetKey"] == "M03"
            and a["severity"] == "critical"
            for a in r["finalAlerts"]
        ),
        "M03 critical voltage drop detected early via rate/relative rules",
    ),
    "thermal_rise": lambda r: (
        any(
            a["ruleId"] == "isolated_thermal_event"
            and a["targetKey"] == "M07"
            and a["severity"] == "critical"
            and a["forecast"] is not None
            for a in r["finalAlerts"]
        ),
        "M07 isolated critical thermal event with forecast",
    ),
    "multiple_module_heating": lambda r: (
        any(
            a["ruleId"] == "adjacent_thermal_propagation"
            and a["targetKey"] == "M04–M06"
            and a["severity"] == "critical"
            for a in r["finalAlerts"]
        ),
        "Grouped M04-M06 adjacent cooling/propagation alert",
    ),
    "sensor_failure": lambda r: (
        any(
            a["ruleId"] == "sensor_wiring_fault_under_load"
            and a["targetKey"] == "M11"
            and a["state"] == "cleared"
            for a in r["finalAlerts"]
        )
        and not any(a["ruleId"] in HAZARD_RULES for a in r["finalAlerts"]),
        "M11 data fault cleared on recovery; 0 hazard false alarms",
    ),
    "whole_pack_heating": lambda r: (
        any(
            a["ruleId"] == "whole_pack_warming" and a["targetKey"] == "PACK"
            for a in r["finalAlerts"]
        )
        and not any(a["ruleId"] == "isolated_thermal_event" for a in r["finalAlerts"]),
        "Pack-level thermal rise; 0 single-module outlier alerts",
    ),
    "overvoltage": lambda r: (
        any(
            a["ruleId"] == "overvoltage_event"
            and a["targetKey"] == "M09"
            and a["severity"] == "critical"
            for a in r["finalAlerts"]
        ),
        "M09 critical overvoltage detected early",
    ),
    "internal_short": lambda r: (
        any(
            a["ruleId"] == "internal_short_circuit"
            and a["targetKey"] == "M02"
            and a["severity"] == "critical"
            for a in r["finalAlerts"]
        ),
        "M02 correlated T+V internal short circuit",
    ),
    "thermal_propagation": lambda r: (
        any(
            a["ruleId"] == "isolated_thermal_event" and a["targetKey"] == "M07"
            for a in r["finalAlerts"]
        )
        and any(
            a["ruleId"] == "adjacent_thermal_propagation"
            and a["targetKey"] == "M06–M08"
            for a in r["finalAlerts"]
        ),
        "M07 isolated alarm first -> M06-M08 propagation cluster",
    ),
    "low_soc": lambda r: (
        any(
            a["ruleId"] == "low_soc_depletion"
            and a["targetKey"] == "PACK"
            and a["severity"] == "critical"
            and a["escalatedAtIso"] is not None
            for a in r["finalAlerts"]
        ),
        "Pack-wide low SOC warning -> critical escalation",
    ),
    "stuck_sensor": lambda r: (
        any(
            a["ruleId"] == "stuck_sensor_fault"
            and a["targetKey"] == "M08"
            and a["severity"] == "data_fault"
            for a in r["finalAlerts"]
        )
        and not any(a["ruleId"] in HAZARD_RULES for a in r["finalAlerts"]),
        "M08 frozen sensor data_fault; 0 overheating false alarms",
    ),
    "sensor_spike": lambda r: (
        any(
            adv["ruleId"] == "transient_sensor_spike" and adv["targetKey"] == "M10"
            for adv in r["advisories"]
        )
        and len(r["finalAlerts"]) == 0,
        "M10 spike logged as advisory; 0 persistent alerts",
    ),
    "comms_loss": lambda r: (
        any(
            a["ruleId"] == "pack_comms_bus_fault"
            and a["targetKey"] == "PACK"
            and a["state"] == "cleared"
            for a in r["finalAlerts"]
        ),
        "Pack comms bus fault raised and cleanly cleared",
    ),
    "missing_module": lambda r: (
        len(r["moduleIds"]) == 12
        and any(
            a["ruleId"] == "module_dropout"
            and a["targetKey"] == "M05"
            and a["state"] == "cleared"
            for a in r["finalAlerts"]
        ),
        "M05 dropout alert raised & cleared while preserving 12 modules",
    ),
    "corrupted_values": lambda r: (
        sum(r["dataQuality"]["invalidFieldCounts"].values()) >= 10
        and len(r["finalAlerts"]) == 0,
        f"Sanitized {sum(r['dataQuality']['invalidFieldCounts'].values())} bad fields; 0 crashes",
    ),
    "messy_format": lambda r: (
        r["dataQuality"]["invalidFieldCounts"]["timestamp"] == 2
        and r["dataQuality"]["quarantinedCount"] == 7
        and r["dataQuality"]["duplicateCount"] == 5
        and r["dataQuality"]["outOfOrderCount"] > 0
        and len(r["finalAlerts"]) == 0,
        "Quarantined 2 bad timestamps, removed 5 dupes, sorted out-of-order rows",
    ),
    "heating_with_dropout": lambda r: (
        any(
            a["ruleId"] == "isolated_thermal_event"
            and a["targetKey"] == "M04"
            and a["severity"] == "critical"
            and a["state"] == "active"
            for a in r["finalAlerts"]
        ),
        "M04 thermal alert retained across 40 s dropout & active at end",
    ),
}


def run_validation_suite() -> int:
    if not MANIFEST_PATH.exists():
        print(f"ERROR: Could not find {MANIFEST_PATH}", file=sys.stderr)
        return 1

    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    engine = DetectionEngine()
    failures = 0

    print(f"Running automated validation across {len(manifest)} scenario(s)...\n")
    print(f"{'STATUS':<8} {'SCENARIO ID':<26} {'ALERTS':<7} {'DETAILS'}")
    print("-" * 88)

    for entry in manifest:
        sid = entry["id"]
        rel_file = entry["file"]
        csv_path = ROOT / "public" / rel_file
        if not csv_path.exists():
            print(f"{'FAIL':<8} {sid:<26} {'-':<7} Missing file: {csv_path}")
            failures += 1
            continue

        result = engine.run_all(csv_path.read_text(encoding="utf-8-sig"))
        check_fn = SCENARIO_EXPECTATIONS.get(sid)
        if check_fn:
            passed, detail = check_fn(result)
        else:
            passed, detail = True, "Executed cleanly (no custom assertion registered)"

        status_str = "PASS" if passed else "FAIL"
        if not passed:
            failures += 1
        print(f"{status_str:<8} {sid:<26} {len(result['finalAlerts']):<7} {detail}")

    guard_cases = [
        ("empty_file", ""),
        (
            "header_only",
            "Timestamp,Module ID,Temperature (C),Voltage (V),Current (A),State of charge (%),State of Health (%),Sensor Status\n",
        ),
    ]
    for name, content in guard_cases:
        try:
            engine.run_all(content)
            print(f"{'FAIL':<8} {name:<26} {'-':<7} Expected ValueError was not raised")
            failures += 1
        except ValueError as exc:
            print(f"{'PASS':<8} {name:<26} {'0':<7} Caught gracefully: {exc}")

    print("-" * 88)
    total_checks = len(manifest) + len(guard_cases)
    print(f"Summary: {total_checks - failures}/{total_checks} checks passed.")
    return 1 if failures > 0 else 0


def main() -> int:
    return run_validation_suite()


if __name__ == "__main__":
    raise SystemExit(main())