import { useMemo } from "react";
import { formatEventDateTime } from "../utils/formatDateTime";

const TYPE_COLORS = {
  Meeting: { bg: "#eef2ff", text: "#6366f1", dot: "#6366f1" },
  Training: { bg: "#eff6ff", text: "#3b82f6", dot: "#3b82f6" },
  Workshop: { bg: "#f5f3ff", text: "#8b5cf6", dot: "#8b5cf6" },
  "Client Meeting": { bg: "#fffbeb", text: "#f59e0b", dot: "#f59e0b" },
  "Company Event": { bg: "#ecfdf5", text: "#22c55e", dot: "#22c55e" },
  Holiday: { bg: "#fef2f2", text: "#ef4444", dot: "#ef4444" },
  Interview: { bg: "#fdf2f8", text: "#ec4899", dot: "#ec4899" },
  "Project Milestone": { bg: "#f0fdfa", text: "#14b8a6", dot: "#14b8a6" },
  "Internship Activity": { bg: "#ecfeff", text: "#06b6d4", dot: "#06b6d4" },
  Other: { bg: "#f3f4f6", text: "#6b7280", dot: "#6b7280" },
};

const DEFAULT_EVENT_COLOR = { bg: "#eef2ff", text: "#6366f1", dot: "#6366f1" };

const TYPE_LABELS = {
  Meeting: "Meeting",
  Training: "Training",
  Workshop: "Workshop",
  "Client Meeting": "Client Meeting",
  "Company Event": "Company Event",
  Holiday: "Holiday",
  Interview: "Interview",
  "Project Milestone": "Project Milestone",
  "Internship Activity": "Internship Activity",
  Other: "Other",
};

function formatDisplayDate(d) {
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function EventItem({ ev, onClick, variant }) {
  const colors = TYPE_COLORS[ev.type] || DEFAULT_EVENT_COLOR;

  if (variant === "upcoming") {
    return (
      <div className="deadline-item" key={ev.id}>
        <div style={{ flex: 1 }}>
          <p
            onClick={() => onClick(ev)}
            style={{
              margin: 0, fontWeight: 600, fontSize: "14px", color: "#111827", cursor: "pointer",
            }}
            onMouseEnter={(e) => { e.target.style.color = "#6366f1"; }}
            onMouseLeave={(e) => { e.target.style.color = "#111827"; }}
          >
            {ev.title}
          </p>
          <div className="dealine-date" style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
            <span className="deadline-date" style={{ color: colors.dot, fontSize: "13px" }}>
              {formatEventDateTime(ev)}
            </span>
            <span style={{ fontSize: "12px", color: "#9ca3af" }}>
              {TYPE_LABELS[ev.type] || ev.type}
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="agenda-item" key={ev.id}>
      <span className="agenda-dot" style={{ background: colors.dot }} />
      <div className="agenda-content">
        <p
          onClick={() => onClick(ev)}
          style={{
            margin: 0, fontWeight: 600, fontSize: "14px", color: "#111827", cursor: "pointer",
          }}
          onMouseEnter={(e) => { e.target.style.color = "#6366f1"; }}
          onMouseLeave={(e) => { e.target.style.color = "#111827"; }}
        >
          {ev.title}
        </p>
        <p style={{ margin: "2px 0 0", fontSize: "12px", color: "#6b7280" }}>
          {formatEventDateTime(ev)}
        </p>
        <span style={{ fontSize: "11px", color: colors.text, fontWeight: 600 }}>
          {TYPE_LABELS[ev.type] || ev.type}
        </span>
      </div>
    </div>
  );
}

export default function EventsWidget({ todayEvents, upcomingEvents, onEventClick, currentRole }) {
  const today = useMemo(() => formatDisplayDate(new Date()), []);

  return (
    <>
      <div className="task-card">
        <h3>
          Today <span className="today-date">• {today}</span>
        </h3>
        <div className="agenda-list">
          {todayEvents.length === 0 ? (
            <p style={{ color: "#9ca3af", fontSize: 14, textAlign: "center", padding: "16px 0" }}>
              No events scheduled for today.
            </p>
          ) : (
            todayEvents.map((ev) => (
              <EventItem key={ev.id} ev={ev} onClick={onEventClick} variant="today" />
            ))
          )}
        </div>
      </div>

      <br />

      <div className="task-card">
        <p style={{ fontWeight: "bold", fontSize: "20px", margin: 0 }}>Upcoming Events</p>
        <div className="deadline-list">
          {upcomingEvents.length === 0 ? (
            <p style={{ color: "#9ca3af", fontSize: 14, textAlign: "center", padding: "16px 0" }}>
              No upcoming events found.
            </p>
          ) : (
            upcomingEvents.slice(0, 5).map((ev) => (
              <EventItem key={ev.id} ev={ev} onClick={onEventClick} variant="upcoming" />
            ))
          )}
        </div>
      </div>
    </>
  );
}
