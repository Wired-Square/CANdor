// ui/src/apps/graph/views/panels/gauge/GaugePanel.tsx

import { useGraphStore, type GraphPanel } from "../../../../../stores/graphStore";
import { textSecondary } from "../../../../../styles/colourTokens";

interface Props {
  panel: GraphPanel;
}

/** SVG radial gauge constants */
const GAUGE_RADIUS = 80;
const GAUGE_STROKE = 12;
const GAUGE_START_ANGLE = 135;  // degrees, from 12 o'clock
const GAUGE_END_ANGLE = 405;    // sweep of 270 degrees
const GAUGE_SWEEP = GAUGE_END_ANGLE - GAUGE_START_ANGLE;

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
}

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const sweep = endAngle - startAngle;
  const largeArc = sweep > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`;
}

export default function GaugePanel({ panel }: Props) {
  const signal = panel.signals[0];

  // Read latest value from store. Subscribe to dataVersion to trigger re-renders
  // when ring buffers are updated in place.
  const key = signal ? `${signal.frameId}:${signal.signalName}` : null;
  const value = useGraphStore((s) => {
    // Touch dataVersion to subscribe to data updates
    void s.dataVersion;
    if (!key) return 0;
    return s.seriesBuffers.get(key)?.latestValue ?? 0;
  });

  const { minValue, maxValue } = panel;
  const range = maxValue - minValue;
  const clamped = Math.max(minValue, Math.min(maxValue, value));
  const percentage = range > 0 ? (clamped - minValue) / range : 0;

  const cx = 100;
  const cy = 100;
  const valueAngle = GAUGE_START_ANGLE + GAUGE_SWEEP * percentage;
  const colour = signal?.colour ?? "#3b82f6";

  const bgArc = describeArc(cx, cy, GAUGE_RADIUS, GAUGE_START_ANGLE, GAUGE_END_ANGLE);
  const valueArc = percentage > 0.001
    ? describeArc(cx, cy, GAUGE_RADIUS, GAUGE_START_ANGLE, valueAngle)
    : "";

  // Format value for display
  const displayValue = Math.abs(value) >= 1000
    ? value.toFixed(0)
    : Math.abs(value) >= 100
    ? value.toFixed(1)
    : value.toFixed(2);

  if (!signal) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className={`text-xs ${textSecondary}`}>
          Click + to add a signal
        </p>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center h-full p-2">
      <svg viewBox="0 0 200 170" className="w-full h-full max-w-[250px]">
        {/* Background arc */}
        <path
          d={bgArc}
          fill="none"
          stroke="var(--border-default)"
          strokeWidth={GAUGE_STROKE}
          strokeLinecap="round"
        />

        {/* Value arc */}
        {valueArc && (
          <path
            d={valueArc}
            fill="none"
            stroke={colour}
            strokeWidth={GAUGE_STROKE}
            strokeLinecap="round"
            style={{ transition: "d 0.15s ease-out" }}
          />
        )}

        {/* Value text */}
        <text
          x={cx}
          y={cy - 5}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="var(--text-primary)"
          fontSize="28"
          fontWeight="600"
          fontFamily="ui-monospace, monospace"
        >
          {displayValue}
        </text>

        {/* Unit */}
        <text
          x={cx}
          y={cy + 20}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="var(--text-secondary)"
          fontSize="12"
        >
          {signal.unit ?? ""}
        </text>

        {/* Signal name */}
        <text
          x={cx}
          y={cy + 38}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="var(--text-muted)"
          fontSize="10"
        >
          {signal.signalName}
        </text>

        {/* Min label */}
        <text
          x={30}
          y={155}
          textAnchor="middle"
          fill="var(--text-muted)"
          fontSize="9"
        >
          {minValue}
        </text>

        {/* Max label */}
        <text
          x={170}
          y={155}
          textAnchor="middle"
          fill="var(--text-muted)"
          fontSize="9"
        >
          {maxValue}
        </text>
      </svg>
    </div>
  );
}
