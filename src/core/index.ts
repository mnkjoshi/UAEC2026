/** Public API of the detection engine. The UI imports from here only. */
export { parseTelemetryCsv, ParseError } from './parser';
export { runEngine } from './engine';
export { DEFAULT_CONFIG, cloneDefaultConfig, type DetectionConfig, type Band } from './config';
export { describeModules, formatEta } from './diagnosis';
export * from './types';
