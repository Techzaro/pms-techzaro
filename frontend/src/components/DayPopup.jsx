import { createPortal } from "react-dom";
import { Edit3, Trash2 } from "lucide-react";
import { TYPE_COLORS, TYPE_LABELS, DEFAULT_EVENT_COLOR } from "../pages/Calender";
import { formatEventTime } from "../utils/formatDateTime";

function formatDisplayDate(d) {
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function formatWeekday(d) {
  return d.toLocaleDateString("en-US", { weekday: "long" });
}

export default function DayPopup({ date, events, onClose, onEdit, onDelete, canManageEvents, onItemClick, deleteLoading, onAddEvent }) {
  if (!date) return null;

  return createPortal(
    <div
      className="event-overlay"
      onClick={onClose}
      style={{ zIndex: 10001 }}
    >
      <div
        className="event-modal"
        style={{ maxWidth: 520 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="event-header">
          <div>
            <p className="event-label" style={{ marginBottom: 8 }}>{formatWeekday(date)}</p>
            <h2 style={{ margin: 0, fontSize: 24 }}>{formatDisplayDate(date)}</h2>
          </div>
          <button className="event-close" onClick={onClose}>×</button>
        </div>

        <div className="event-step">
          {events.length === 0 ? (
            <div style={{ textAlign: "center", padding: "20px 0" }}>
              <p style={{ color: "#9ca3af", marginBottom: 16 }}>No events for this day</p>
            </div>
          ) : (
            <>
              {events.map((ev) => {
                const colors = TYPE_COLORS[ev.type] || DEFAULT_EVENT_COLOR;
                const time = ev.all_day ? "All Day" :
                  `${formatEventTime(ev)}${ev.end_date ? ` - ${formatEventTime({ ...ev, start_date: ev.end_date })}` : ""}`;
                const sourceIcon = ev.source === "task" ? "📋" : ev.source === "deliverable" ? "📦" : ev.source === "project" ? "🚀" : "📅";
                return (
                  <div
                    key={ev.id}
                    style={{
                      padding: "14px 16px",
                      borderRadius: 12,
                      background: colors.bg,
                      marginBottom: 10,
                      cursor: "pointer",
                    }}
                    onClick={() => onItemClick?.(ev)}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div style={{ flex: 1 }}>
                        <p style={{ margin: 0, fontWeight: 700, fontSize: 15, color: colors.text }}>
                          {sourceIcon} {ev.title}
                        </p>
                        <p style={{ margin: "4px 0 0", fontSize: 13, color: "#6b7280" }}>
                          {time} • {TYPE_LABELS[ev.type] || ev.type}
                        </p>
                        {ev.description && (
                          <p style={{ margin: "8px 0 0", fontSize: 13, color: "#4b5563", lineHeight: 1.5 }}>
                            {ev.description}
                          </p>
                        )}
                      </div>
                      <div style={{ display: "flex", gap: 6, flexShrink: 0, marginLeft: 8 }} onClick={(e) => e.stopPropagation()}>
                        {canManageEvents && ev.source === "manual" && (
                          <button
                            onClick={() => onEdit?.(ev)}
                            style={{
                              border: "none", background: "white", borderRadius: 8,
                              padding: "6px 8px", cursor: "pointer", color: colors.text,
                              display: "flex", alignItems: "center",
                            }}
                            title="Edit"
                          >
                            <Edit3 size={14} />
                          </button>
                        )}
                        {canManageEvents && ev.source === "manual" && (
                          <button
                            onClick={() => onDelete?.(ev.id)}
                            disabled={deleteLoading === ev.id}
                            style={{
                              border: "none", background: "white", borderRadius: 8,
                              padding: "6px 8px", cursor: "pointer", color: "#ef4444",
                              display: "flex", alignItems: "center", opacity: deleteLoading === ev.id ? 0.5 : 1,
                            }}
                            title="Delete"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              {canManageEvents && onAddEvent && (
                <div style={{ marginTop: 12, textAlign: "center" }}>
                  <button
                    className="btn-primary"
                    onClick={onAddEvent}
                    style={{ padding: "8px 20px", fontSize: 13 }}
                  >
                    Add Another Event
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
