import React from "react";
import { RotateCcw, ArrowUpRight, AlertOctagon, Lock } from "lucide-react";

export const STATUS_COLORS = {
  pending: "#FEF3C7",
  in_progress: "#DBEAFE",
  paused: "#FEF3C7",
  submitted: "#DBEAFE",
  reopened: "#EDE9FE",
  approved: "#DCFCE7",
  rejected: "#FEE2E2",
  abandon_requested: "#FEF3C7",
  abandoned: "#FEE2E2",
  Planning: "#DBEAFE",
  "In-progress": "#DBEAFE",
  Completed: "#DCFCE7",
  Pause: "#FEF3C7",
};

export const STATUS_TEXT_COLORS = {
  pending: "#92400E",
  in_progress: "#1E40AF",
  paused: "#92400E",
  submitted: "#1E40AF",
  reopened: "#5B21B6",
  approved: "#166534",
  rejected: "#991B1B",
  abandon_requested: "#92400E",
  abandoned: "#991B1B",
  Planning: "#1E40AF",
  "In-progress": "#1E40AF",
  Completed: "#166534",
  Pause: "#92400E",
};

export const STATUS_LABELS = {
  pending: "Pending",
  in_progress: "In Progress",
  paused: "Paused",
  submitted: "Submitted",
  reopened: "Reopened",
  approved: "Approved",
  rejected: "Rejected",
  abandon_requested: "Abandon Requested",
  abandoned: "Abandoned",
  Planning: "Planning",
  "In-progress": "In Progress",
  Completed: "Completed",
  Pause: "Paused",
};

export function formatStatus(status) {
  if (!status) return "Pending";
  return STATUS_LABELS[status] || status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * TaskMultiStatusBadges
 * Renders the primary status badge and conditionally renders smaller secondary
 * badges for Reopened, Transferred, and Abandoned states.
 */
export default function TaskMultiStatusBadges({ item }) {
  if (!item) return null;

  const currentStatus = (item.status || "pending").toLowerCase();
  const primaryBg = STATUS_COLORS[item.status] || STATUS_COLORS[currentStatus] || "#F3F4F6";
  const primaryColor = STATUS_TEXT_COLORS[item.status] || STATUS_TEXT_COLORS[currentStatus] || "#374151";
  const primaryLabel = formatStatus(item.status);

  // 1. Check if task was reopened in its lifecycle (when primary status is not 'reopened')
  const isReopenedHistory =
    currentStatus !== "reopened" &&
    Boolean(
      item.is_reopened ||
      item.reopened_at ||
      (item.reopen_count && item.reopen_count > 0) ||
      item.reopen_reason ||
      (Array.isArray(item.status_history) && item.status_history.some((h) => (h.status || h.action) === "reopened")) ||
      (Array.isArray(item.submissions) && item.submissions.some((s) => s.status === "reopened" || s.reopened_at))
    );

  // 2. Check if task was transferred/delegated
  const isTransferredHistory = Boolean(
    item.is_transferred ||
    (Array.isArray(item.delegation_chain) && item.delegation_chain.length > 0) ||
    (item.delegation_count && item.delegation_count > 0) ||
    (Array.isArray(item.status_history) && item.status_history.some((h) => (h.status || h.action) === "transferred"))
  );

  // 3. Check if task has abandoned history (when primary status is not 'abandoned' / 'abandon_requested')
  const isAbandonedHistory =
    currentStatus !== "abandoned" &&
    currentStatus !== "abandon_requested" &&
    Boolean(
      item.is_abandoned ||
      item.abandoned_at ||
      item.abandon_reason ||
      (Array.isArray(item.status_history) &&
        item.status_history.some((h) => (h.status || h.action) === "abandoned" || (h.status || h.action) === "abandon_requested"))
    );

  // 4. Assigner paused on hold
  const isHold = Boolean(item.assigner_paused);

  const secondaryBadges = [];

  if (isReopenedHistory) {
    secondaryBadges.push({
      key: "reopened",
      label: item.reopen_count && item.reopen_count > 1 ? `Reopened (${item.reopen_count}x)` : "Reopened",
      bg: "#EDE9FE",
      color: "#5B21B6",
      border: "#DDD6FE",
      icon: <RotateCcw size={10} />,
    });
  }

  if (isTransferredHistory) {
    secondaryBadges.push({
      key: "transferred",
      label: "Transferred",
      bg: "#E0E7FF",
      color: "#3730A3",
      border: "#C7D2FE",
      icon: <ArrowUpRight size={10} />,
    });
  }

  if (isAbandonedHistory) {
    secondaryBadges.push({
      key: "abandoned",
      label: "Abandoned",
      bg: "#FEE2E2",
      color: "#991B1B",
      border: "#FECACA",
      icon: <AlertOctagon size={10} />,
    });
  }

  if (isHold) {
    secondaryBadges.push({
      key: "on_hold",
      label: "On Hold",
      bg: "#FEF3C7",
      color: "#92400E",
      border: "#FDE68A",
      icon: <Lock size={10} />,
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "4px", alignItems: "flex-start" }}>
      {/* Primary Status Badge */}
      <span className="badge" style={{ background: primaryBg, color: primaryColor }}>
        <span className="dot" style={{ background: primaryColor }}></span>
        {primaryLabel}
      </span>

      {/* Approver / Actor Subtitles */}
      {currentStatus === "approved" && item.approvedBy && (
        <div style={{ fontSize: "10px", color: "#166534", marginTop: "1px" }}>by {item.approvedBy.name}</div>
      )}
      {currentStatus === "rejected" && item.rejectedBy && (
        <div style={{ fontSize: "10px", color: "#991B1B", marginTop: "1px" }}>by {item.rejectedBy.name}</div>
      )}
      {currentStatus === "reopened" && item.reopenedBy && (
        <div style={{ fontSize: "10px", color: "#92400E", marginTop: "1px" }}>by {item.reopenedBy.name}</div>
      )}

      {/* Secondary Multi-Status Indicator Badges */}
      {secondaryBadges.length > 0 && (
        <div
          className="secondary-status-badges"
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "3px",
            marginTop: "2px",
          }}
        >
          {secondaryBadges.map((b) => (
            <span
              key={b.key}
              className="secondary-badge"
              style={{
                fontSize: "10px",
                lineHeight: 1.2,
                padding: "2px 6px",
                borderRadius: "4px",
                fontWeight: 600,
                display: "inline-flex",
                alignItems: "center",
                gap: "3px",
                background: b.bg,
                color: b.color,
                border: `1px solid ${b.border}`,
                whiteSpace: "nowrap",
              }}
            >
              {b.icon}
              {b.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
