import React from "react";
import { useTranslation } from "react-i18next";
import { RotateCcw, ArrowRightLeft, Lock, XCircle } from "lucide-react";
import { isDelegationRejectedByMe, isDelegationRevokedFromMe } from "../utils/delegationUtils";

export const STATUS_COLORS = {
  Pending: "#FEF3C7",
  "In Progress": "#DBEAFE",
  Paused: "#FFEDD5",
  Submitted: "#DBEAFE",
  Approved: "#DCFCE7",
  Declined: "#FEE2E2",
  Abandoned: "#FEE2E2",
  pending: "#FEF3C7",
  in_progress: "#DBEAFE",
  "in-progress": "#DBEAFE",
  paused: "#FFEDD5",
  submitted: "#DBEAFE",
  reopened: "#EDE9FE",
  approved: "#DCFCE7",
  rejected: "#FEE2E2",
  declined: "#FEE2E2",
  abandon_requested: "#FEF3C7",
  abandoned: "#FEE2E2",
  Planning: "#FEF3C7",
  Completed: "#DCFCE7",
  Pause: "#FFEDD5",
};

export const STATUS_TEXT_COLORS = {
  Pending: "#92400E",
  "In Progress": "#1E40AF",
  Paused: "#C2410C",
  Submitted: "#1E40AF",
  Approved: "#166534",
  Declined: "#991B1B",
  Abandoned: "#991B1B",
  pending: "#92400E",
  in_progress: "#1E40AF",
  "in-progress": "#1E40AF",
  paused: "#C2410C",
  submitted: "#1E40AF",
  reopened: "#5B21B6",
  approved: "#166534",
  rejected: "#991B1B",
  declined: "#991B1B",
  abandon_requested: "#92400E",
  abandoned: "#991B1B",
  Planning: "#92400E",
  Completed: "#166534",
  Pause: "#C2410C",
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
  "Abandon Requested": "Abandon Requested",
  pending: "Pending",
  in_progress: "In Progress",
  "in-progress": "In Progress",
  acknowledged: "In Progress",
  paused: "Paused",
  submitted: "Submitted",
  submitted_late: "Submitted",
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

/**
 * Strict helper to determine the primary effective status.
 * Assigner paused takes highest priority and evaluates to "paused".
 */
export function getEffectiveStatus(item) {
  if (!item) return "pending";
  if (item?.assigner_paused) {
    return "paused";
  }
  if (
    item?.submission_stage === "awaiting_checkpoint" &&
    !["completed", "approved", "declined", "abandoned"].includes(String(item?.status || "").toLowerCase())
  ) {
    return "in_progress";
  }
  const st = String(item?.my_status || item?.status || "pending").toLowerCase().trim();
  if (st === "pause" || st === "hold" || st === "on_hold" || st === "on hold" || st === "on-hold") return "paused";
  if (st === "in-progress" || st === "in progress" || st === "acknowledged" || st === "doing" || st === "working" || st === "underway") return "in_progress";
  if (st === "submitted_late" || st === "review" || st === "in_review" || st === "under_review") return "submitted";
  if (["completed", "done", "finished"].includes(st)) return "approved";
  if (["rejected", "failed"].includes(st)) return "declined";
  if (["abandon_requested", "cancelled", "canceled"].includes(st)) return "abandoned";
  if (["planned", "planning", "draft", "todo", "to_do", "new", "not_started", "not started", "unassigned"].includes(st)) return "pending";
  if (st === "reopened") return "pending";
  return st || "pending";
}

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

  // The primary badge text and color strictly evaluates latest effective status.
  const rawStatus = getEffectiveStatus(item);
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

  // Delegation Rejected Indicator
  const isDelegationRejected = isDelegationRejectedByMe(item);
  // Delegation Revoked Indicator
  const isDelegationRevoked = isDelegationRevokedFromMe(item);

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
      {isDelegationRejected && (
        <span
          title={t("Transfer Rejected by You", { defaultValue: "Transfer Rejected by You" })}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 20,
            height: 20,
            borderRadius: "50%",
            background: "#FEE2E2",
            color: "#DC2626",
            border: "1px solid #FCA5A5",
            cursor: "help",
            flexShrink: 0,
          }}
        >
          <XCircle size={11} />
        </span>
      )}

      {isDelegationRevoked && (
        <span
          title={t("Transfer Revoked by Assigner", { defaultValue: "Transfer Revoked by Assigner" })}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 20,
            height: 20,
            borderRadius: "50%",
            background: "#FEF3C7",
            color: "#B45309",
            border: "1px solid #FCD34D",
            cursor: "help",
            flexShrink: 0,
          }}
        >
          <XCircle size={11} />
        </span>
      )}

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

      {isTransferred && !isDelegationRejected && !isDelegationRevoked && (
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
