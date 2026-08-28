/**
 * ItemDetailPopup.jsx
 * Modal popup that displays detailed information about a calendar item
 * (manual event, task, subtask, or project). Shows metadata based on
 * source type and provides navigation to full detail pages.
 */

import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useEscapeKey } from "../hooks/useEscapeKey";
import { formatLocalDate, formatLocalTime, convertToLocal, getUserTimezone } from "../utils/timezoneUtils";

/** Icon mapping for each item source type */
const SOURCE_ICONS = {
  manual: "📅",
  task: "📋",
  deliverable: "📦",
  project: "🚀",
};

const SOURCE_COLORS = {
  task: { bg: "#eff6ff", text: "#3b82f6", border: "#bfdbfe" },
  project: { bg: "#f5f3ff", text: "#8b5cf6", border: "#ddd6fe" },
  deliverable: { bg: "#f0fdf4", text: "#16a34a", border: "#bbf7d0" },
  manual: { bg: "#eef2ff", text: "#6366f1", border: "#c7d2fe" },
};

/**
 * Displays a detail popup for a calendar item (event, task, subtask, or project).
 * @param {Object} item - The calendar item to display.
 * @param {string} role - Current user role (admin, manager, etc.).
 * @param {Function} onClose - Callback to close the popup.
 * @param {Function} [onEdit] - Callback to edit a manual event (admin/manager only).
 */
function ItemDetailPopup({ item, role, onClose, onEdit }) {
  const { t } = useTranslation();
  useEscapeKey(true, onClose);

  const navigate = useNavigate();
  if (!item) return null;

  const source = item.source || "manual";
  const icon = SOURCE_ICONS[source] || "📅";
  const colors = SOURCE_COLORS[source] || SOURCE_COLORS.manual;
  const typeLabel = source === "manual" ? t("Event", { defaultValue: "Event" }) : source === "deliverable" ? t("Subtask", { defaultValue: "Subtask" }) : t(source.charAt(0).toUpperCase() + source.slice(1));
  const canManage = ["admin", "manager"].includes(role);

  // Extract the numeric ID by stripping the type prefix (e.g. "task-123" -> "123")
  const rawId = item.id ? String(item.id).replace(/^(task|project|deliverable)-/, "") : null;

  /** Navigate to the full detail page for tasks, projects, or subtasks */
  const handleViewDetails = () => {
    if (!rawId) return;
    let path;
    let from;
    if (source === "task") { path = `/${role}/tasks/task-details/${rawId}`; from = "tasks"; }
    else if (source === "project") { path = `/${role}/projects/project-details/${rawId}`; from = "projects"; }
    else if (source === "deliverable") { path = `/${role}/deliveries/deliverable-details/${rawId}`; from = "deliveries"; }
    else return;
    onClose();
    navigate(`${path}?from=${from}`, { state: { from } });
  };

  const viewerTz = getUserTimezone() || "UTC";

  /** Format a date string using timezoneUtils */
  const formatDateStr = (dateStr) => {
    if (!dateStr) return "—";
    return formatLocalDate(dateStr, viewerTz);
  };

  const formatTimeStr = (dateStr) => {
    if (!dateStr) return "—";
    return formatLocalTime(dateStr, viewerTz);
  };

  /** Render metadata rows specific to each source type */
  const renderMeta = () => {
    switch (source) {
      case "manual": {
        const isAllDay = Boolean(item.all_day);
        const time = isAllDay ? t("All Day", { defaultValue: "All Day" }) : formatTimeStr(item.start_date);
        const endTime = item.end_date && !isAllDay ? formatTimeStr(item.end_date) : null;
        const assignedNames = item.assigned_users && item.assigned_users.length > 0
          ? item.assigned_users.map((u) => u.name).join(", ")
          : item.is_global ? t("All Users", { defaultValue: "All Users" }) : null;

        const origTz = item.event_timezone || item.timezone;
        const hasDualTz = Boolean(origTz && origTz !== viewerTz);
        const origTime = origTz && !isAllDay ? formatLocalTime(item.start_date, origTz) : null;
        const origEndTime = origTz && !isAllDay && item.end_date ? formatLocalTime(item.end_date, origTz) : null;

        return (
          <>
            <MetaRow label={t("Date", { defaultValue: "Date" })} value={formatDateStr(item.start_date)} />
            <MetaRow
              label={t("Time", { defaultValue: "Time" })}
              value={
                <div>
                  <div>{endTime ? `${time} - ${endTime}` : time} <span style={{ fontSize: 11, color: "var(--color-primary, #4f46e5)" }}>({viewerTz})</span></div>
                  {hasDualTz && (
                    <div style={{ fontSize: 11, color: "var(--text-muted, #64748b)", marginTop: 2 }}>
                      {t("Original", { defaultValue: "Original" })}: {origEndTime ? `${origTime} - ${origEndTime}` : origTime} ({origTz})
                    </div>
                  )}
                </div>
              }
            />
            {item.description && <MetaRow label={t("Description", { defaultValue: "Description" })} value={item.description} />}
            {assignedNames && <MetaRow label={t("Assigned To", { defaultValue: "Assigned To" })} value={assignedNames} />}
            <MetaRow label={t("Created By", { defaultValue: "Created By" })} value={item.creator_name || item.user_name || "—"} />
          </>
        );
      }
      case "task": {
        const startDate = item.start_date ? formatDateStr(item.start_date) : null;
        const endDate = item.end_date ? formatDateStr(item.end_date) : null;
        const dueLabel = startDate && endDate && startDate !== endDate ? `${startDate} - ${endDate}` : (endDate || startDate || "—");
        const timeStr = item.end_date ? formatTimeStr(item.end_date) : (item.start_date ? formatTimeStr(item.start_date) : null);
        const priorityColor = (item.priority || "").toLowerCase() === "high" ? "#ef4444" : (item.priority || "").toLowerCase() === "medium" ? "#f59e0b" : "#6b7280";
        return (
          <>
            <MetaRow label={t("Status", { defaultValue: "Status" })} value={item.status ? t(item.status) : "—"} />
            {item.priority && (
              <MetaRow label={t("Priority", { defaultValue: "Priority" })} value={t(item.priority)} valueStyle={{ color: priorityColor, fontWeight: 600 }} />
            )}
            <MetaRow label={t("Due Date", { defaultValue: "Due Date" })} value={timeStr ? `${dueLabel}, ${timeStr}` : dueLabel} />
            {item.assignee_name && <MetaRow label={t("Assigned To", { defaultValue: "Assigned To" })} value={item.assignee_name} />}
            {item.project_title && <MetaRow label={t("Project", { defaultValue: "Project" })} value={item.project_title} />}
            {item.assigner_name && <MetaRow label={t("Assigned By", { defaultValue: "Assigned By" })} value={item.assigner_name} />}
            {item.description && <MetaRow label={t("Description", { defaultValue: "Description" })} value={item.description} />}
          </>
        );
      }
      case "deliverable": {
        const dueLabel = formatDateStr(item.start_date || item.date);
        const timeStr = item.start_date ? formatTimeStr(item.start_date) : null;
        return (
          <>
            <MetaRow label={t("Status", { defaultValue: "Status" })} value={item.status ? t(item.status) : "—"} />
            <MetaRow label={t("Due Date", { defaultValue: "Due Date" })} value={timeStr ? `${dueLabel}, ${timeStr}` : dueLabel} />
            {item.assigned_by_name && <MetaRow label={t("Assigned To", { defaultValue: "Assigned To" })} value={item.assigned_by_name} />}
            {item.project_title && <MetaRow label={t("Project", { defaultValue: "Project" })} value={item.project_title} />}
            {item.task_id && <MetaRow label={t("Related Task", { defaultValue: "Related Task" })} value={t("Task #{{id}}", { defaultValue: `Task #${item.task_id}`, id: item.task_id })} />}
            {item.description && <MetaRow label={t("Description", { defaultValue: "Description" })} value={item.description} />}
          </>
        );
      }
      case "project": {
        const dueLabel = formatDateStr(item.end_date || item.start_date || item.date);
        return (
          <>
            <MetaRow label={t("Status", { defaultValue: "Status" })} value={item.status ? t(item.status) : "—"} />
            <MetaRow label={t("Due Date", { defaultValue: "Due Date" })} value={dueLabel} />
            {item.creator_name && <MetaRow label={t("Project Manager", { defaultValue: "Project Manager" })} value={item.creator_name} />}
            {item.description && <MetaRow label={t("Description", { defaultValue: "Description" })} value={item.description} />}
          </>
        );
      }
      default:
        return null;
    }
  };

  return createPortal(
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.45)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 10003, padding: 16,
      }}
    >
      <div
        style={{
          background: "var(--bg-card)", borderRadius: 20, width: "100%",
          maxWidth: 420, boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "flex-start",
          padding: "24px 24px 0",
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 20 }}>{icon}</span>
              <span style={{
                fontSize: 11, fontWeight: 600, color: "#fff",
                background: colors.text, borderRadius: 10,
                padding: "2px 10px", textTransform: "uppercase",
                letterSpacing: "0.3px",
              }}>
                {typeLabel}
              </span>
            </div>
            <h2 style={{
              margin: "4px 0 0", fontSize: 20, fontWeight: 700,
              color: "var(--text-heading)", wordBreak: "break-word",
            }}>
              {item.title}
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

        {/* Meta rows */}
        <div style={{ padding: "20px 24px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
          {renderMeta()}
        </div>

        {/* Edit Event button (admin/manager only) */}
        {source === "manual" && canManage && onEdit && (
          <div style={{ padding: "0 24px 24px" }}>
            <button
              onClick={() => { onClose(); onEdit(item); }}
              style={{
                width: "100%", padding: "10px 0", borderRadius: 12, border: "none",
                background: colors.text, color: "#fff", fontSize: 14, fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {t("Edit Event", { defaultValue: "Edit Event" })}
            </button>
          </div>
        )}

        {/* View Details button */}
        {source !== "manual" && rawId && (
          <div style={{ padding: "0 24px 24px" }}>
            <button
              onClick={handleViewDetails}
              style={{
                width: "100%", padding: "10px 0", borderRadius: 12, border: "none",
                background: colors.text, color: "#fff", fontSize: 14, fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {t("View Details", { defaultValue: "View Details" })}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

/**
 * Renders a single label/value metadata row in the popup.
 * @param {string} label - The field label.
 * @param {*} value - The field value to display.
 * @param {Object} [valueStyle] - Optional inline styles for the value.
 */
function MetaRow({ label, value, valueStyle }) {
  if (!value) return null;
  return (
    <div>
      <span style={{
        fontSize: 12, fontWeight: 600, color: "var(--text-muted)",
        textTransform: "uppercase", letterSpacing: "0.5px",
      }}>
        {label}
      </span>
      <p style={{ margin: "4px 0 0", fontSize: 14, color: "var(--text-dark)", whiteSpace: "pre-wrap", ...valueStyle }}>
        {value}
      </p>
    </div>
  );
}

export default ItemDetailPopup;
