# Elijah's task: Scenario generator (Python)

## Why this matters

On Sunday the judges hand us a CSV we've never seen, with "unfamiliar anomaly patterns, missing values and edge cases".
If the dashboard crashes or raises false alarms on it, we lose points (Reliability ×2, Completeness ×4).

You'll write a Python script that **creates new fault scenarios** for us to test against.
Each scenario becomes a CSV that shows up in the dashboard's **scenario picker**, so the team can replay it
live, and we can show them in the demo ("here's how it handles a stuck sensor, a comms loss, a short circuit…").

No web code needed. Python standard library only.

## Setup

```bash
git pull
python3 tools/generate_scenarios.py
```

That already works: it generates one example (`whole_pack_heating`) into `public/scenarios/`
and registers it in `public/scenarios/index.json`.

## Files

| File | What it is |
|---|---|
| `tools/generate_scenarios.py` | **Your file.** Has helpers and one worked example (`whole_pack_heating`). Add your scenarios here. |
| `public/scenarios/normal.csv` | The base data every scenario starts from (12 modules, 10 s steps, 12:00:00 → 12:05:50) |
| `public/scenarios/index.json` | List of scenarios the app shows. Your script updates it automatically; don't edit by hand. |
| `docs/DATA_ANALYSIS.md` | What normal data looks like and how the provided faults behave. **Read this first** (5 min). |

## How to add a scenario

1. Write a function `def my_scenario(rows) -> rows` that changes the rows (see `whole_pack_heating`).
2. Add it to the `SCENARIOS` list with an id, display name, description, and **what the dashboard should do**.
3. Run the script and open the CSV to check it looks right.

Each `row` is a dict with keys `"Timestamp"`, `"Module ID"`, `"Temperature (C)"`, `"Voltage (V)"`,
`"Current (A)"`, `"State of charge (%)"`, `"State of Health (%)"`, `"Sensor Status"`. All values are strings.

**Make faults realistic:** real faults build up gradually from an onset time. Use the helpers
`start_time()` / `seconds_since_start()` like the example does.

## Scenarios to build

Do them in this order; the first group matters most.

### Battery hazards

- [ ] **`overvoltage`**: M09 voltage climbs from ~3.68 V to 4.25 V starting 12:02:00 (e.g. faulty charger / regen braking)
- [ ] **`internal_short`**: M02 voltage drops ~0.1 V/min **and** temperature rises ~4 °C/min, both from 12:02:30
- [ ] **`thermal_propagation`**: M07 heats ~6 °C/min from 12:01:30; 60 s later its neighbours M06 and M08 start heating ~3 °C/min
- [ ] **`low_soc`**: SOC for all modules falls quickly to ~8 % by the end (fast drain)

### Sensor / data problems

- [ ] **`stuck_sensor`**: M08 temperature freezes at its 12:01:30 value for the rest of the file (everything else normal)
- [ ] **`sensor_spike`**: M10 temperature reads `185.00` for one sample at 12:03:00, then returns to normal
- [ ] **`comms_loss`**: every module has blank temperature **and** voltage and status `MISSING` from 12:03:00 to 12:03:30
- [ ] **`missing_module`**: all rows for M05 are **deleted** (not blank) between 12:02:00 and 12:04:00
- [ ] **`corrupted_values`**: scatter about 15 bad values across the file: `NaN`, `null`, `N/A`, `ERR`, `-999`, `abc`, empty
- [ ] **`messy_format`**: rows shuffled out of order, ~5 duplicated rows, 2 unparseable timestamps, status values in mixed case (`ok`, `Ok`, `FAULT`)

### Combined (hardest for the dashboard)

- [ ] **`heating_with_dropout`**: M04 heats ~5 °C/min from 12:02:00 **and** its sensor drops out for 40 s in the middle. The dashboard must not "forget" it was heating.

## Done when

- [ ] `python3 tools/generate_scenarios.py` runs cleanly and creates every scenario
- [ ] Each one has a clear `description` and `expected` in `index.json` (this becomes our test checklist and demo script)
- [ ] You've opened a few CSVs and they look right
- [ ] Committed and pushed (small commits are good; judges look at commit history)

**Stretch:** add a `--plot` option that uses matplotlib to save a PNG of temperature and voltage per module for each scenario
into `docs/figures/`. These make great presentation slides.
