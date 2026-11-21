# Batter-eye: speaker notes

Deck: `Batter-eye_Presentation.pdf` (source `slides.html`). 15 slides, about 10 minutes, then the live demo and 5 minutes of questions.

Speaking split (about 2.5 minutes each):

| Speaker | Slides | Time |
|---|---|---|
| Speaker 1 | 1, 2, 3, 13 | ~2:25 |
| Speaker 2 | 4, 5, 6 | ~2:30 |
| Speaker 3 | 7, 8, 9, 15 | ~2:30 |
| Speaker 4 | 10, 11, 12, 14 (then drives the demo) | ~2:20 |

Total: about 9 min 45 s. Hand over by name ("Over to ...") at each change of speaker.

---

## 1. Title (Speaker 1, 0:20)
- "We are [team]. This is Batter-eye, a battery-safety monitor for an electric-bus fleet."
- One sentence of purpose: it watches every module of a 12-module pack and tells the operator what is wrong, where, how soon it becomes critical, and what to do.
- Lay out the talk: the problem, how the engine works, how we chose every threshold, the interface, validation, then a live demo on your dataset.

## 2. The problem (Speaker 1, 0:45)
- Picture a depot operator with many buses and no time. They need three answers in order: is anything wrong, where and how fast, and what do I do.
- The first constraint is that sensors lie. Dropouts, frozen values, `ERR`, `-999`. A dead sensor must not look like a fire, and a missing reading must not look safe. Both mistakes are dangerous.
- The second is that we are judged on a file we have never seen, so we could not tune anything to the five sample files. Every design choice that follows comes from these two constraints.

## 3. Product overview (Speaker 1, 0:50)
- Go through the numbered markers top to bottom. The layout follows the operator's three questions in priority order.
- (1) The status banner answers "is anything wrong" in one word and one colour. (3) The pack map shows where. (4) The alert card says what it is, how long until the critical limit (the forecast reads "M07 reaches 55 °C in ~44 s"), and what to do.
- (5) KPIs turn amber and red at the same limits as the engine, so the numbers and the alerts always agree. (6) Trends and module detail explain how we got here.
- Be transparent: the screenshots use our current visual design, and everything on slides 3–12 was in the submitted build. Hand over to Speaker 2.

## 4. Architecture (Speaker 2, 0:55)
- Every 10-second frame, all 12 modules pass through six stages in order. Name them quickly: parser, sensor integrity, hazard detectors, condition tracker, diagnosis, alert manager. Each stage is its own file in `src/core`.
- Two side outputs matter. The parser produces a data-quality report. Sensor integrity withholds untrusted values, so later stages never see them.
- It is causal: the state at time t depends only on data up to t. Replaying a CSV is therefore exactly what live monitoring would do.
- The engine is plain TypeScript with no UI code. It is tested headless and cross-checked by an independent Python implementation. Nothing is hard-coded: module IDs and count, sample interval, and cell vs module voltage are all read from the data, and every threshold is in one `config.ts`.

## 5. Data-driven thresholds (Speaker 2, 0:50)
- Before choosing any limit, we measured the normal dataset. The worst temperature deviation from the pack median was 2.33 °C, and the worst voltage deviation was 13 mV.
- We set the relative and rate warnings at about 2× those worst cases (left chart). That margin means normal noise never alerts, but real faults still stand out.
- The right chart shows why relative rules matter. On the provided fault files, pack-relative and rate rules fire 80–140 s before a fixed limit would. (These are first single-sample firings, before persistence.)
- Absolute limits remain as the backstop. If the whole pack heats together, the median rises with it, and only absolute limits and the pack-wide rule catch it.

## 6. Three detectors and the thresholds (Speaker 2, 0:45)
- Each module is checked three ways: against the safety limit, against the rest of the pack, and against its own trend.
- Why the median: one or two faulty modules cannot drag it, and it automatically follows ambient temperature and load. It uses only trusted modules and needs at least 3.
- Give the justification for two rows only, the others are on the slide. 45/55 °C come from Li-ion operating limits (discharge limit 55–60 °C; ageing accelerates above ~45 °C). 30 mV is 2.3× the normal worst case of 13 mV.
- Voltage is graded per cell. If a file reports module voltage, we infer cells in series and scale every limit. Hand over to Speaker 3.

## 7. False-alarm control (Speaker 3, 0:40)
- The rubric asks for no false alarms on unseen data, so we treated that as a design requirement, not a hope.
- Persistence: 3 samples to raise a warning, 2 for critical, so a single noisy sample never alerts. Hysteresis: a value must recover past the limit by a margin, for 3 samples, before an alert clears, so nothing flickers.
- Freeze on dropout: while a sensor is untrusted, its hazard conditions neither clear nor progress. One problem keeps one alert as it grows or escalates, so there are no floods.
- Result: zero alerts on the normal dataset at every timestamp. The test suite enforces this.

## 8. Data integrity (Speaker 3, 0:50)
- The rubric names missing, stuck and corrupted data. We detect all three, plus out-of-range values, `-999`-style sentinels, implausible jumps and status flags.
- A sensor fault is shown as a data fault: purple, hatched, with a "?" icon, and never red. The value is withheld from detection and from the pack median, so one bad sensor cannot distort the other eleven.
- "Unknown is not safe": in the bottom-left image, M04 was heating, then lost its temperature sensor, and it stays critical.
- If all 12 modules go silent at once, that is one "Communication loss" alert telling the operator to reduce load and check the BMS link, not twelve separate alerts.

## 9. Diagnosis, forecast, action (Speaker 3, 0:45)
- A raw "threshold exceeded" doesn't tell an operator what to do. The diagnosis stage groups conditions by module adjacency and names a root cause.
- Point at two contrasting rows. Heating plus a falling voltage in the same module is a suspected internal short. Neighbours that start heating at least 30 s after a source module is thermal propagation, and the alert names the source.
- The alert card shows the diagnosis, the forecast at the current slope, and a concrete action.
- Alert identity: the event log shows ALT-001 raised as an isolated thermal event on M07, then updated to propagation when M06 and M08 followed. It stays one alert, not three. Hand over to Speaker 4.

## 10. UI/UX decisions (Speaker 4, 0:45)
- Colour is reserved for urgency. The base is dark and quiet, healthy modules and trend lines stay neutral, and orange appears only on actions. So when red appears, it means something.
- Colour is never used alone. Every state has an icon and a word, and data faults are also hatched. That keeps it readable for colour-blind operators and on a washed-out projector.
- Reading order is priority order, and the pack map follows series order, so heat spreading between neighbours is visible on the map.
- The operator stays in control: acknowledge, scrub to any alert, export, and tune thresholds in the Thresholds panel (right), which re-analyses the file instantly. There is also an optional audible alarm, keyboard control, and reduced-motion support.

## 11. Completeness (Speaker 4, 0:35)
- Map this slide to the completeness criterion. Pack and 12-module visibility were on the earlier slides. Here are the historical trends, module detail and event log.
- Trends cover temperature, voltage, current, SOC and SOH, with warning and critical lines. Healthy modules are grey, so a troubled module stands out without a legend.
- Module detail shows deviation from the pack, the rates, and the exact conditions behind the alert, so the operator can see why it fired.
- The event log records every raise, update, clear and ignored blip, and exports to CSV for handover or audit.

## 12. Validation (Speaker 4, 0:40)
- We couldn't see the judging data, so we generated 12 extra scenarios covering the new fault types and messy data the brief warned about.
- 58 automated tests pass in the submitted build, including 300 randomly corrupted files that never crash the parser. An independent Python detector agrees on all 19 checks (17 scenarios plus empty and header-only files).
- Mention two interesting results: a single-sample spike is ignored and logged, and comms loss gives one alert. On the messy file, the data-quality panel reports every repair it made.
- Bottom line: zero false alarms on normal data, and every fault diagnosed as intended. Hand back to Speaker 1.

## 13. What we built next (Speaker 1, 0:30)
- Say it clearly: "These were built after the submission deadline and are not part of what you are judging."
- The same engine now powers a fleet overview of eight buses ranked by severity, a printable incident report, and escalation. A critical that stays unacknowledged for 20 s is escalated to the depot supervisor, with optional desktop notifications.
- We also gave it the Batter-eye name and a redesigned interface.
- Fleet map: each bus's position is simulated (the CSVs have no GPS), but the four ETS garages (Mitchell, Kathleen Andrews, Ferrier, Centennial) are at their real addresses. Every bus that needs attention gets a line to its nearest garage and a driver instruction: a critical bus is told to stop safely and request recovery, a warning bus to return to the garage (or request a tow if its charge won't cover the distance). The same guidance appears in each bus's dashboard and alert cards.
- Keep this short and move to the demo.

## 14. Live demo plan (Speaker 4, 0:20, then the demo)
- "Now your dataset." Follow the six steps on the slide: drop the CSV, read the data-quality panel, play at 10×, open the worst alert and its module, jump between alerts and export the log, then change a threshold.
- If the file has problems, say so confidently: the data-quality panel explains them. If it cannot be read at all, the app says why and keeps the previous dataset on screen.
- Before the session: serve the local build (`npm run build && npm run preview`), have the judging CSV ready to drag in, and turn the audible alarm off unless you want it.

## 15. Thank you / questions (Speaker 3, 0:15)
- Closing line: "Catch the faulty module early, explain it clearly, and never cry wolf."
- Invite questions. Each speaker takes the questions about their own section.

---

## Likely judge questions

**Why 45 °C warning and 55 °C critical?**
They come from typical Li-ion operating limits. The discharge limit is usually 55–60 °C, and degradation accelerates above about 45 °C. These are the absolute backstop, and they sit far above the normal data, whose maximum was 31.7 °C. Relative and rate rules usually fire first. On thermal rise, M07 went critical at 12:02:20, 20 s after onset, at about 33 °C (driven by the rise rate and the deviation from the pack), long before it reached 45 °C.

**Why 30 mV from the pack median?**
In the normal dataset, the largest voltage deviation from the pack median at the same timestamp was 13 mV. 30 mV is 2.3× that, so noise never triggers it, but the provided low-voltage fault crossed it 10 s after onset. A fixed 3.4 V limit was only crossed about 2.5 minutes later. 100 mV is the critical level.

**Why the median and not the mean?**
One or two faulty modules cannot pull the median, but they would drag a mean towards themselves and hide their own deviation. The median also follows ambient temperature and load automatically. We compute it only over trusted modules, and only when at least 3 are trusted.

**How do you avoid false alarms?**
Four mechanisms:
- Limits are set at about 2× the measured normal worst case.
- Persistence: 3 samples to raise a warning, 2 for critical.
- Hysteresis with a recovery margin, held for 3 samples before an alert clears.
- Sensor faults are handled separately from battery faults.

Single-sample blips are logged as "Ignored" and never raised. The normal dataset produces zero alerts at every timestamp, and a test enforces it.

**What if all the sensors drop out?**
If at least half the modules go missing at once, the engine raises one "Communication loss" data-fault alert. The action is to reduce load and check the BMS link. Existing hazard alerts stay frozen, neither cleared nor progressed, because unknown is not safe. Relative checks pause while fewer than 3 modules are trusted. When data returns, conditions resume from where they were.

**How do you tell a real temperature jump from a sensor glitch?**
A change of more than 10 °C or 0.5 V in a single sample is physically implausible. The fastest real change in the provided faults was 1.4 °C and 22 mV per 10 s, so we withhold that value. If the new level holds for 3 samples, we accept it as real, so a genuine step is never ignored forever.

**How do you detect a stuck sensor?**
The same temperature for at least 6 samples, or the same voltage for at least 9. In the normal data, temperature never repeated more than 2 samples in a row, and voltage never more than 4 (voltage has 1 mV resolution, so short repeats are normal). That gives a 2–3× margin.

**How do you tell multi-module heating from propagation?**
Both involve adjacent modules heating. If they start together, it is a shared cause such as a cooling failure. If one module started at least 30 s before its neighbours, it is propagation from that source module.

**How is the forecast computed?**
It is a linear extrapolation of the least-squares slope over the last 30 s, on real timestamps, towards the critical limit. This is a stated limitation: thermal runaway accelerates, so the linear forecast is optimistic, and we treat it as an upper bound on the time available.

**Why rules instead of machine learning?**
We had five files of 36 samples each, far too little to train on safely. The brief also rewards explainable alerts and no false alarms. Every rule here has a written justification and a test. Learned per-bus baselines could be added later on top of the rules, never replacing them.

**How would this scale to a fleet?**
The engine processes one frame at a time and keeps per-pack state, so a fleet is one engine instance per bus. The input would be a live CAN or MQTT stream instead of a CSV. After the deadline we built a fleet overview that does exactly this for eight buses. It is not part of the judged submission.

**What if the judging file is different, for example module-level voltage, a different module count or a 60 s interval?**
Module IDs, count and interval are read from the file. Cells in series are inferred as round(median V / 3.7), and all voltage limits scale. Rates use real timestamps. One caveat: persistence is counted in samples, so at a 60 s interval a warning takes 3 minutes to confirm. Thresholds are editable live if the judges want to explore.

**How do you know the TypeScript engine is right?**
There are 58 Vitest tests in the submitted build covering the provided datasets, the generated scenarios, parser edge cases and 300 fuzzed files. A separate Python implementation of the same rules (`tools/validate.py`) agrees on 19/19 checks.

**What was built after the deadline?**
The Batter-eye name and redesign, the animated landing page, the fleet overview, the incident report, and escalation with desktop notifications. The detection engine, thresholds, tests and every core dashboard feature shown on slides 3–12 were in the submission.
