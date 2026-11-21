# Detection Logic & Threshold Justification

This document is the reference for every threshold the dashboard uses and why.
All values live in a single config file (`src/core/config.ts`) and can be changed in the app's settings panel.
Nothing is tied to the specific provided datasets: module IDs, module count and sample interval are all read from the data.

## Design principles

1. **Causal.** Every decision uses only the current and past samples. Replaying a CSV behaves exactly like a live feed.
2. **Data problems are not battery problems.** A dead sensor is reported as a *data* fault with its own colour, never as overheating or under-voltage.
3. **Unknown is not safe.** A module whose sensors have dropped out is shown as "unverified", not as healthy.
4. **Earliest reliable warning.** Relative and rate-based rules catch faults early; absolute limits are the safety backstop.
5. **No false alarms.** Every alert must persist before it is raised, and must recover with margin before it clears. The normal dataset must produce zero alerts.

## Pipeline

```
CSV ─▶ Ingest & validate ─▶ Sensor-integrity checks ─▶ Hazard detectors ─▶ Diagnosis ─▶ Alert manager ─▶ UI
           │                        │                     (absolute,            (rules →        (persistence,
           ▼                        ▼                      pack-relative,        finding +       hysteresis,
     Data-quality report     Per-reading quality flag      rate-of-change)       action)         lifecycle)
```

## 1. Ingestion & validation

| Problem | Handling |
|---|---|
| Header variations | Trim, lowercase, strip units/punctuation, match against known aliases |
| Blank / `NaN` / `null` / non-numeric | Reading stored as missing with a reason code; row kept |
| Unparseable timestamp | Row quarantined and counted in the data-quality report |
| Duplicate (timestamp, module) | Keep the first, count the duplicate |
| Out-of-order rows | Sorted by timestamp before replay |
| Irregular spacing / gaps | Rates use the actual Δt between samples; gaps > 3× the median interval are flagged |
| Module missing at a timestamp | Module marked "no data" for that tick |
| Unknown / extra module IDs, count ≠ 12 | Accepted and displayed; a data-quality warning is shown |
| Empty or header-only file | Clear error message; app does not crash |

## 2. Sensor-integrity checks (data faults)

| Check | Rule | Why |
|---|---|---|
| Missing value | Value blank/invalid, or `Sensor Status` ≠ `OK` | Direct evidence of a dropout |
| Stuck sensor | Temperature identical for ≥ 6 consecutive samples, or voltage identical for ≥ 9 | Normal data never repeats temperature more than 2 samples or voltage more than 4 (1 mV resolution). Thresholds are ~2–3× that. |
| Out of physical range | T < -40 °C or > 150 °C; V < 0 or > 5 V; SOC/SOH outside 0–100 %; \|I\| > 1000 A | Values outside these ranges cannot come from a working Li-ion sensor |
| Impossible jump | ΔT > 10 °C or ΔV > 0.5 V in one sample, **and** it returns within 2 samples | Real thermal events build over many samples (fastest observed: 1.3 °C per 10 s). A spike that snaps back is electrical noise. |

A faulted reading is excluded from hazard detection and from the pack median, so one bad sensor cannot distort the rest of the pack.

## 3. Hazard detectors

### 3a. Absolute safety limits (backstop)

Typical Li-ion (NMC) datasheet operating limits. Cite the specific datasheet used in the presentation.

| Metric | Warning | Critical | Rationale |
|---|---|---|---|
| Temperature | ≥ 45 °C | ≥ 55 °C | Most Li-ion cells are rated for discharge up to ~55–60 °C. Above this, degradation speeds up sharply and thermal runaway risk rises. |
| Voltage (low) | ≤ 3.40 V | ≤ 3.20 V | Approaching the discharge cut-off. Deep discharge causes copper dissolution and permanent damage. |
| Voltage (high) | ≥ 4.15 V | ≥ 4.20 V | NMC charge limit is 4.2 V. Over-charge causes lithium plating and heating. |
| State of charge | ≤ 20 % | ≤ 10 % | Operator needs time to return to depot |
| State of health | ≤ 80 % | ≤ 70 % | 80 % is the standard end-of-life point for traction batteries |
| Current | ≥ 1.5× rolling pack median | ≥ 2× | Relative, since rated current is not given in the data |

### 3b. Pack-relative deviation (early detection)

Each module is compared to the **median of the healthy modules at the same timestamp**. The median is used because one or two faulty modules cannot drag it.

| Metric | Warning | Critical | Normal-data maximum | Margin |
|---|---|---|---|---|
| Temperature above median | > 5 °C | > 10 °C | 2.33 °C | 2.1× |
| Voltage below/above median | > 30 mV | > 100 mV | 13 mV | 2.3× |

This also adapts to ambient conditions: a hot day raises every module together and causes no relative alert.

### 3c. Rate of change

Calculated as the slope over the last 30 s (≥ 3 samples) using actual timestamps.

| Metric | Warning | Critical | Normal-data maximum |
|---|---|---|---|
| Temperature rise | > 2 °C/min | > 4 °C/min | 0.86 °C/min |
| Voltage drop | > 0.05 V/min | > 0.10 V/min | 0.016 V/min |

Observed faults: Thermal Rise ≈ 7.5 °C/min, Multiple Heating ≈ 5 °C/min, Low Voltage ≈ 0.11 V/min. All exceed critical.

### 3d. Forecast: time to limit

A linear fit over the last 30–60 s projects when a rising or falling metric will cross its critical limit,
e.g. *"M07 reaches 55 °C in ~40 s"*. This is shown only while the slope exceeds the warning rate.

## 4. Diagnosis rules

Signals are combined into a plain-language finding and a recommended operator action.

| Pattern | Diagnosis | Recommended action | Severity |
|---|---|---|---|
| One module heating fast, others normal | Isolated thermal event: possible internal short or early thermal runaway | Reduce load, prepare to stop safely, notify maintenance | Critical |
| Two or more **adjacent** modules heating together | Cooling failure or thermal propagation between modules | Reduce load, check coolant flow and fans, stop if rising | Critical |
| Whole pack warming together | High load or high ambient temperature | Reduce demand, check HVAC/cooling | Warning |
| Voltage dropping on one module, current normal | Cell degradation, internal leakage or loose connection | Schedule inspection; stop if it continues | Warning → Critical |
| Voltage dropping **and** temperature rising on the same module | Internal short circuit | Stop safely and evacuate if critical | Critical |
| T/V missing but current still reported | Sensor or wiring-harness fault; module still under load and unmonitored | Watch neighbouring modules; schedule sensor repair | Data fault |
| Value stuck | Frozen sensor | Treat module as unverified; schedule repair | Data fault |
| Single-sample spike that returns | Sensor glitch / electrical noise | Log only | Info |
| Many modules losing data at once | Communication / BMS bus fault | Check BMS link; treat pack as unverified | Data fault (pack) |

## 5. Alert lifecycle and false-alarm control

| Mechanism | Setting | Purpose |
|---|---|---|
| Persistence to raise | Condition true for **2 consecutive samples** (3 for warnings) | Ignores single noisy samples |
| Hysteresis to clear | Value must recover past **80 % of the threshold margin** for 3 samples | Prevents flickering on/off at the boundary |
| States | Raised → Active → Acknowledged → Cleared | Operator acknowledges; history is kept and exportable |
| Escalation | A warning that keeps worsening is upgraded to critical in place | One alert per problem, not a flood |

## 6. Severity & colour model

Pack status is the **worst** module status.

| Level | Colour | Icon | Meaning |
|---|---|---|---|
| Normal | Green | ✓ | Within all limits |
| Advisory | Blue | i | Logged event, no action required |
| Warning | Amber | ⚠ | Developing problem; act soon |
| Critical | Red (pulsing) | ⛔ | Immediate action required |
| Data fault | Purple / grey (hatched) | ? | Sensor or data problem; module state unverified |

Colour is always paired with an icon and a text label, so the dashboard remains readable for colour-blind operators.

## 7. Validation targets

| Dataset | Expected result |
|---|---|
| Normal operations | **Zero** alerts |
| Low Voltage | M03 voltage-deviation warning within ~20 s of onset, escalating to critical |
| Thermal Rise | M07 isolated thermal event, critical, with time-to-limit forecast |
| Multiple Module Heating | M04–M06 grouped as one adjacent-cluster cooling/propagation alert |
| Sensor Failure | M11 data fault for 100 s, then clears; M03/M06 single dropouts logged without hazard alerts |
| Synthetic edge-case CSVs | No crashes; each defect appears in the data-quality report |
