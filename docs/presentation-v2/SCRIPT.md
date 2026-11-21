# Batter-eye: presentation script

Two speakers: about 8½ minutes of slides, a **5-minute live demo**, a short close, then up to 5 minutes of questions.
Deck: `Batter-eye_Presentation.pdf`. Lines in *[brackets]* are cues, not spoken.

| Speaker | Slides | Time |
|---|---|---|
| **Manav** | 1, 2, 3, 4, 9, 10, 13, drives the demo | ~4:30 + demo |
| **Elijah** | 5, 6, 7, 8, 11, 12, narrates the demo, 15 | ~4:00 + demo |

Five handovers, each by name. Aim to speak to the judges, not the screen.

### Run of show

Check the clock at the four checkpoints in bold. If you're more than 30 s behind, use the trims at the bottom.

| Clock | Section | Who |
|---|---|---|
| 0:00 | 1–4: Intro, problem, dashboard, architecture | Manav |
| **3:00** | 5–8: Thresholds, detectors, false alarms, data integrity | Elijah |
| **6:05** | 9–10: Diagnosis, UI | Manav |
| 7:35 | 11–12: Completeness, validation | Elijah |
| 8:55 | 13: What we built next | Manav |
| **9:25** | 14: **Live demo** (5:00) | Manav drives, Elijah narrates |
| **14:25** | 15: Close | Elijah |
| 14:40 | Questions (up to 5:00) | Both |

The whole slot can run up to 35 minutes, so there's slack, but finishing the talk and demo in about 15 minutes leaves the judges fresh for questions.

---

## 1. Title (Manav, 0:25)

**Manav:** Good morning. I'm Manav, and this is Elijah. This is **Batter-eye**, a battery-safety monitor for an electric-bus fleet.

It watches all twelve modules of a battery pack, and for any problem it tells the operator what's wrong, where it is, how long until it becomes critical, and what to do about it.

We'll cover the problem, how the engine works, how we chose every threshold, the interface, and how we tested it. Then we'll run it live on your dataset.

*[click]*

## 2. The problem (Manav, 0:45)

**Manav:** Picture a depot operator watching a fleet. They don't have time to read numbers. They need three answers, in this order: **Is anything wrong? Where, and how fast? And what do I do now?**

We designed around two constraints.

First, **sensors can't be trusted blindly.** Readings drop out, freeze, spike, or arrive as "ERR" or minus 999. A dead sensor must never look like a fire, and a missing reading must never look safe.

Second, **we're judged on data we've never seen.** So we couldn't tune anything to the five sample files. Everything that follows comes from those two constraints.

*[click]*

## 3. Product overview (Manav, 0:50)

**Manav:** This is the whole dashboard during a thermal event. It reads top to bottom in priority order.

*[point at 1]* The banner answers "is anything wrong": one word, one colour.
*[point at 3]* The pack map shows where: M07 is the red tile.
*[point at 4]* The alert card says what it is, gives a forecast ("M07 reaches 55 degrees in about 44 seconds"), and tells the operator what to do.
*[point at 5]* The summary numbers turn amber and red at exactly the same limits as the engine, so the numbers and the alerts never disagree.
*[point at 6]* Trends and module detail show how we got here.

These screenshots use our current visual design. Every feature on slides 3 to 12 was in the submitted build.

*[click]*

## 4. Architecture (Manav, 0:55)

**Manav:** Under the hood, every ten-second frame of all twelve modules goes through six stages, in order: **parse, check the sensors, detect hazards, filter for persistence, diagnose, and manage the alert.** Each stage is its own file.

Two details matter. The parser produces a **data-quality report**, so nothing wrong with the file is hidden. And the sensor stage **withholds untrusted values**, so later stages never see them.

The design is **causal**: the state at any moment depends only on data up to that moment. So replaying a CSV behaves exactly like live monitoring.

The engine is plain TypeScript with no interface code, so it's tested on its own. And **nothing is hard-coded**: module names, module count, sample interval, even whether voltage is per cell or per module are all read from the file. Every threshold lives in one config file.

Elijah will explain how we chose those thresholds.

*[click]*

## 5. Data-driven thresholds (Elijah, 0:50)

**Elijah:** Before setting a single limit, we measured what normal looks like.

*[point at left chart]* In the normal dataset, the furthest any module's temperature got from the pack median was 2.3 degrees. For voltage, it was 13 millivolts. We set each warning at **about twice** that worst case. That margin means normal noise never alerts, but a real fault still stands out.

*[point at right chart]* This is why comparing modules matters. On the provided fault files, the pack-relative and rate rules fired **80 to 140 seconds before** a fixed limit would have.

Fixed limits are still there as the backstop. If the whole pack heats together, the median rises with it, and only the absolute limits catch it.

*[click]*

## 6. Three detectors (Elijah, 0:45)

**Elijah:** So every module is checked three ways: against the **safety limit**, against **the rest of the pack**, and against **its own trend**.

We compare against the **median**, not the average, because one or two bad modules can't drag the median towards themselves. It also follows ambient temperature and load automatically.

Two examples of the reasoning *[point at table]*: 45 and 55 degrees come from typical lithium-ion limits. Cells are usually rated to discharge up to 55 to 60 degrees, and ageing speeds up above about 45. And 30 millivolts is 2.3 times the normal worst case.

Voltage is judged per cell, so if a file reports whole-module voltage, we work out the cells in series and scale every limit to match.

*[click]*

## 7. False-alarm control (Elijah, 0:40)

**Elijah:** The rubric asks for no false alarms on unseen data, so we treated that as a design requirement.

A condition must hold for **three samples** before it raises a warning, or **two** for critical, so a single noisy reading never alerts. To clear, it has to recover past the limit **with margin**, so alerts don't flicker on and off.

If a sensor drops out mid-problem, the alert is **frozen, not cleared**, because unknown isn't safe. And one problem keeps one alert as it grows, so there are no floods.

The result is **zero alerts on the normal dataset**, at every single timestamp, and a test enforces it.

*[click]*

## 8. Data integrity (Elijah, 0:50)

**Elijah:** The rubric names missing, stuck and corrupted data. We detect all three, plus impossible values like minus 999, sudden jumps that aren't physically possible, and sensors that report their own fault.

A sensor fault shows as **purple and hatched, with a question mark, never red.** The bad value is kept out of detection and out of the pack median, so one broken sensor can't distort the other eleven.

*[point at bottom-left image]* Here, M04 was overheating, then lost its temperature sensor, and it **stays critical**.

*[point at bottom-right image]* And if all twelve go silent at once, the operator gets **one** "communication loss" alert, not twelve.

Back to Manav for what the operator actually sees.

*[click]*

## 9. Diagnosis, forecast, action (Manav, 0:45)

**Manav:** "Threshold exceeded" doesn't tell anyone what to do. So the diagnosis stage looks at **which modules** are affected and **how**, and names a root cause.

*[point at table]* If a module is heating and its voltage is falling at the same time, that's a **suspected internal short**. If neighbouring modules start heating after one module did, that's **thermal propagation**, and the alert names the source.

Every alert gives the diagnosis, a **forecast** at the current rate, and a **concrete action**.

*[point at event log]* The alert also keeps its identity: it started as an isolated event on M07 and was **updated** to propagation when M06 and M08 joined. One alert, not three.

*[click]*

## 10. UI and UX decisions (Manav, 0:45)

**Manav:** A few deliberate design choices.

**Colour is reserved for urgency.** The background is quiet, healthy modules are neutral, and orange only appears on buttons. So when red appears, it means something.

**Colour is never used alone.** Every state has an icon and a word, which keeps it readable for colour-blind operators and on a washed-out projector.

The pack map follows the **physical series order**, so heat spreading between neighbours is visible at a glance.

And the operator stays in control: acknowledge alerts, jump to any moment, export the log, and *[point at thresholds panel]* adjust any threshold, which re-analyses the whole file instantly.

Elijah?

*[click]*

## 11. Completeness (Elijah, 0:35)

**Elijah:** For completeness: you've seen the pack and all twelve modules. Here's the **history**.

The trend charts cover temperature, voltage, current, charge and health, with the warning and critical lines drawn on. Healthy modules are grey, so the troubled one stands out without a legend.

The module detail shows exactly **why** an alert fired: the deviation from the pack, the rates, and the conditions. And the event log records every alert raised, updated, cleared or ignored, and **exports to CSV** for handover.

*[click]*

## 12. Validation (Elijah, 0:45)

**Elijah:** We couldn't see your data, so we tried to break ours.

I built **twelve extra stress-test scenarios** covering the fault types and messy data the brief warned about: overvoltage, internal shorts, stuck and spiking sensors, communication loss, missing rows, corrupted values and shuffled files. I also wrote a **separate Python version of the detector** to check the main engine independently. It agrees on **all 19 checks**.

On top of that, **58 automated tests** pass in the submitted build, including **300 randomly corrupted files** that never crash it.

The headline: **zero false alarms on normal data, and every fault diagnosed the way we intended.**

Manav?

*[click]*

## 13. What we built next (Manav, 0:30)

**Manav:** To be clear: **everything on this slide was built after the submission deadline and isn't part of what you're judging.**

Using the same engine, we added a **fleet overview** of eight buses ranked by urgency, **escalation** to a supervisor when a critical alert goes unacknowledged, and a printable **incident report**.

We also added a **map of Edmonton**. The bus positions are simulated, because the data has no GPS, but the four ETS garages are at their real addresses. Every bus with a problem is told what to do: stop safely, return to the nearest garage, or request a tow.

Now let's try your data.

*[click]*

## 14. Live demo (Manav drives, Elijah narrates, 5:00)

Five timed beats. Elijah keeps an eye on the clock: if a beat runs over, he moves to the next line and Manav follows. The playback beat has the most room because the judges' file might be longer than ours.

**Before the first beat:** the speed selector is already on **10×**. Our files are 6 minutes long, so at 10× they play in about 36 seconds. If the judges' file is much longer (say an hour), switch to **50×** or drag the scrubber, rather than waiting.

### Beat 1: Load and check the data (0:00–0:45)

**Elijah:** Manav will load your file now.

*[Manav drags the judging CSV onto the dashboard.]*

**Elijah:** It's parsed right in the browser: no server, nothing to configure.

*[Manav scrolls to the data-quality panel.]*

**Elijah:** First, the data-quality panel. *[Read what it says, e.g.:]* "It found N missing values and M duplicate rows, and it tells us exactly what it did with them." *If it's clean:* "This file is clean, so every reading is trusted."

### Beat 2: Play it as if it were live (0:45–2:15)

*[Manav scrolls back up and presses play.]*

**Elijah:** We're replaying it as if it were live. Watch the banner and the pack map.

*[Let it run. Pause talking for a few seconds so the judges can watch.]*

*[When the first alert appears, Manav pauses with the space bar.]*

**Elijah:** There's our first alert: *[read the title]* on *[module]*. It was caught *[N]* seconds in.

*[If nothing has happened by 1:45, Manav drags to the end. Then use the "no alerts" line below.]*

### Beat 3: Open the alert (2:15–3:15)

*[Manav clicks the alert's module tile.]*

**Manav:** Here's the diagnosis, the forecast, and the action. The module detail shows why it fired: *[read the condition, e.g. "plus 6 degrees per minute, 9 degrees above the pack"]*. And on the trend chart, you can see exactly when it started to pull away from the others.

### Beat 4: Every alert, and the record (3:15–4:15)

*[Manav clicks a marker under the timeline to jump to the next alert.]*

**Manav:** Each dot under the timeline is an alert, so we can jump straight to them. *[Read the next alert title if there is one.]*

*[Manav scrolls to the event log.]*

**Manav:** The event log has the full history: what was raised, updated, cleared, or ignored as a blip. *[click Export CSV]* And it exports for the maintenance team.

### Beat 5: Change a threshold (4:15–5:00, skip if behind)

*[Manav opens Thresholds, changes one value (for example, temperature warning 45 → 40), and applies.]*

**Manav:** And if you want to explore a different threshold, we change it here, and the whole file is re-analysed instantly.

*[Manav resets to defaults and closes the panel. Switch back to the slides.]*

**If something unexpected happens, say it calmly:**
- *No alerts at all:* "The pack stays normal throughout. That's the no-false-alarm behaviour: nothing in this file crossed a limit for long enough."
- *Lots of purple:* "Those are data faults, not battery faults: the sensors are unreliable here, and the dashboard says so instead of guessing."
- *The file won't load:* "It tells us exactly why, and keeps the previous data on screen. Nothing crashes." *(Then load a provided scenario from the menu to continue the demo.)*

## 15. Close (Elijah, 0:15)

*[Manav switches back to the last slide.]*

**Elijah:** That's Batter-eye: **catch the faulty module early, explain it clearly, and never cry wolf.** Thank you. We're happy to take questions.

---

## Questions: who answers what

| Topic | Answer |
|---|---|
| Thresholds, medians, false alarms, persistence | **Elijah** |
| Sensor faults, stuck, spikes, comms loss | **Elijah** |
| Testing, Python cross-check, stress scenarios | **Elijah** |
| Architecture, nothing hard-coded, different file formats | **Manav** |
| Diagnosis, propagation vs cooling failure, forecasts | **Manav** |
| Interface decisions, accessibility | **Manav** |
| Fleet, scaling, what was built after the deadline | **Manav** |

If one of you is mid-answer and the other can add something, wait, then add one sentence. Don't talk over each other.

### Short answers to have ready

- **"Why 45 and 55 degrees?"** *(Elijah)* Typical lithium-ion limits: cells are usually rated to discharge up to 55 to 60 degrees, and ageing speeds up above about 45. In practice our relative and rate rules fire first: on the thermal-rise file, M07 went critical about **20 seconds after onset, at around 33 degrees**, long before 45.
- **"Why 30 millivolts?"** *(Elijah)* The normal worst case was 13 millivolts, so 30 is about 2.3 times that. On the low-voltage file, it fired 10 seconds after onset; a fixed 3.4-volt limit took about two and a half minutes.
- **"Why not machine learning?"** *(Manav)* We had five files of 36 samples each: far too little to train on safely. The brief rewards explainable alerts and no false alarms. Every rule has a written reason and a test.
- **"What if every sensor drops out?"** *(Elijah)* One communication-loss alert, telling the operator to reduce load and check the battery-management link. Any existing alerts stay frozen, because unknown isn't safe.
- **"How's the forecast calculated?"** *(Manav)* A straight-line projection of the last 30 seconds towards the critical limit. Thermal runaway accelerates, so we treat it as the most time you'd have, not a guarantee.
- **"What if our file has a 60-second interval or module-level voltage?"** *(Manav)* Both are read from the file and handled. One honest caveat: persistence counts samples, so at 60-second intervals a warning takes three minutes to confirm. You can lower that in Thresholds.
- **"Did you build the fleet map before the deadline?"** *(Manav)* No. It was built afterwards, using the same engine. It's on the slide clearly marked, and it isn't part of what you're judging.

### Before you walk in

- Laptop charged; the dashboard running locally (`npm run build`, then `npm run preview`) so it doesn't depend on the venue's Wi-Fi.
- The deck open on slide 1, the dashboard open in a second window, and the judging CSV easy to drag in.
- Audible alarm **off**, unless you want the sound in the demo.
- Run through it once out loud with a timer, **including the demo** on one of the provided scenarios (for example Thermal propagation). Check that you hit the checkpoints in the run of show.

### If you're running behind

Trim in this order. Each saves about 20–40 seconds, and none loses a rubric point.
1. Demo beat 5 (changing a threshold): just say "and every threshold is editable live."
2. Slide 11 (completeness): one sentence. "You've seen the trends, module detail and the exportable event log; they're all here."
3. Slide 13 (built after the deadline): one sentence, or skip it.
4. Slide 6: drop the per-cell voltage line.

Never cut slides 5, 7 or 8. The thresholds, false alarms and data integrity are what the judges will ask about.
