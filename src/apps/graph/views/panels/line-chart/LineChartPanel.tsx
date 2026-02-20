// ui/src/apps/graph/views/panels/line-chart/LineChartPanel.tsx

import { useRef, useEffect, useCallback } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import { useGraphStore, buildAlignedData, type GraphPanel } from "../../../../../stores/graphStore";
import { textSecondary } from "../../../../../styles/colourTokens";

interface Props {
  panel: GraphPanel;
}

/** Read CSS variable value from the document */
function getCssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** Build uPlot options for this panel */
function buildOptions(
  panel: GraphPanel,
  width: number,
  height: number,
): uPlot.Options {
  const textColour = getCssVar("--text-primary") || "#e2e8f0";
  const gridColour = getCssVar("--border-default") || "rgba(255,255,255,0.1)";

  const series: uPlot.Series[] = [
    {}, // x-axis (time)
    ...panel.signals.map((sig) => ({
      label: sig.signalName,
      stroke: sig.colour,
      width: 2,
      points: { show: false },
    })),
  ];

  return {
    width,
    height,
    series,
    cursor: {
      drag: { x: false, y: false },
    },
    scales: {
      x: {
        time: true,
      },
    },
    axes: [
      {
        stroke: textColour,
        grid: { stroke: gridColour, width: 1 },
        ticks: { stroke: gridColour, width: 1 },
      },
      {
        stroke: textColour,
        grid: { stroke: gridColour, width: 1 },
        ticks: { stroke: gridColour, width: 1 },
        size: 60,
      },
    ],
    legend: {
      show: panel.signals.length > 1,
    },
  };
}

export default function LineChartPanel({ panel }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<uPlot | null>(null);
  const dataVersion = useGraphStore((s) => s.dataVersion);
  const seriesBuffers = useGraphStore((s) => s.seriesBuffers);

  // Destroy chart on unmount
  useEffect(() => {
    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, []);

  // Re-create chart when panel signals change (series config changes)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Destroy existing chart
    chartRef.current?.destroy();
    chartRef.current = null;

    if (panel.signals.length === 0) return;

    const rect = el.getBoundingClientRect();
    const opts = buildOptions(panel, rect.width, rect.height);
    const data = buildAlignedData(panel.signals, seriesBuffers) as uPlot.AlignedData;

    const chart = new uPlot(opts, data, el);
    chartRef.current = chart;

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel.signals.length, ...panel.signals.map((s) => `${s.frameId}:${s.signalName}:${s.colour}`)]);

  // Update data when dataVersion changes (new signal values pushed)
  const updateData = useCallback(() => {
    const chart = chartRef.current;
    if (!chart || panel.signals.length === 0) return;

    const data = buildAlignedData(panel.signals, useGraphStore.getState().seriesBuffers) as uPlot.AlignedData;
    chart.setData(data);
  }, [panel.signals]);

  useEffect(() => {
    updateData();
  }, [dataVersion, updateData]);

  // Handle resize
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          chartRef.current?.setSize({ width, height });
        }
      }
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  if (panel.signals.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className={`text-xs ${textSecondary}`}>
          Click + to add signals
        </p>
      </div>
    );
  }

  return <div ref={containerRef} className="w-full h-full" />;
}
