/**
 * Every detection threshold in one place.
 *
 * Values are justified in docs/DETECTION_LOGIC.md. Relative and rate thresholds were
 * set at roughly 2x the worst case measured in the "Normal operations" dataset
 * (see docs/DATA_ANALYSIS.md), so normal noise never raises an alert.
 *
 * Voltage values are per cell. If the input reports module-level voltage
 * (e.g. 44 V for 12 cells in series) the engine scales them automatically.
 */

/** A graded threshold: warning level, critical level and hysteresis for clearing. */
export interface Band {
  warn: number;
  crit: number;
  /** An active condition only clears once the value is back past the threshold by this much. */
  hyst: number;
}

export interface DetectionConfig {
  temperature: {
    high: Band; // °C, absolute
    deviation: Band; // °C above the pack median
    riseRate: Band; // °C per minute
  };
  voltage: {
    nominalCell: number; // V, used to infer cells in series
    low: Band; // V per cell, absolute
    high: Band; // V per cell, absolute
    deviation: Band; // V per cell from the pack median (either direction)
    dropRate: Band; // V per cell per minute (magnitude of fall)
  };
  soc: { low: Band }; // %
  soh: { low: Band }; // %
  current: {
    /** Deviation from the pack median as a fraction of |median| ... */
    deviationRatio: { warn: number; crit: number };
    /** ... but never less than these absolute amounts (avoids noise at low current). */
    deviationFloorA: { warn: number; crit: number };
    hystA: number;
  };
  sensor: {
    /** Identical consecutive readings before a sensor is considered stuck. */
    stuckSamples: { temperature: number; voltage: number };
    /** Largest believable change between consecutive samples. */
    spikeDelta: { temperature: number; voltage: number };
    /** A jump that persists this many samples is accepted as real. */
    spikeConfirmSamples: number;
    /** Physically possible ranges; anything outside is a corrupted reading. */
    range: {
      temperature: [number, number];
      voltage: [number, number]; // per cell
      current: [number, number];
      soc: [number, number];
      soh: [number, number];
    };
    /** Common "no reading" placeholder values written by data loggers. */
    sentinels: number[];
  };
  /** Window for rate-of-change slope calculation, seconds. */
  rateWindowSec: number;
  /** Fewer valid modules than this and pack-median comparisons are skipped. */
  minModulesForMedian: number;
  persistence: {
    warning: number; // consecutive samples before a warning is raised
    critical: number; // ... before a critical is raised
    sensor: number; // ... before a sensor fault is raised
    clear: number; // consecutive normal samples before a hazard clears
    sensorClear: number; // ... before a sensor fault clears
  };
  /** Fraction of modules affected before a problem is treated as pack-wide. */
  packWideFraction: number;
  /** Fraction of modules without data before it is treated as a communication loss. */
  commsLossFraction: number;
  /** A heating module that started this much earlier than its neighbours is the propagation source. */
  propagationDelaySec: number;
}

export const DEFAULT_CONFIG: DetectionConfig = {
  temperature: {
    // Li-ion discharge limit is typically 55–60 °C; degradation accelerates above ~45 °C.
    high: { warn: 45, crit: 55, hyst: 2 },
    // Normal max deviation from median: 2.33 °C.
    deviation: { warn: 5, crit: 10, hyst: 1.5 },
    // Normal max rise: 0.86 °C/min. Provided faults: 5–7.5 °C/min.
    riseRate: { warn: 2, crit: 4, hyst: 0.5 },
  },
  voltage: {
    nominalCell: 3.7,
    // NMC discharge cut-off ~3.0 V; damage risk grows below ~3.2 V.
    low: { warn: 3.4, crit: 3.2, hyst: 0.03 },
    // NMC charge limit 4.2 V.
    high: { warn: 4.15, crit: 4.2, hyst: 0.02 },
    // Normal max deviation from median: 13 mV.
    deviation: { warn: 0.03, crit: 0.1, hyst: 0.01 },
    // Normal max drift: 0.016 V/min. Provided fault: ~0.11 V/min.
    dropRate: { warn: 0.05, crit: 0.1, hyst: 0.01 },
  },
  soc: { low: { warn: 20, crit: 10, hyst: 2 } },
  // 80 % is the standard end-of-life point for traction batteries.
  soh: { low: { warn: 80, crit: 70, hyst: 1 } },
  current: {
    // Series modules carry the same current; >1.5x / 2x the median is abnormal.
    deviationRatio: { warn: 0.5, crit: 1.0 },
    deviationFloorA: { warn: 20, crit: 40 },
    hystA: 5,
  },
  sensor: {
    // Normal data never repeats a temperature >2 samples or a voltage >4 samples.
    stuckSamples: { temperature: 6, voltage: 9 },
    // Fastest real change in provided data: 1.4 °C and 22 mV per 10 s.
    spikeDelta: { temperature: 10, voltage: 0.5 },
    spikeConfirmSamples: 3,
    range: {
      temperature: [-40, 150],
      voltage: [0, 5],
      current: [-2000, 2000],
      soc: [0, 100],
      soh: [0, 100],
    },
    sentinels: [-999, -9999, 9999, 99999, -99999],
  },
  rateWindowSec: 30,
  minModulesForMedian: 3,
  persistence: { warning: 3, critical: 2, sensor: 2, clear: 3, sensorClear: 2 },
  packWideFraction: 0.75,
  commsLossFraction: 0.5,
  propagationDelaySec: 30,
};

/** Deep-clones the defaults so callers can edit a copy safely. */
export function cloneDefaultConfig(): DetectionConfig {
  return structuredClone(DEFAULT_CONFIG);
}
