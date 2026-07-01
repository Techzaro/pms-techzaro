/**
 * EventInfoPopup.jsx
 * Read-only popup modal that displays detailed information about a calendar event.
 * Shows title, description, date/time, assigned users, creator, and creation date.
 */

import { createPortal } from "react-dom";
import { useEscapeKey } from "../hooks/useEscapeKey";
import { formatEventDate, formatEventTime } from "../utils/formatDateTime";

/**
 * Popup displaying event details in a read-only format.
 * @param {Object} event - The event object to display
 * @param {Function} onClose - Callback to close the popup
 */
function EventInfoPopup({ event, onClose }) {
  useEscapeKey(true, onClose);

  if (!event) return null;

  const time = formatEventTime(event);

  const endTime = event.end_date && !event.all_day
    ? formatEventTime({ ...event, start_date: event.end_date })
    : null;

  const dateStr = formatEventDate(event);

  const assignedNames = event.assigned_users && event.assigned_users.length > 0
    ? event.assigned_users.map(u => u.name).join(", ")
    : null;

  const creatorName = event.creator_name || event.user_name || "—";
  const createdAt = event.created_at
    ? new Date(event.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })
    : "—";

  return createPortal(
    <div style={{
      position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.45)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 10003, padding: 16,
    }}>
      <div style={{
        background: "#fff", borderRadius: 20, width: "100%",
        maxWidth: 420, boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
        overflow: "hidden",
      }} onClick={(e) => e.stopPropagation()}>
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "flex-start",
          padding: "24px 24px 0",
        }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#111827", wordBreak: "break-word", flex: 1 }}>
            {event.title}
          </h2>
          <button
            onClick={onClose}
            style={{
              background: "none", border: "none", fontSize: 24, color: "#9ca3af",
              cursor: "pointer", lineHeight: 1, padding: "0 0 0 12px", flexShrink: 0,
            }}
          >
            ×
          </button>
        </div>

        {event.description && (
          <p style={{ margin: "12px 24px 0", fontSize: 14, color: "#6b7280", lineHeight: 1.6 }}>
            {event.description}
          </p>
        )}

        <div style={{ padding: "20px 24px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <span style={{ fontSize: 12, fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.5px" }}>Date</span>
            <p style={{ margin: "4px 0 0", fontSize: 14, color: "#374151" }}>{dateStr}</p>
          </div>

          <div>
            <span style={{ fontSize: 12, fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.5px" }}>Time</span>
            <p style={{ margin: "4px 0 0", fontSize: 14, color: "#374151" }}>
              {endTime ? `${time} - ${endTime}` : time}
            </p>
          </div>

          <div>
            <span style={{ fontSize: 12, fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.5px" }}>Assigned To</span>
            <p style={{ margin: "4px 0 0", fontSize: 14, color: "#374151" }}>
              {event.is_global ? "All Users" : (assignedNames || "—")}
            </p>
          </div>

          <div>
            <span style={{ fontSize: 12, fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.5px" }}>Created By</span>
            <p style={{ margin: "4px 0 0", fontSize: 14, color: "#374151" }}>{creatorName}</p>
          </div>

          <div>
            <span style={{ fontSize: 12, fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.5px" }}>Created At</span>
            <p style={{ margin: "4px 0 0", fontSize: 14, color: "#374151" }}>{createdAt}</p>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default EventInfoPopup;
