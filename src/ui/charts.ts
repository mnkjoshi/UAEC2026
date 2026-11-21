/** ECharts setup (tree-shaken) and a small React hook to own a chart instance. */
import { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import { GridComponent, MarkAreaComponent, MarkLineComponent, TooltipComponent, LegendComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { Severity } from '../core';

echarts.use([LineChart, GridComponent, TooltipComponent, MarkLineComponent, MarkAreaComponent, LegendComponent, CanvasRenderer]);

export type ChartOption = echarts.EChartsCoreOption;

/** Concrete colours for canvas drawing (mirrors the CSS tokens in index.css). */
export const COLORS = {
  text: '#c9d4df',
  muted: '#6e7d8c',
  grid: '#253140',
  line: '#4a5868',
  accent: '#58a6ff',
  severity: {
    normal: '#3fb950',
    advisory: '#58a6ff',
    data_fault: '#b392f0',
    warning: '#e3b341',
    critical: '#ff6b61',
  } satisfies Record<Severity, string>,
};

/** Creates the chart once, resizes it with its container and applies each new option. */
export function useEChart(option: ChartOption) {
  const ref = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const instance = echarts.init(ref.current, undefined, { renderer: 'canvas' });
    chart.current = instance;
    const observer = new ResizeObserver(() => instance.resize());
    observer.observe(ref.current);
    return () => {
      observer.disconnect();
      instance.dispose();
      chart.current = null;
    };
  }, []);

  useEffect(() => {
    chart.current?.setOption(option, { notMerge: true, lazyUpdate: true });
  }, [option]);

  return ref;
}
