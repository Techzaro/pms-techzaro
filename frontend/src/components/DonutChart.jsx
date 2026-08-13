/**
 * DonutChart component — Renders a donut chart with color-coded segments.
 * Used for Task Status Breakdown visualization.
 */

import { memo, useMemo } from "react";

const DonutChart = memo(function DonutChart({ segments, size = 140, strokeWidth = 24, totalLabel = "Total Tasks" }) {
  const total = useMemo(() => segments.reduce((sum, s) => sum + s.count, 0), [segments]);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  const arcs = useMemo(() => {
    let accumulated = 0;
    return segments.map((seg) => {
      const percent = total > 0 ? (seg.count / total) * 100 : 0;
      const strokeDasharray = total > 0
        ? `${(seg.count / total) * circumference} ${circumference}`
        : `0 ${circumference}`;
      const strokeDashoffset = -accumulated;
      if (total > 0) accumulated += (seg.count / total) * circumference;
      return { ...seg, percent, strokeDasharray, strokeDashoffset };
    });
  }, [segments, total, circumference]);

  return (
    <div className="donut-chart-container">
      <div className="donut-chart-wrapper" style={{ position: "relative", width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
          {arcs.map((arc) => (
            <circle
              key={arc.label}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={arc.color}
              strokeWidth={strokeWidth}
              strokeDasharray={arc.strokeDasharray}
              strokeDashoffset={arc.strokeDashoffset}
              style={{ transition: "stroke-dasharray 0.6s ease, stroke-dashoffset 0.6s ease" }}
            />
          ))}
        </svg>
        <div style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          textAlign: "center",
        }}>
          <div style={{ fontSize: "24px", fontWeight: "700", color: "var(--text-heading)" }}>{total}</div>
          <div style={{ fontSize: "11px", color: "#9ca3af" }}>{totalLabel}</div>
        </div>
      </div>
      <div className="donut-chart-legend">
        {arcs.map((arc) => (
          <div key={arc.label} className="donut-legend-item">
            <div className="donut-legend-dot" style={{ background: arc.color }} />
            <span className="donut-legend-label">{arc.label}</span>
            <span className="donut-legend-count">{arc.count} ({Math.round(arc.percent)}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
});

export default DonutChart;
