import React from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2, Trash2, X, Play, Pause, XCircle, RotateCcw } from "lucide-react";
import { toast } from "../utils/notify";
import "./BulkActionsToolbar.css";

/**
 * BulkActionsToolbar.jsx
 * Floating actions bar displayed when bulk action mode is active and items are selected.
 * Dynamically displays action buttons based on the active filter tab:
 * - 'Pending' / 'Not Started': [Start Tasks, Mark Completed, Delete]
 * - 'In Progress': [Pause Tasks, Mark Completed, Delete]
 * - 'Submitted' / 'In Review': [Approve, Decline, Delete]
 * - 'Paused': [Resume Tasks, Delete]
 * - 'Completed' / 'Declined' / 'Abandoned': [Reopen Tasks, Delete]
 * - Fallback / 'All': [Mark Completed, Delete]
 */
export default function BulkActionsToolbar({
  selectedCount = 0,
  activeTab = "All",
  onStart,
  onPause,
  onResume,
  onApprove,
  onDecline,
  onReopen,
  onComplete,
  onDelete,
  onDeselectAll,
  onCancel,
}) {
  const { t } = useTranslation();

  if (selectedCount === 0) return null;

  const handleStart = onStart || (() => {
    toast.info(t("Bulk action: Start triggered for {{count}} tasks.", { count: selectedCount, defaultValue: `Bulk action: Start triggered for ${selectedCount} tasks.` }));
    console.log("Bulk start tasks");
  });

  const handlePause = onPause || (() => {
    toast.info(t("Bulk action: Pause triggered for {{count}} tasks.", { count: selectedCount, defaultValue: `Bulk action: Pause triggered for ${selectedCount} tasks.` }));
    console.log("Bulk pause tasks");
  });

  const handleResume = onResume || (() => {
    toast.info(t("Bulk action: Resume triggered for {{count}} tasks.", { count: selectedCount, defaultValue: `Bulk action: Resume triggered for ${selectedCount} tasks.` }));
    console.log("Bulk resume tasks");
  });

  const handleApprove = onApprove || (() => {
    toast.info(t("Bulk action: Approve triggered for {{count}} tasks.", { count: selectedCount, defaultValue: `Bulk action: Approve triggered for ${selectedCount} tasks.` }));
    console.log("Bulk approve tasks");
  });

  const handleDecline = onDecline || (() => {
    toast.info(t("Bulk action: Decline triggered for {{count}} tasks.", { count: selectedCount, defaultValue: `Bulk action: Decline triggered for ${selectedCount} tasks.` }));
    console.log("Bulk decline tasks");
  });

  const handleReopen = onReopen || (() => {
    toast.info(t("Bulk action: Reopen triggered for {{count}} tasks.", { count: selectedCount, defaultValue: `Bulk action: Reopen triggered for ${selectedCount} tasks.` }));
    console.log("Bulk reopen tasks");
  });

  const handleComplete = onComplete || (() => {
    toast.info(t("Bulk action: Mark as completed triggered for {{count}} tasks.", { count: selectedCount, defaultValue: `Bulk action: Mark as completed triggered for ${selectedCount} tasks.` }));
    console.log("Bulk complete tasks");
  });

  const handleDelete = onDelete || (() => {
    toast.info(t("Bulk action: Delete triggered for {{count}} tasks.", { count: selectedCount, defaultValue: `Bulk action: Delete triggered for ${selectedCount} tasks.` }));
    console.log("Bulk delete tasks");
  });

  const normalizedTab = String(activeTab || "all")
    .trim()
    .toLowerCase()
    .replace(/-/g, "_")
    .replace(/\s+/g, "_");

  let actionButtons = [];

  if (["pending", "not_started"].includes(normalizedTab)) {
    actionButtons = [
      {
        key: "start",
        label: t("Start Tasks", { defaultValue: "Start Tasks" }),
        icon: <Play size={15} />,
        onClick: handleStart,
        className: "bulk-btn bulk-btn-start",
      },
      {
        key: "complete",
        label: t("Mark Completed", { defaultValue: "Mark Completed" }),
        icon: <CheckCircle2 size={15} />,
        onClick: handleComplete,
        className: "bulk-btn bulk-btn-complete",
      },
      {
        key: "delete",
        label: `${t("Delete Selected", { defaultValue: "Delete Selected" })} (${selectedCount})`,
        icon: <Trash2 size={15} />,
        onClick: handleDelete,
        className: "bulk-btn bulk-btn-delete",
      },
    ];
  } else if (["in_progress"].includes(normalizedTab)) {
    actionButtons = [
      {
        key: "pause",
        label: t("Pause Tasks", { defaultValue: "Pause Tasks" }),
        icon: <Pause size={15} />,
        onClick: handlePause,
        className: "bulk-btn bulk-btn-pause",
      },
      {
        key: "complete",
        label: t("Mark Completed", { defaultValue: "Mark Completed" }),
        icon: <CheckCircle2 size={15} />,
        onClick: handleComplete,
        className: "bulk-btn bulk-btn-complete",
      },
      {
        key: "delete",
        label: `${t("Delete Selected", { defaultValue: "Delete Selected" })} (${selectedCount})`,
        icon: <Trash2 size={15} />,
        onClick: handleDelete,
        className: "bulk-btn bulk-btn-delete",
      },
    ];
  } else if (["submitted", "in_review"].includes(normalizedTab)) {
    actionButtons = [
      {
        key: "approve",
        label: t("Approve", { defaultValue: "Approve" }),
        icon: <CheckCircle2 size={15} />,
        onClick: handleApprove,
        className: "bulk-btn bulk-btn-approve",
      },
      {
        key: "decline",
        label: t("Decline", { defaultValue: "Decline" }),
        icon: <XCircle size={15} />,
        onClick: handleDecline,
        className: "bulk-btn bulk-btn-decline",
      },
      {
        key: "delete",
        label: `${t("Delete Selected", { defaultValue: "Delete Selected" })} (${selectedCount})`,
        icon: <Trash2 size={15} />,
        onClick: handleDelete,
        className: "bulk-btn bulk-btn-delete",
      },
    ];
  } else if (["paused"].includes(normalizedTab)) {
    actionButtons = [
      {
        key: "resume",
        label: t("Resume Tasks", { defaultValue: "Resume Tasks" }),
        icon: <Play size={15} />,
        onClick: handleResume,
        className: "bulk-btn bulk-btn-resume",
      },
      {
        key: "delete",
        label: `${t("Delete Selected", { defaultValue: "Delete Selected" })} (${selectedCount})`,
        icon: <Trash2 size={15} />,
        onClick: handleDelete,
        className: "bulk-btn bulk-btn-delete",
      },
    ];
  } else if (["completed", "approved", "declined", "rejected", "abandoned"].includes(normalizedTab)) {
    actionButtons = [
      {
        key: "reopen",
        label: t("Reopen Tasks", { defaultValue: "Reopen Tasks" }),
        icon: <RotateCcw size={15} />,
        onClick: handleReopen,
        className: "bulk-btn bulk-btn-reopen",
      },
      {
        key: "delete",
        label: `${t("Delete Selected", { defaultValue: "Delete Selected" })} (${selectedCount})`,
        icon: <Trash2 size={15} />,
        onClick: handleDelete,
        className: "bulk-btn bulk-btn-delete",
      },
    ];
  } else {
    actionButtons = [
      {
        key: "complete",
        label: t("Mark Completed", { defaultValue: "Mark Completed" }),
        icon: <CheckCircle2 size={15} />,
        onClick: handleComplete,
        className: "bulk-btn bulk-btn-complete",
      },
      {
        key: "delete",
        label: `${t("Delete Selected", { defaultValue: "Delete Selected" })} (${selectedCount})`,
        icon: <Trash2 size={15} />,
        onClick: handleDelete,
        className: "bulk-btn bulk-btn-delete",
      },
    ];
  }

  return (
    <div className="bulk-toolbar-container">
      <div className="bulk-toolbar-content">
        <div className="bulk-toolbar-count">
          <span className="bulk-toolbar-badge">{selectedCount}</span>
          <span>{t("Selected", { defaultValue: "Selected" })}</span>
        </div>

        <div className="bulk-toolbar-divider" />

        <div className="bulk-toolbar-actions">
          {actionButtons.map((btn) => (
            <button
              key={btn.key}
              type="button"
              className={btn.className}
              onClick={btn.onClick}
              title={btn.label}
            >
              {btn.icon}
              <span>{btn.label}</span>
            </button>
          ))}

          {onDeselectAll && (
            <button
              type="button"
              className="bulk-btn bulk-btn-secondary"
              onClick={onDeselectAll}
            >
              {t("Deselect All", { defaultValue: "Deselect All" })}
            </button>
          )}

          {onCancel && (
            <button
              type="button"
              className="bulk-btn bulk-btn-ghost"
              onClick={onCancel}
              title={t("Exit Bulk Mode", { defaultValue: "Exit Bulk Mode" })}
            >
              <X size={15} />
              <span>{t("Cancel", { defaultValue: "Cancel" })}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
