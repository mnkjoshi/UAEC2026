import type { ModuleState } from '../../core/types';

/**
 * Hand-made module states for building UI before the engine is wired in.
 * Covers every severity and the missing-value case.
 */
export const mockModules: ModuleState[] = [
  { id: 'M01', temperature: 27.6, voltage: 3.684, current: 85.4, soc: 78.1, soh: 95.7, severity: 'normal' },
  { id: 'M02', temperature: 28.0, voltage: 3.686, current: 85.0, soc: 77.9, soh: 95.5, severity: 'normal' },
  { id: 'M03', temperature: 28.1, voltage: 3.601, current: 81.3, soc: 77.3, soh: 95.3, severity: 'warning', label: '80 mV below pack' },
  { id: 'M04', temperature: 28.1, voltage: 3.690, current: 85.1, soc: 78.1, soh: 96.0, severity: 'normal' },
  { id: 'M05', temperature: 28.4, voltage: 3.683, current: 84.0, soc: 78.0, soh: 95.7, severity: 'advisory', label: 'Brief sensor glitch' },
  { id: 'M06', temperature: 29.0, voltage: 3.683, current: 85.6, soc: 78.1, soh: 95.5, severity: 'normal' },
  { id: 'M07', temperature: 54.6, voltage: 3.688, current: 86.0, soc: 76.8, soh: 95.3, severity: 'critical', label: 'Rising 7.5 °C/min' },
  { id: 'M08', temperature: 30.3, voltage: 3.676, current: 85.1, soc: 78.0, soh: 96.0, severity: 'normal' },
  { id: 'M09', temperature: 30.3, voltage: 3.674, current: 85.1, soc: 78.1, soh: 95.8, severity: 'normal' },
  { id: 'M10', temperature: 30.3, voltage: 3.674, current: 85.0, soc: 77.9, soh: 95.5, severity: 'normal' },
  { id: 'M11', temperature: null, voltage: null, current: 82.1, soc: 77.5, soh: 95.3, severity: 'data_fault', label: 'T/V sensor missing' },
  { id: 'M12', temperature: 31.1, voltage: 3.680, current: 85.8, soc: 78.0, soh: 96.0, severity: 'normal' },
];
