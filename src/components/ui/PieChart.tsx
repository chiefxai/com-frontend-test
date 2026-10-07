import React from 'react';

export interface PieChartSlice {
  label: string;
  value: number;
  color: string;
}

interface PieChartProps {
  slices: PieChartSlice[];
  /** Outer diameter in px */
  size?: number;
  /** Inner hole radius as a fraction of the outer radius (0 = solid pie, >0 = donut) */
  innerRadiusRatio?: number;
  /** Content rendered in the center of the chart (only meaningful when innerRadiusRatio > 0) */
  centerLabel?: React.ReactNode;
  className?: string;
}

const pointOnCircle = (cx: number, cy: number, radius: number, angle: number) => {
  const radians = (angle * Math.PI) / 180;
  return {
    x: Number((cx + radius * Math.cos(radians)).toFixed(3)),
    y: Number((cy + radius * Math.sin(radians)).toFixed(3)),
  };
};

function describeSlice(cx: number, cy: number, outerRadius: number, innerRadius: number, start: number, end: number) {
  const span = end - start;

  // SVG arc commands cannot draw a complete circle when their endpoints match.
  // Two half-circle arcs also keep a single-slice chart reliable in PDF rasterizers.
  if (span >= 359.999) {
    const top = { x: cx, y: cy - outerRadius };
    const bottom = { x: cx, y: cy + outerRadius };
    const outer = `M ${top.x} ${top.y} A ${outerRadius} ${outerRadius} 0 1 1 ${bottom.x} ${bottom.y} A ${outerRadius} ${outerRadius} 0 1 1 ${top.x} ${top.y} Z`;
    if (innerRadius <= 0) return outer;

    const innerTop = { x: cx, y: cy - innerRadius };
    const innerBottom = { x: cx, y: cy + innerRadius };
    const hole = `M ${innerTop.x} ${innerTop.y} A ${innerRadius} ${innerRadius} 0 1 0 ${innerBottom.x} ${innerBottom.y} A ${innerRadius} ${innerRadius} 0 1 0 ${innerTop.x} ${innerTop.y} Z`;
    return `${outer} ${hole}`;
  }

  const outerStart = pointOnCircle(cx, cy, outerRadius, start);
  const outerEnd = pointOnCircle(cx, cy, outerRadius, end);
  const largeArc = span > 180 ? 1 : 0;
  const outerArc = `A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`;

  if (innerRadius <= 0) {
    return `M ${cx} ${cy} L ${outerStart.x} ${outerStart.y} ${outerArc} Z`;
  }

  const innerEnd = pointOnCircle(cx, cy, innerRadius, end);
  const innerStart = pointOnCircle(cx, cy, innerRadius, start);
  const innerArc = `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y}`;
  return `M ${outerStart.x} ${outerStart.y} ${outerArc} L ${innerEnd.x} ${innerEnd.y} ${innerArc} Z`;
}

// Shared SVG pie/donut chart. Slices are filled paths instead of stroked circles,
// so their geometry stays inside the viewBox and does not depend on CSS rotation
// or stroke clipping in browser/PDF renderers.
export default function PieChart({ slices, size = 160, innerRadiusRatio = 0.6, centerLabel, className = '' }: PieChartProps) {
  const chartSize = Number.isFinite(size) && size > 0 ? size : 160;
  const safeSlices = slices.filter(slice => Number.isFinite(slice.value) && slice.value > 0);
  const total = safeSlices.reduce((sum, slice) => sum + slice.value, 0);
  const cx = chartSize / 2;
  const cy = chartSize / 2;
  // One CSS pixel of breathing room prevents antialiasing from touching the SVG edge.
  const outerRadius = Math.max(0, chartSize / 2 - 1);
  const innerRatio = Math.max(0, Math.min(0.95, Number.isFinite(innerRadiusRatio) ? innerRadiusRatio : 0.6));
  const innerRadius = outerRadius * innerRatio;

  if (total <= 0) {
    return (
      <div
        className={`flex items-center justify-center rounded-full ${className}`}
        style={{ width: chartSize, height: chartSize, background: 'var(--bg-subtle)' }}
      >
        <span className="text-[11px] text-[var(--text-muted)]">No data</span>
      </div>
    );
  }

  let accumulated = 0;

  return (
    <div className={`relative inline-flex items-center justify-center ${className}`} style={{ width: chartSize, height: chartSize }}>
      <svg
        width={chartSize}
        height={chartSize}
        viewBox={`0 0 ${chartSize} ${chartSize}`}
        aria-label="Pie chart"
        role="img"
        style={{ display: 'block', overflow: 'visible' }}
      >
        {safeSlices.map((slice, index) => {
          const start = -90 + (accumulated / total) * 360;
          accumulated += slice.value;
          const end = -90 + (accumulated / total) * 360;

          return (
            <path
              key={`${slice.label}-${index}`}
              d={describeSlice(cx, cy, outerRadius, innerRadius, start, end)}
              fill={slice.color}
              fillRule="evenodd"
            >
              <title>{`${slice.label}: ${slice.value}`}</title>
            </path>
          );
        })}
      </svg>
      {innerRatio > 0 && (
        <div className="absolute inset-0 flex items-center justify-center">
          {centerLabel ?? (
            <div className="text-center">
              <p className="text-lg font-bold text-[var(--text-primary)]">{total}</p>
              <p className="text-[9px] text-[var(--text-muted)] uppercase tracking-wide">Total</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
