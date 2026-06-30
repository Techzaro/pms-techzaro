/**
 * EventsWidget.jsx
 * Dashboard widget that displays today's events and upcoming events.
 * Renders event items with type-based color coding and click-to-view functionality.
 */

import { useMemo } from "react";
import { formatEventDateTime } from "../utils/formatDateTime";
import "./EventsWidget.css";

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

/** Formats a date as "Month Day, Year" (e.g., "March 15, 2025"). */
function formatDisplayDate(d) {
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

/**
 * Individual event item with a color dot, title, date/time, and type label.
 * @param {Object} ev - Event object
 * @param {Function} onClick - Callback when the event title is clicked
 */
function EventItem({ ev, onClick }) {
  const colors = TYPE_COLORS[ev.type] || DEFAULT_EVENT_COLOR;

  return (
    <div className="ew-event-item">
      <span className="ew-event-dot" style={{ background: colors.dot }} />
      <div className="ew-event-content">
        <p
          className="ew-event-title"
          onClick={() => onClick(ev)}
        >
          {ev.title}
        </p>
        <p className="ew-event-datetime">
          {formatEventDateTime(ev)}
        </p>
        <span className="ew-event-type" style={{ color: colors.text }}>
          {TYPE_LABELS[ev.type] || ev.type}
        </span>
      </div>
    </div>
  );
}

/**
 * Section card that renders a list of events with a title and optional subtitle.
 * @param {string} title - Section heading
 * @param {string} [subtitle] - Optional subtitle (e.g., today's date)
 * @param {Array} events - Array of event objects to display
 * @param {Function} onEventClick - Callback when an event item is clicked
 * @param {string} emptyText - Text to show when no events exist
 */
function EventSection({ title, subtitle, events, onEventClick, emptyText }) {
  return (
    <div className="ew-card">
      <h3>
        {title}
        {subtitle && <span className="ew-today-date"> {subtitle}</span>}
      </h3>
      <div className="ew-event-list">
        {events.length === 0 ? (
          <p className="ew-empty">{emptyText}</p>
        ) : (
          events.map((ev) => (
            <EventItem key={ev.id} ev={ev} onClick={onEventClick} />
          ))
        )}
      </div>
    </div>
  );
}

/**
 * Dashboard widget displaying today's events and upcoming events.
 * @param {Array} todayEvents - Events scheduled for today
 * @param {Array} upcomingEvents - Future events (limited to 5 in display)
 * @param {Function} onEventClick - Callback when an event is clicked
 * @param {string} [currentRole] - Current user's role (not used in rendering but available)
 */
export default function EventsWidget({ todayEvents, upcomingEvents, onEventClick, currentRole }) {
  const today = useMemo(() => formatDisplayDate(new Date()), []);

  return (
    <>
      <EventSection
        title="Today's Events"
        subtitle={`• ${today}`}
        events={todayEvents}
        onEventClick={onEventClick}
        emptyText="No events scheduled for today."
      />

      <div style={{ height: 20 }} />

      <EventSection
        title="Upcoming Events"
        events={upcomingEvents.slice(0, 5)}
        onEventClick={onEventClick}
        emptyText="No upcoming events found."
      />
    </>
  );
}
