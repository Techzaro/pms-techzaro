import React from "react";
import { useTranslation } from "react-i18next";
import { RotateCcw, ArrowRightLeft, Lock } from "lucide-react";

export const STATUS_COLORS = {
  Pending: "#FEF3C7",
  "In Progress": "#DBEAFE",
  Paused: "#FEF3C7",
  Submitted: "#DBEAFE",
  Approved: "#DCFCE7",
  Declined: "#FEE2E2",
  Abandoned: "#FEE2E2",
  pending: "#FEF3C7",
  in_progress: "#DBEAFE",
  "in-progress": "#DBEAFE",
  paused: "#FEF3C7",
  submitted: "#DBEAFE",
  reopened: "#FEF3C7",
  approved: "#DCFCE7",
  rejected: "#FEE2E2",
  declined: "#FEE2E2",
  abandon_requested: "#FEF3C7",
  abandoned: "#FEE2E2",
  Planning: "#FEF3C7",
  Completed: "#DCFCE7",
  Pause: "#FEF3C7",
};

export const STATUS_TEXT_COLORS = {
  Pending: "#92400E",
  "In Progress": "#1E40AF",
  Paused: "#92400E",
  Submitted: "#1E40AF",
  Approved: "#166534",
  Declined: "#991B1B",
  Abandoned: "#991B1B",
  pending: "#92400E",
  in_progress: "#1E40AF",
  "in-progress": "#1E40AF",
  paused: "#92400E",
  submitted: "#1E40AF",
  reopened: "#92400E",
  approved: "#166534",
  rejected: "#991B1B",
  declined: "#991B1B",
  abandon_requested: "#92400E",
  abandoned: "#991B1B",
  Planning: "#92400E",
  Completed: "#166534",
  Pause: "#92400E",
};

export const STATUS_LABELS = {
  Pending: "Pending",
  "In Progress": "In Progress",
  Paused: "Paused",
  Submitted: "Submitted",
  Completed: "Completed",
  Approved: "Completed",
  Declined: "Declined",
  Abandoned: "Abandoned",
  pending: "Pending",
  in_progress: "In Progress",
  "in-progress": "In Progress",
  paused: "Paused",
  submitted: "Submitted",
  reopened: "Pending",
  approved: "Completed",
  completed: "Completed",
  rejected: "Declined",
  declined: "Declined",
  abandon_requested: "Abandon Requested",
  abandoned: "Abandoned",
  Planning: "Pending",
  Pause: "Paused",
};

export function formatStatus(status) {
  if (!status) return "Pending";
  return STATUS_LABELS[status] || String(status).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * TaskMultiStatusBadges (SRS Section 10)
 * Prominently displays ONLY the Current Status without string concatenation.
 * Modifier states (Reopened, Transferred, Assigner Locked) are displayed as subtle independent icons.
 * Uses defensive CSS layout to prevent text overlap.
 */
export default function TaskMultiStatusBadges({ item }) {
  const { t } = useTranslation();
  if (!item) return null;

  // The primary badge text and color MUST strictly and ONLY evaluate task.status.
  // Reopened tasks or tasks flagged as reopened evaluate to pending.
  const taskStatus = item?.status || "Pending";
  const normalizedKey = String(taskStatus).toLowerCase();
  const rawStatus = (normalizedKey === "reopened" || item?.is_reopened) && (normalizedKey === "reopened" || normalizedKey === "declined" || normalizedKey === "rejected")
    ? "pending"
    : (normalizedKey === "reopened" ? "pending" : taskStatus);
  const statusKey = String(rawStatus).toLowerCase();
  const primaryBg = STATUS_COLORS[rawStatus] || STATUS_COLORS[statusKey] || "#F3F4F6";
  const primaryColor = STATUS_TEXT_COLORS[rawStatus] || STATUS_TEXT_COLORS[statusKey] || "#374151";
  const primaryLabel = formatStatus(rawStatus);

  // Subtle Reopened Indicator
  const isReopened = Boolean(
    (Array.isArray(item?.states) && item.states.some((s) => String(s).toLowerCase() === "reopened")) ||
    item?.is_reopened ||
    item?.reopened_at ||
    (item?.reopen_count && item.reopen_count > 0)
  );

  // Subtle Transferred Indicator (SRS Section 5 & 10)
  const isTransferred = Boolean(
    (Array.isArray(item?.states) && item.states.some((s) => String(s).toLowerCase() === "transferred")) ||
    item?.is_transferred ||
    (Array.isArray(item?.delegation_chain) && item.delegation_chain.length > 0)
  );

  // Assigner Paused Lock Indicator
  const isAssignerPaused = Boolean(item?.assigner_paused);

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "8px",
        minWidth: 0,
        alignItems: "center",
      }}
    >
      {/* Prominent Primary Status Badge */}
      <span
        className="badge"
        style={{
          background: primaryBg,
          color: primaryColor,
          display: "inline-flex",
          alignItems: "center",
          gap: "5px",
          padding: "3px 9px",
          borderRadius: "6px",
          fontSize: "11px",
          fontWeight: 600,
          whiteSpace: "nowrap",
          flexShrink: 0,
        }}
      >
        <span
          className="dot"
          style={{
            background: primaryColor,
            width: "6px",
            height: "6px",
            borderRadius: "50%",
            display: "inline-block",
          }}
        />
        {t(primaryLabel)}
      </span>

      {/* Subtle Modifier Icons without text clutter */}
      {isReopened && (
        <span
          title={item?.reopen_count && item.reopen_count > 1 ? t("Reopened ({{count}}x)", { count: item.reopen_count, defaultValue: `Reopened (${item.reopen_count}x)` }) : t("Reopened", { defaultValue: "Reopened" })}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 20,
            height: 20,
            borderRadius: "50%",
            background: "#EDE9FE",
            color: "#6D28D9",
            border: "1px solid #DDD6FE",
            cursor: "help",
            flexShrink: 0,
          }}
        >
          <RotateCcw size={11} />
        </span>
      )}

      {isTransferred && (
        <span
          title={t("Transferred / Delegated", { defaultValue: "Transferred / Delegated" })}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 20,
            height: 20,
            borderRadius: "50%",
            background: "#E0E7FF",
            color: "#4338CA",
            border: "1px solid #C7D2FE",
            cursor: "help",
            flexShrink: 0,
          }}
        >
          <ArrowRightLeft size={11} />
        </span>
      )}

      {isAssignerPaused && (
        <span
          title={t("Paused by Assigner (Locked)", { defaultValue: "Paused by Assigner (Locked)" })}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 20,
            height: 20,
            borderRadius: "50%",
            background: "#FEF3C7",
            color: "#92400E",
            border: "1px solid #FDE68A",
            cursor: "help",
            flexShrink: 0,
          }}
        >
          <Lock size={11} />
        </span>
      )}
    </div>
  );
}
