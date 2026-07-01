/**
 * PriorityBarChart component — Renders horizontal bar chart for priority distribution.
 * Used for Priority Distribution visualization.
 */

import { memo, useMemo } from "react";

const PriorityBarChart = memo(function PriorityBarChart({ bars, totalLabel = "Total Tasks" }) {
  const total = useMemo(() => bars.reduce((sum, b) => sum + b.count, 0), [bars]);

  const enrichedBars = useMemo(() => {
    return bars.map((bar) => ({
      ...bar,
      percent: total > 0 ? Math.round((bar.count / total) * 1000) / 10 : 0,
    }));
  }, [bars, total]);

  return (
    <div className="priority-bar-chart-container">
      <div className="priority-bars-list">
        {enrichedBars.map((bar) => (
          <div key={bar.label} className="priority-bar-item">
            <div className="priority-bar-label">{bar.label}</div>
            <div className="priority-bar-track">
              <div
                className="priority-bar-fill"
                style={{
                  width: `${bar.percent}%`,
                  background: bar.color,
                }}
              />
            </div>
            <div className="priority-bar-value">{bar.count} ({Math.round(bar.percent)}%)</div>
          </div>
        ))}
      </div>
      <div className="priority-bar-footer">{total} {totalLabel}</div>
    </div>
  );
});

export default PriorityBarChart;
