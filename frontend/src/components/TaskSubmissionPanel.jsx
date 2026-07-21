/**
 * TaskSubmissionPanel.jsx
 * Displays the submission workflow panel for a task. Shows submission details,
 * attachments (files, images, links), approval/rejection actions for the creator,
 * a submission history section, and a chronological history of all workflow events.
 */

import { FileText, Download, ExternalLink } from "lucide-react";
import ConfirmationDialog from "./ConfirmationDialog";
import TaskReopenDialog from "./TaskReopenDialog";
import API_URL from "../config/api";
import { authToken } from "../utils/auth";
import { formatDateTime } from "../utils/formatDateTime";

const API_BASE = API_URL.replace(/\/api\/?$/, "");

function fileUrl(url) {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  return API_BASE + url;
}

function formatFileSize(bytes) {
  if (!bytes) return "";
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return mb.toFixed(1) + " MB";
  const kb = bytes / 1024;
  if (kb >= 1) return kb.toFixed(0) + " KB";
  return bytes + " B";
}

function formatDateShort(value) {
  return formatDateTime(value);
}

function actionLabel(action) {
  const map = {
    submitted: "Submitted",
    resubmitted: "Resubmitted",
    acknowledged: "Acknowledged",
    paused: "Paused",
    continued: "Continued",
    approved: "Approved",
    rejected: "Declined",
    reopened: "Reopened",
  };
  return map[action] || action;
}

function submissionStatusLabel(status) {
  const map = {
    pending: "Pending Review",
    approved: "Approved",
    reopened: "Reopened",
  };
  return map[status] || status || "Pending";
}

function submissionStatusColor(status) {
  const map = {
    pending: "var(--color-blue)",
    approved: "var(--color-success)",
    reopened: "var(--color-warning)",
  };
  return map[status] || "var(--text-secondary)";
}

function submissionStatusBg(status) {
  const map = {
    pending: "var(--color-blue-bg)",
    approved: "var(--color-success-bg)",
    reopened: "var(--color-warning-bg)",
  };
  return map[status] || "var(--bg-hover)";
}

function TaskSubmissionPanel({
  task,
  isCreator,
  isAssignee,
  onTaskUpdate,
  onSubmitClick,
  confirmDialog,
  setConfirmDialog,
  reopenDialog,
  setReopenDialog,
  acting,
  setActing,
  hideTimeline,
}) {
  const latestSubmission = task.latest_submission || task.latestSubmission;
  const workflowEvents = task.workflow_events || task.workflowEvents || [];
  const submissions = task.submissions || [];
  const status = task.status;
  const isNextApprover = task.is_next_approver;
  const hasDelegationChain = task.has_delegation_chain;
  const canApprove = isCreator || isNextApprover;

  const handleAction = async (action, body = {}) => {
    setActing(true);
    try {
      const token = authToken();
      let res;
      if (action === "reopen") {
        return;
      }
      res = await fetch(`${API_URL}/tasks/${task.id}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
        _notifHandled: true,
      });
      const data = await res.json();
      if (res.ok) {
        onTaskUpdate(data.task);
      }
    } catch {
      // silently fail
    } finally {
      setActing(false);
    }
  };

  const confirmMessages = {
    approve: "Are you sure you want to approve this task?",
    reject: "Are you sure you want to decline this task? The assignee will not be able to resubmit.",
  };

  const historyItems = workflowEvents
    .filter((e) => e.action !== 'field_changed')
    .map((e) => ({
    id: `evt-${e.id}`,
    action: e.action,
    user: e.user,
    date: e.created_at,
    comment: e.comment,
    instructions: e.instructions,
    new_deadline: e.new_deadline,
    file_name: e.file_name,
    file_path: e.file_path,
    type: e.action === "submitted" || e.action === "resubmitted" ? "submission" : "event",
  })).reverse();

  return (
    <div className="td-submission-panel">
      {/* Reopen details for assignee */}
      {status === "reopened" && (
        <div className="td-card td-submission-card">
          <h3 className="td-card-title">Reopen Details</h3>
          <div className="td-submission-grid">
            <div className="td-submission-item">
              <span className="td-submission-label">Reopened By</span>
              <span className="td-submission-value">{(task.reopened_by || task.reopenedBy)?.name || "\u2014"}</span>
            </div>
            <div className="td-submission-item">
              <span className="td-submission-label">Reopened On</span>
              <span className="td-submission-value">{formatDateTime(task.reopened_at)}</span>
            </div>
          </div>
          {task.reopen_reason && (
            <div className="td-submission-item" style={{ marginTop: "12px" }}>
              <span className="td-submission-label">Reason</span>
              <p className="td-submission-text">{task.reopen_reason}</p>
            </div>
          )}
          {task.reopen_comment && task.reopen_comment !== task.reopen_reason && (
            <div className="td-submission-item" style={{ marginTop: "12px" }}>
              <span className="td-submission-label">Reopen Comment</span>
              <p className="td-submission-text">{task.reopen_comment}</p>
            </div>
          )}
          {task.reopen_instructions && (
            <div className="td-submission-item" style={{ marginTop: "12px" }}>
              <span className="td-submission-label">Additional Instructions</span>
              <p className="td-submission-text">{task.reopen_instructions}</p>
            </div>
          )}
          {task.reopen_new_deadline && (
            <div className="td-submission-item" style={{ marginTop: "12px" }}>
              <span className="td-submission-label">New Deadline</span>
              <span className="td-submission-value">{formatDateShort(task.reopen_new_deadline)}</span>
            </div>
          )}
          {task.reopen_file_name && (
            <div className="td-submission-item" style={{ marginTop: "12px" }}>
              <span className="td-submission-label">Attached File</span>
              <span className="td-submission-value">{task.reopen_file_name}</span>
            </div>
          )}
        </div>
      )}

      {/* Submission details */}
      {(status === "submitted" || status === "approved" || status === "rejected") && latestSubmission && (
        <div className="td-card td-submission-card">
          <h3 className="td-card-title">Submission Details</h3>
          <div className="td-submission-grid">
            <div className="td-submission-item">
              <span className="td-submission-label">Submitted By</span>
              <span className="td-submission-value">{(latestSubmission.submitted_by || latestSubmission.submittedBy)?.name || "Unknown"}</span>
            </div>
            <div className="td-submission-item">
              <span className="td-submission-label">Submitted At</span>
              <span className="td-submission-value">{formatDateTime(latestSubmission.created_at)}</span>
            </div>
          </div>
          {latestSubmission.version_number > 1 && (
            <div className="td-submission-item" style={{ marginTop: "8px" }}>
              <span className="td-submission-label">Submission Version</span>
              <span className="td-submission-value">#{latestSubmission.version_number}</span>
            </div>
          )}
          {latestSubmission.comment && (
            <div className="td-submission-item" style={{ marginTop: "12px" }}>
              <span className="td-submission-label">Submission Notes</span>
              <p className="td-submission-text">{latestSubmission.comment}</p>
            </div>
          )}

          {(() => {
            const atts = latestSubmission.attachments || [];
            const files = atts.filter((a) => a.attachment_type === "file");
            const images = atts.filter((a) => a.attachment_type === "image");
            const links = atts.filter((a) => a.attachment_type === "link");

            return (
              <>
                {files.length > 0 && (
                  <div className="td-submission-item" style={{ marginTop: "12px" }}>
                    <span className="td-submission-label">Files ({files.length})</span>
                    <div className="td-attachments-list">
                      {files.map((att) => (
                        <a key={att.id} className="td-submission-file-link" href={fileUrl(att.full_url)} target="_blank" rel="noopener noreferrer">
                          <FileText size={16} />
                          <span>{att.original_name || att.file_name}</span>
                          {att.file_size && <span style={{ fontSize: "11px", color: "#9CA3AF", marginLeft: "auto" }}>{formatFileSize(att.file_size)}</span>}
                          <Download size={14} />
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {images.length > 0 && (
                  <div className="td-submission-item" style={{ marginTop: "12px" }}>
                    <span className="td-submission-label">Images ({images.length})</span>
                    <div className="td-image-grid">
                      {images.map((att) => (
                        <div key={att.id} className="td-image-thumb" onClick={() => window.open(fileUrl(att.full_url), "_blank")}>
                          <img src={fileUrl(att.full_url)} alt={att.original_name || att.file_name} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {links.length > 0 && (
                  <div className="td-submission-item" style={{ marginTop: "12px" }}>
                    <span className="td-submission-label">Links ({links.length})</span>
                    <div className="td-attachments-list">
                      {links.map((att) => (
                        <a key={att.id} className="td-submission-file-link" href={att.url} target="_blank" rel="noopener noreferrer">
                          <ExternalLink size={16} />
                          <span>{att.original_name || att.url}</span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {latestSubmission.file_name && atts.length === 0 && (
                  <div className="td-submission-item" style={{ marginTop: "12px" }}>
                    <span className="td-submission-label">Attached File</span>
                    <a
                      className="td-submission-file-link"
                      href={`${API_URL}/tasks/submission-file/${latestSubmission.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <FileText size={16} />
                      <span>{latestSubmission.file_name}</span>
                    </a>
                  </div>
                )}
              </>
            );
          })()}

          {/* Review actions for submitted status */}
          {canApprove && status === "submitted" && (
            <div className="td-review-actions">
              <button
                className="td-review-btn td-review-btn--approve"
                disabled={acting}
                onClick={() => setConfirmDialog({ open: true, type: "approve" })}
              >
                Approve
              </button>
              <button
                className="td-review-btn td-review-btn--reject"
                disabled={acting}
                onClick={() => setConfirmDialog({ open: true, type: "reject" })}
              >
                Decline
              </button>
              <button
                className="td-review-btn td-review-btn--reopen"
                disabled={acting}
                onClick={() => setReopenDialog(true)}
              >
                Decline & Reopen
              </button>
            </div>
          )}

          {/* Reopen action for approved status */}
          {canApprove && status === "approved" && (
            <div className="td-review-actions">
              <button
                className="td-review-btn td-review-btn--reopen"
                disabled={acting}
                onClick={() => setReopenDialog(true)}
              >
                Reopen Task
              </button>
            </div>
          )}
        </div>
      )}

      {/* Submission History */}
      {submissions.length > 1 && (
        <div className="td-card td-submission-card">
          <h3 className="td-card-title">Submission History</h3>
          <div className="td-submission-history">
            {submissions.map((sub, idx) => (
              <div key={sub.id} className="td-history-entry" style={{
                padding: "12px 16px",
                borderBottom: idx < submissions.length - 1 ? "1px solid var(--border)" : "none",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                  <span style={{ fontWeight: 600, fontSize: "13px", color: "var(--text-heading)" }}>
                    Submission #{sub.version_number || (submissions.length - idx)}
                  </span>
                  <span className="badge" style={{
                    background: submissionStatusBg(sub.status),
                    color: submissionStatusColor(sub.status),
                    fontSize: "11px",
                    padding: "2px 8px",
                    borderRadius: "12px",
                    fontWeight: 600,
                  }}>
                    {submissionStatusLabel(sub.status)}
                  </span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 16px", fontSize: "12px", color: "var(--text-secondary)" }}>
                  <span>By: {sub.submitted_by?.name || sub.submittedBy?.name || "Unknown"}</span>
                  <span>On: {formatDateTime(sub.created_at)}</span>
                  {sub.approved_by && (
                    <>
                      <span>Approved by: {sub.approved_by?.name || "Unknown"}</span>
                      <span>Approved: {formatDateTime(sub.approved_at)}</span>
                    </>
                  )}
                  {sub.reopened_by && (
                    <>
                      <span>Reopened by: {sub.reopened_by?.name || "Unknown"}</span>
                      <span>Reason: {sub.reopen_reason || "N/A"}</span>
                    </>
                  )}
                </div>
                {sub.comment && (
                  <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "6px", fontStyle: "italic" }}>
                    "{sub.comment}"
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Reopen Count */}
      {(task.reopen_count > 0 || (status !== "reopened" && historyItems.filter(i => i.action === "reopened").length > 0)) && (
        <div className="td-card td-submission-card" style={{ padding: "12px 16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "13px", color: "var(--text-secondary)" }}>Reopen Count</span>
            <span style={{
              fontSize: "18px", fontWeight: 700,
              color: (task.reopen_count || historyItems.filter(i => i.action === "reopened").length) > 0 ? "var(--color-warning)" : "var(--text-primary)",
            }}>
              {task.reopen_count || historyItems.filter(i => i.action === "reopened").length}
            </span>
          </div>
        </div>
      )}

      {/* Submission history timeline */}
      {!hideTimeline && historyItems.length > 0 && (
        <div className="td-card td-submission-card">
          <h3 className="td-card-title">Timeline History</h3>
          <ul className="td-history-list">
            {historyItems.map((item) => (
              <li key={item.id} className="td-history-item">
                <div className="td-history-header">
                  <span className={`td-history-badge td-history-badge--${item.action}`}>{actionLabel(item.action)}</span>
                  <span className="td-history-date">{formatDateTime(item.date)}</span>
                </div>
                <div className="td-history-meta">
                  by {item.user?.name || "Unknown"}
                </div>
                {item.comment && <p className="td-submission-text">{item.comment}</p>}
                {item.instructions && (
                  <p className="td-submission-text"><strong>Instructions:</strong> {item.instructions}</p>
                )}
                {item.new_deadline && (
                  <p className="td-submission-text"><strong>New Deadline:</strong> {formatDateShort(item.new_deadline)}</p>
                )}
                {item.file_name && item.type === "submission" && item.file_path && (
                  <span className="td-submission-value">{item.file_name}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <ConfirmationDialog
        isOpen={confirmDialog.open}
        onClose={() => setConfirmDialog({ open: false, type: null })}
        onConfirm={() => {
          const type = confirmDialog.type;
          setConfirmDialog({ open: false, type: null });
          handleAction(type);
        }}
        title={confirmDialog.type === "approve" ? "Approve Task" : "Decline Task"}
        message={confirmMessages[confirmDialog.type] || ""}
        confirmText={confirmDialog.type === "approve" ? "Approve" : "Decline"}
        confirmColor={confirmDialog.type === "approve" ? "#16A34A" : "#DC2626"}
      />

      <TaskReopenDialog
        isOpen={reopenDialog}
        onClose={() => setReopenDialog(false)}
        task={task}
        onReopenSuccess={onTaskUpdate}
      />
    </div>
  );
}

export default TaskSubmissionPanel;
