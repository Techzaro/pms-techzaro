import React from "react";
import { useTranslation } from "react-i18next";

const AVATAR_PALETTE = [
  { bg: "#E0E7FF", text: "#4338CA" },
  { bg: "#FEE2E2", text: "#B91C1C" },
  { bg: "#DCFCE7", text: "#22C55E" },
  { bg: "#FEF3C7", text: "#D97706" },
  { bg: "#EDE9FE", text: "#7C3AED" },
  { bg: "#FCE7F3", text: "#DB2777" },
  { bg: "#E0F2FE", text: "#0369A1" },
  { bg: "#F3E8FF", text: "#9333EA" },
];

export const getAssigneeColors = (id) => {
  const num = typeof id === "string" ? parseInt(id.replace(/\D/g, ""), 10) || 0 : id || 0;
  return AVATAR_PALETTE[Math.abs(num) % AVATAR_PALETTE.length];
};

export const getAssigneeInitials = (name) => {
  if (!name) return "??";
  return name
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .substring(0, 2)
    .toUpperCase();
};

/**
 * Renders an assignee or multi-assignee stack (Jira style) in table cells.
 */
const TaskAssigneeCell = ({
  assignees: rawAssignees,
  assignee: singleAssignee,
  isDirectToOa = false,
  currentOwnerName = null,
  delegatorName = null,
  isTransferee = false,
  fallbackName = null,
  maxAvatars = 3,
  avatarSize = 28,
  showRole = true,
  className = "",
  style = {},
}) => {
  const { t } = useTranslation();

  // Normalize assignees array
  let assigneesList = [];
  if (isDirectToOa && currentOwnerName) {
    assigneesList = [{ name: currentOwnerName }];
  } else if (Array.isArray(rawAssignees) && rawAssignees.length > 0) {
    assigneesList = rawAssignees.filter(Boolean);
  } else if (singleAssignee) {
    assigneesList = [singleAssignee];
  }

  const count = assigneesList.length;

  if (count === 0) {
    const unassignedLabel = fallbackName || t("Unassigned", { defaultValue: "Unassigned" });
    return (
      <div className={`assignee-cell-container ${className}`} style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0, ...style }}>
        <div
          className="avatar"
          style={{
            background: "#F3F4F6",
            color: "#9CA3AF",
            width: `${avatarSize}px`,
            height: `${avatarSize}px`,
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "11px",
            fontWeight: 600,
            flexShrink: 0,
          }}
        >
          -
        </div>
        <div style={{ minWidth: 0, overflow: "hidden" }}>
          <div className="user-name" style={{ fontSize: "13px", color: "var(--text-secondary, #9CA3AF)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {unassignedLabel}
          </div>
        </div>
      </div>
    );
  }

  // Single assignee
  if (count === 1) {
    const a = assigneesList[0];
    const c = getAssigneeColors(a.id || 0);
    const displayName = a.name || fallbackName || t("Unassigned", { defaultValue: "Unassigned" });
    const displayRole = a.role ? t(a.role, { defaultValue: a.role.replace(/_/g, " ") }) : "";

    return (
      <div className={`assignee-cell-container ${className}`} style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0, ...style }}>
        <div
          className="avatar"
          title={`${displayName}${displayRole ? ` (${displayRole})` : ""}`}
          style={{
            background: c.bg,
            color: c.text,
            width: `${avatarSize}px`,
            height: `${avatarSize}px`,
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: avatarSize <= 28 ? "11px" : "12px",
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {getAssigneeInitials(displayName)}
        </div>
        <div style={{ minWidth: 0, overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <div className="user-name" title={displayName} style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "160px" }}>
              {displayName}
            </div>
            {isTransferee && (
              <span style={{ fontSize: "10px", fontWeight: 600, color: "#6B7280", background: "#F3F4F6", padding: "1px 6px", borderRadius: "4px", border: "1px solid #D1D5DB", flexShrink: 0 }}>
                {t("Transferee", { defaultValue: "Transferee" })}
              </span>
            )}
          </div>
          {showRole && displayRole && (
            <div className="user-role" style={{ fontSize: "11px", color: "var(--text-secondary, #9CA3AF)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {displayRole}
            </div>
          )}
          {isDirectToOa && delegatorName && (
            <div style={{ fontSize: "11px", color: "var(--text-secondary, #9CA3AF)", marginTop: "1px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {t("via {{name}}", { name: delegatorName, defaultValue: `via ${delegatorName}` })}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Multi-assignee Jira-style grouped stack
  const visible = assigneesList.slice(0, maxAvatars);
  const remainingCount = assigneesList.length - maxAvatars;
  const allNames = assigneesList.map((a) => a.name || t("User", { defaultValue: "User" })).join(", ");
  const remainingNames = remainingCount > 0 ? assigneesList.slice(maxAvatars).map((a) => a.name || t("User", { defaultValue: "User" })).join(", ") : "";

  return (
    <div className={`assignee-cell-container multi-assignee ${className}`} style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0, ...style }}>
      {/* Overlapping Avatar Stack */}
      <div style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
        {visible.map((a, i) => {
          const c = getAssigneeColors(a.id || i);
          const tooltip = `${a.name || t("User", { defaultValue: "User" })}${a.role ? ` (${t(a.role, { defaultValue: a.role.replace(/_/g, " ") })})` : ""}`;
          return (
            <div
              key={a.id || i}
              className="avatar"
              title={tooltip}
              style={{
                background: c.bg,
                color: c.text,
                width: `${avatarSize}px`,
                height: `${avatarSize}px`,
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "10px",
                fontWeight: 700,
                marginLeft: i > 0 ? "-8px" : "0",
                zIndex: maxAvatars - i,
                border: "2px solid var(--bg-card, #ffffff)",
                boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
                flexShrink: 0,
                cursor: "default",
              }}
            >
              {getAssigneeInitials(a.name)}
            </div>
          );
        })}
        {remainingCount > 0 && (
          <div
            className="avatar multi-assignee-more"
            title={remainingNames}
            style={{
              background: "#E5E7EB",
              color: "#374151",
              width: `${avatarSize}px`,
              height: `${avatarSize}px`,
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "10px",
              fontWeight: 700,
              marginLeft: "-8px",
              zIndex: 0,
              border: "2px solid var(--bg-card, #ffffff)",
              boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
              flexShrink: 0,
              cursor: "help",
            }}
          >
            +{remainingCount}
          </div>
        )}
      </div>

      {/* Text Info */}
      <div style={{ minWidth: 0, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <div
            className="user-name"
            title={allNames}
            style={{
              fontSize: "13px",
              fontWeight: 600,
              color: "var(--text-primary)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              maxWidth: "150px",
            }}
          >
            {allNames}
          </div>
          {isTransferee && (
            <span style={{ fontSize: "10px", fontWeight: 600, color: "#6B7280", background: "#F3F4F6", padding: "1px 6px", borderRadius: "4px", border: "1px solid #D1D5DB", flexShrink: 0 }}>
              {t("Transferee", { defaultValue: "Transferee" })}
            </span>
          )}
        </div>
        {showRole && (
          <div
            className="user-role"
            style={{
              fontSize: "11px",
              color: "var(--text-secondary, #9CA3AF)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {count} {t("Assignees", { defaultValue: "Assignees" })}
          </div>
        )}
        {isDirectToOa && delegatorName && (
          <div style={{ fontSize: "11px", color: "var(--text-secondary, #9CA3AF)", marginTop: "1px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {t("via {{name}}", { name: delegatorName, defaultValue: `via ${delegatorName}` })}
          </div>
        )}
      </div>
    </div>
  );
};

export default TaskAssigneeCell;
