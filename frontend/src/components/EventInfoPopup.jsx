/**
 * EventInfoPopup.jsx
 * Read-only popup modal that displays detailed information about a calendar event.
 * Shows title, description, dual timezone date/time, assigned users, creator, and creation date.
 */

import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useEscapeKey } from "../hooks/useEscapeKey";
import { formatLocalDate, formatLocalTime, formatReadableDateTime, convertToLocal, getUserTimezone } from "../utils/timezoneUtils";
import { Globe, Clock, Megaphone, Calendar } from "lucide-react";

/**
 * Popup displaying event details in a read-only format with Dual Timezone support (SRS Sec 12).
 * @param {Object} event - The event object to display
 * @param {Function} onClose - Callback to close the popup
 */
function EventInfoPopup({ event, onClose }) {
  const { t } = useTranslation();
  useEscapeKey(true, onClose);

  if (!event) return null;

  const viewerTz = getUserTimezone() || "UTC";
  const origTz = event.event_timezone || event.timezone || null;

  // Local Timezone calculation
  const isAllDay = Boolean(event.all_day);
  const localDateStr = formatLocalDate(event.start_date, viewerTz);

  const localStartTime = !isAllDay ? formatLocalTime(event.start_date, viewerTz) : t("All Day", { defaultValue: "All Day" });
  const localEndTime = !isAllDay && event.end_date ? formatLocalTime(event.end_date, viewerTz) : null;
  const localTimeRange = localEndTime ? `${localStartTime} - ${localEndTime}` : localStartTime;

  // Original Timezone calculation (if different or present)
  const hasDualTimezone = Boolean(origTz && origTz !== viewerTz);
  const origStartTime = origTz && !isAllDay ? formatLocalTime(event.start_date, origTz) : null;
  const origEndTime = origTz && !isAllDay && event.end_date ? formatLocalTime(event.end_date, origTz) : null;
  const origTimeRange = origEndTime ? `${origStartTime} - ${origEndTime}` : origStartTime;
  const origDateStr = origTz ? formatLocalDate(event.start_date, origTz) : null;

  const assignedNames = event.assigned_users && event.assigned_users.length > 0
    ? event.assigned_users.map((u) => u.name).join(", ")
    : null;

  const creatorName = event.creator_name || event.user_name || "—";
  const createdAt = event.created_at
    ? formatReadableDateTime(event.created_at, viewerTz)
    : "—";

  return createPortal(
    <div style={{
      position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.45)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 10003, padding: 16,
    }}>
      <div style={{
        background: "var(--bg-card)", borderRadius: 20, width: "100%",
        maxWidth: 440, boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
        overflow: "hidden",
      }} onClick={(e) => e.stopPropagation()}>
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "flex-start",
          padding: "24px 24px 0",
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", gap: "6px", alignItems: "center", marginBottom: "8px", flexWrap: "wrap" }}>
              {event.type === "announcement" || event.type === "Company Announcement" ? (
                <span style={{ fontSize: "11px", fontWeight: 700, color: "#d97706", background: "#fef3c7", padding: "2px 8px", borderRadius: "4px", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                  <Megaphone size={12} /> {t("Company Announcement", { defaultValue: "Company Announcement" })}
                </span>
              ) : (
                <span style={{ fontSize: "11px", fontWeight: 700, color: event.category?.color || "#2563eb", background: "#eff6ff", padding: "2px 8px", borderRadius: "4px", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                  <Calendar size={12} /> {t("Event Invitation", { defaultValue: "Event Invitation" })}
                </span>
              )}
              {event.category?.name && (
                <span style={{ fontSize: "11px", fontWeight: 600, color: event.category?.color || "#475569", background: "var(--bg-hover)", padding: "2px 6px", borderRadius: "4px", border: "1px solid var(--border-color, #e2e8f0)" }}>
                  {event.category.name}
                </span>
              )}
            </div>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "var(--text-heading)", wordBreak: "break-word" }}>
              {event.title}
            </h2>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none", border: "none", fontSize: 24, color: "var(--text-muted)",
              cursor: "pointer", lineHeight: 1, padding: "0 0 0 12px", flexShrink: 0,
            }}
          >
            ×
          </button>
        </div>

        {event.description && (
          <div style={{ margin: "12px 24px 0", fontSize: 14, color: "#6b7280", lineHeight: 1.6 }} className="rte-display" dangerouslySetInnerHTML={{ __html: event.description }} />
        )}

        <div style={{ padding: "20px 24px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Dual Timezone Date & Time Presentation (SRS Sec 12) */}
          <div>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              {t("Date & Timing", { defaultValue: "Date & Timing" })}
            </span>
            <div style={{ marginTop: 6, padding: "10px 12px", background: "var(--bg-hover, #f8fafc)", borderRadius: 8, border: "1px solid var(--border-light, #e2e8f0)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, fontWeight: 600, color: "var(--text-dark)" }}>
                <Clock size={15} style={{ color: "var(--color-primary, #4f46e5)" }} />
                <span>{localDateStr} • {localTimeRange}</span>
              </div>
              <div style={{ marginTop: 2, fontSize: 11, color: "var(--color-primary, #4f46e5)", fontWeight: 500 }}>
                {t("Your local timezone: {{tz}}", { defaultValue: `Your local timezone: ${viewerTz}`, tz: viewerTz })}
              </div>

              {hasDualTimezone && (
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px dashed var(--border-light, #e2e8f0)", display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-secondary)" }}>
                  <Globe size={13} style={{ color: "#64748b" }} />
                  <span>
                    {t("Original", { defaultValue: "Original" })}: <strong>{origTimeRange}</strong> ({origDateStr}) — <em>{origTz}</em>
                  </span>
                </div>
              )}
            </div>
          </div>

          <div>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>{t("Assigned To", { defaultValue: "Assigned To" })}</span>
            <p style={{ margin: "4px 0 0", fontSize: 14, color: "var(--text-dark)" }}>
              {event.is_global ? t("All Users", { defaultValue: "All Users" }) : (assignedNames || "—")}
            </p>
          </div>

          <div>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>{t("Created By", { defaultValue: "Created By" })}</span>
            <p style={{ margin: "4px 0 0", fontSize: 14, color: "var(--text-dark)" }}>{creatorName}</p>
          </div>

          <div>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>{t("Created At", { defaultValue: "Created At" })}</span>
            <p style={{ margin: "4px 0 0", fontSize: 14, color: "var(--text-dark)" }}>{createdAt}</p>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default EventInfoPopup;

