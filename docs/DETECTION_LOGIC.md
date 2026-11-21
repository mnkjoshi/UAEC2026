# Detection Logic & Threshold Justification

The reference for every threshold and rule the dashboard uses, and why.
All values live in [`src/core/config.ts`](../src/core/config.ts) and can be changed live in the app's **Thresholds** panel.
Nothing is tied to the provided datasets: module IDs, module count, sample interval and voltage level are all read from the data.

## Design principles

1. **Causal.** Every decision uses only current and past samples. Replaying a CSV behaves exactly like a live feed.
2. **Data problems are not battery problems.** A dead sensor is reported as a *data fault* (purple, hatched), never as overheating or under-voltage.
3. **Unknown is not safe.** A module whose sensor drops out is shown as "no data", and any hazard it already had stays active until good data proves otherwise.
4. **Earliest reliable warning.** Relative and rate-based rules catch faults minutes early; absolute limits are the safety backstop.
5. **No false alarms.** Conditions must persist before alerting and recover with margin before clearing. The normal dataset produces zero alerts (enforced by tests).

## Pipeline

```
CSV ─▶ Parser ─▶ Sensor integrity ─▶ Hazard detectors ─▶ Condition tracker ─▶ Diagnosis ─▶ Alert manager ─▶ UI
         │              │             (absolute,           (persistence,         (rules →      (identity,
         ▼              ▼              pack-relative,        hysteresis,           root cause,   escalation,
   Data-quality    Untrusted values    rate of change)      freeze on dropout)    action,       merge, clear)
     report        withheld                                                       forecast)
```

## 1. Ingestion & validation (`parser.ts`)

| Problem | Handling |
|---|---|
| Header variations | Lower-cased, units and punctuation stripped, matched to known names (`temp*`, `volt*`, `*module*`, `stateofcharge`/`soc`, …); column order irrelevant |
| Blank / `NaN` / `null` / `N/A` / `-` | Value = missing (reason recorded); row kept |
| Non-numeric text (`ERR`, `abc`) | Value = corrupted (reason recorded); row kept |
| Unreadable timestamp or blank module ID | Row skipped and counted |
| Duplicate (timestamp, module) | First kept, duplicates counted |
| Out-of-order rows | Sorted by time |
| Irregular spacing / gaps | Rates use real timestamps; gaps > 3× median interval are logged |
| Module absent at a timestamp | Treated as "no data received" for that module |
| Unknown / extra modules, count ≠ 12 | Accepted, displayed, noted in the data-quality report |
| Status column (`OK`, `ok`, `Normal`…) | Case-insensitive; anything not OK-like is a status flag |
| Empty, header-only or unrecognisable file | Clear error message; the previous dataset stays on screen |

## 2. Sensor integrity (`detectors/sensorIntegrity.ts`)

| Check | Rule | Justification |
|---|---|---|
| Missing | Temperature or voltage blank, or module absent | Direct evidence of a dropout |
| Out of range | T outside −40…150 °C; cell V outside 0…5 V; SOC/SOH outside 0…100 %; \|I\| > 2000 A | No working Li-ion sensor can report these |
| Sentinel | −999, −9999, 9999, 99999 | Common logger "no reading" placeholders |
| Stuck | Same temperature for ≥ 6 samples, or same voltage for ≥ 9 | Normal data never repeats a temperature > 2 samples or a voltage > 4 (1 mV resolution): ~2–3× margin |
| Implausible jump | ΔT > 10 °C or ΔV > 0.5 V per sample (scaled by elapsed samples after a gap) | Fastest real change in any provided fault: 1.4 °C and 22 mV per 10 s |
| …accepted if it persists | A jump that holds for 3 samples is accepted as a real level change | A genuine step (e.g. connection failure) must not be ignored forever |
| Status flag | Status not OK while values are present | Sensor self-reports a problem |

Untrusted readings are **withheld from hazard detection and from the pack median**, so one bad sensor cannot distort the rest of the pack.

## 3. Hazard detectors (`detectors/hazards.ts`)

### 3a. Absolute limits (backstop)

Voltage is graded **per cell**. If the file reports module-level voltage (e.g. 44 V), cells in series are inferred as `round(median V / 3.7 V)` and all voltage limits scale automatically.

| Metric | Warning | Critical | Hysteresis | Rationale |
|---|---|---|---|---|
| Temperature | ≥ 45 °C | ≥ 55 °C | 2 °C | Li-ion discharge limit is typically 55–60 °C; degradation accelerates above ~45 °C |
| Cell voltage low | ≤ 3.40 V | ≤ 3.20 V | 30 mV | Approaching NMC discharge cut-off (~3.0 V); deep discharge causes permanent damage |
| Cell voltage high | ≥ 4.15 V | ≥ 4.20 V | 20 mV | NMC charge limit 4.2 V; over-charge causes lithium plating and heating |
| State of charge | ≤ 20 % | ≤ 10 % | 2 % | Time to return to depot |
| State of health | ≤ 80 % | ≤ 70 % | 1 % | 80 % is the standard end-of-life point for traction batteries |

### 3b. Deviation from the pack median (early detection)

Each module is compared with the **median of trusted modules at the same timestamp** (needs ≥ 3). The median is used because one or two faulty modules cannot drag it, and it automatically adapts to ambient temperature and load.

| Metric | Warning | Critical | Normal-data max | Margin |
|---|---|---|---|---|
| Temperature above median | > 5 °C | > 10 °C | 2.33 °C | 2.1× |
| Cell voltage from median (either side) | > 30 mV | > 100 mV | 13 mV | 2.3× |
| Current from median | > max(50 % of median, 20 A) | > max(100 % of median, 40 A) | ~3 A | Series modules carry the same current |

### 3c. Rate of change

Least-squares slope over the last **30 s** (or 3 samples, whichever is longer), using real timestamps; needs ≥ 3 points covering ≥ 60 % of the window.

| Metric | Warning | Critical | Normal-data max | Provided faults |
|---|---|---|---|---|
| Temperature rise | > 2 °C/min | > 4 °C/min | 0.86 °C/min | 5–7.5 °C/min |
| Cell voltage fall | > 0.05 V/min | > 0.10 V/min | 0.016 V/min | 0.11 V/min |

### 3d. Forecast

For a module rising faster than the warning rate, the alert shows when it will reach the critical limit at the current slope
(e.g. *"M07 reaches 55 °C in ~44 s"*); likewise for falling voltage towards 3.2 V.

## 4. False-alarm filter (`conditions.ts`)

| Mechanism | Setting | Purpose |
|---|---|---|
| Persistence to raise | Warning: **3** consecutive samples · Critical: **2** · Sensor fault: **2** | A single noisy sample can never alert |
| Hysteresis | Value must recover past the threshold by the margin in §3a–3c before the condition eases | No flickering at the boundary |
| Persistence to clear | **3** samples (sensor faults: 2) | Recovery must be sustained |
| Escalation | Immediate once confirmed | Worsening problems are never delayed |
| Freeze on dropout | While a value is untrusted, its hazard conditions neither clear nor progress | A heating module that loses its sensor stays alerted |
| Transients | Unconfirmed sensor blips are logged as "Ignored" events | Visible audit trail without alerting |

## 5. Diagnosis (`diagnosis.ts`)

Conditions are grouped by category, then by location in the pack (module order = physical adjacency).

| Pattern | Alert | Severity | Recommended action |
|---|---|---|---|
| One module heating, neighbours normal | Isolated thermal event | Warning / Critical | Reduce load / stop safely and prepare to evacuate |
| Same module heating **and** voltage falling | Suspected internal short circuit | Critical | Stop, evacuate if rising, isolate pack |
| ≥ 2 adjacent modules heating, started together | Multi-module heating (Mxx–Myy) | Warning / Critical | Reduce load, check coolant flow to that section |
| ≥ 2 adjacent modules, one started ≥ 30 s earlier | Thermal propagation from Mxx | Critical | Stop and evacuate; contact emergency services if venting |
| ≥ 75 % of modules heating, or pack median rising > 2 °C/min | Pack-wide temperature rise | Warning / Critical | Reduce demand, check coolant pump, fans, HVAC |
| One module's voltage falling | Module voltage drop | Warning / Critical | Inspect; stop if it keeps falling |
| ≥ 75 % of modules low voltage | Pack voltage low | Warning / Critical | Return to depot / stop to avoid over-discharge |
| Voltage above limit or above pack | Over-voltage / Module voltage above pack | Warning / Critical | Stop charging, limit regen braking |
| SOC low (pack-wide or single module) | Low state of charge / Low charge on Mxx | Warning / Critical | Return to depot / schedule balancing |
| SOH low | Degraded module health | Warning / Critical | Schedule replacement |
| Module current differs from pack | Abnormal module current | Warning / Critical | Inspect module and current sensor |
| T/V missing while current still flows | Sensor dropout | Data fault | Treat as unverified, watch neighbours |
| ≥ 50 % of modules missing at once | Communication loss | Data fault | Pack unmonitored: reduce load, check BMS link |
| Stuck / implausible / status flag | Stuck sensor / Implausible readings / Sensor fault reported | Data fault | Schedule sensor repair |
| Any sensor fault next to an overheating module | (same) | **Warning** | The unmonitored module may be affected too |

**Alert identity:** each new problem is matched to an existing alert of the same category with overlapping modules, so an
alert keeps its ID as it grows (M04 → M04–M06), escalates, eases or is renamed. Alerts that become one are logged as *merged*.

## 6. Severity & colour model

Pack status = the worst module or alert. Severity order: **Normal < Advisory < Data fault < Warning < Critical**.
Data fault ranks above advisory (the module's true state is hidden) but below hazards, so a confirmed hazard is never masked by a dropout.

| Level | Colour | Icon | Meaning |
|---|---|---|---|
| Normal | Green / grey lines | ✓ | Within all limits |
| Advisory | Blue | i | Logged event, no action required |
| Data fault | Purple, hatched tile | ? | Sensor or data problem; state unverified |
| Warning | Amber | ! | Developing problem; act soon |
| Critical | Red, pulsing | ✕ | Immediate action required |

Colour is always paired with an icon and a word (colour-blind safe), and animation respects `prefers-reduced-motion`.

## 7. Validation

Enforced by `npm test` (50 tests) and cross-checked by the independent Python implementation (`python3 tools/validate.py`).

| Scenario | Expected and observed |
|---|---|
| Normal operations | Zero alerts at every timestamp |
| Low voltage | M03 *Module voltage drop*, critical at 12:02:50 (onset 12:02:30) |
| Thermal rise | M07 *Isolated thermal event*, critical at 12:02:20 (onset 12:02:00, at 30.6 °C), with forecast |
| Multiple module heating | One *Multi-module heating (M04–M06)* alert, critical at 12:03:20 (onset 12:03:00) |
| Sensor failure | M11 *Sensor dropout* data fault 12:02:30 → cleared 12:04:10; M03/M06 single dropouts logged as ignored |
| Overvoltage | M09 *Over-voltage*, critical |
| Internal short | M02 *Suspected internal short circuit*, one alert (not separate thermal + voltage) |
| Thermal propagation | *Thermal propagation from M07* covering M06–M08 |
| Whole-pack heating | One *Pack-wide temperature rise* alert |
| Low SOC | *Low state of charge*, pack-level |
| Stuck sensor | M08 *Stuck sensor*, data fault only |
| Sensor spike | No alert; logged as ignored |
| Comms loss | One *Communication loss* alert (not 12) |
| Missing module | M05 *Sensor dropout* while rows are absent |
| Heating with dropout | M04 thermal alert stays active through the dropout |
| Corrupted values / messy format | No hazards; problems listed in the data-quality report |
