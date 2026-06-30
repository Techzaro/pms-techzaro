/**
 * ProjectSubmissionPanel.jsx
 * Displays the submission workflow panel for a project. Shows submission details,
 * attachments (files, images, links), approval/rejection actions for the creator,
 * and a chronological history of all workflow events.
 */

import { FileText, Download, ExternalLink } from "lucide-react";
import ConfirmationDialog from "./ConfirmationDialog";
import ProjectReopenDialog from "./ProjectReopenDialog";
import API_URL from "../config/api";
import { authToken } from "../utils/auth";
import { formatDateTime } from "../utils/formatDateTime";

const API_BASE = API_URL.replace(/\/api\/?$/, "");

/**
 * Resolves a file URL to an absolute path, handling both relative and absolute URLs.
 * @param {string} url - The file URL to resolve.
 * @returns {string|null} The resolved URL or null if empty.
 */
function fileUrl(url) {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  return API_BASE + url;
}

/** Formats a byte count into a human-readable file size string (B, KB, MB). */
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

/** Maps workflow action keys to display-friendly labels */
function actionLabel(action) {
  const map = {
    submitted: "Submitted",
    resubmitted: "Resubmitted",
    approved: "Approved",
    rejected: "Rejected",
    reopened: "Reopened",
  };
  return map[action] || action;
}

/**
 * Renders the full submission workflow panel for a project.
 * @param {Object} project - The project object with submission data.
 * @param {boolean} isCreator - Whether the current user is the project creator.
 * @param {boolean} isAssignee - Whether the current user is the project assignee.
 * @param {Function} onProjectUpdate - Callback when project data changes.
 * @param {Function} onSubmitClick - Callback to open the submission form.
 * @param {Object} confirmDialog - State for the confirmation dialog.
 * @param {Function} setConfirmDialog - Setter for confirmation dialog state.
 * @param {boolean} reopenDialog - Whether the reopen dialog is visible.
 * @param {Function} setReopenDialog - Setter for reopen dialog visibility.
 * @param {boolean} acting - Whether an action is currently in progress.
 * @param {Function} setActing - Setter for the acting state.
 */
function ProjectSubmissionPanel({
  project,
  isCreator,
  isAssignee,
  onProjectUpdate,
  onSubmitClick,
  confirmDialog,
  setConfirmDialog,
  reopenDialog,
  setReopenDialog,
  acting,
  setActing,
}) {
  const latestSubmission = project.latest_submission || project.latestSubmission;
  const workflowEvents = project.workflow_events || project.workflowEvents || [];
  const status = project.status;

  /** Sends an approve/reject action to the API and updates the project state */
  const handleAction = async (action, body = {}) => {
    setActing(true);
    try {
      const token = authToken();
      let res;
      if (action === "reopen") {
        return;
      }
      res = await fetch(`${API_URL}/projects/${project.id}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
        _notifHandled: true,
      });
      const data = await res.json();
      if (res.ok) {
        onProjectUpdate(data.project);
      }
    } catch {
    } finally {
      setActing(false);
    }
  };

  const confirmMessages = {
    approve: "Are you sure you want to approve this project?",
    reject: "Are you sure you want to reject this project? The assignee will not be able to resubmit.",
  };

  // Build chronological history of workflow events (newest first), excluding field changes
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
      {status === "reopened" && (
        <div className="td-card td-submission-card">
          <h3 className="td-card-title">Reopen Details</h3>
          <div className="td-submission-grid">
            <div className="td-submission-item">
              <span className="td-submission-label">Reopened By</span>
              <span className="td-submission-value">{(project.reopened_by || project.reopenedBy)?.name || "\u2014"}</span>
            </div>
            <div className="td-submission-item">
              <span className="td-submission-label">Reopened On</span>
              <span className="td-submission-value">{formatDateTime(project.reopened_at)}</span>
            </div>
          </div>
          {project.reopen_comment && (
            <div className="td-submission-item" style={{ marginTop: "12px" }}>
              <span className="td-submission-label">Reopen Comment</span>
              <p className="td-submission-text">{project.reopen_comment}</p>
            </div>
          )}
          {project.reopen_instructions && (
            <div className="td-submission-item" style={{ marginTop: "12px" }}>
              <span className="td-submission-label">Additional Instructions</span>
              <p className="td-submission-text">{project.reopen_instructions}</p>
            </div>
          )}
          {project.reopen_new_deadline && (
            <div className="td-submission-item" style={{ marginTop: "12px" }}>
              <span className="td-submission-label">New Deadline</span>
              <span className="td-submission-value">{formatDateShort(project.reopen_new_deadline)}</span>
            </div>
          )}
          {project.reopen_file_name && (
            <div className="td-submission-item" style={{ marginTop: "12px" }}>
              <span className="td-submission-label">Attached File</span>
              <span className="td-submission-value">{project.reopen_file_name}</span>
            </div>
          )}
        </div>
      )}

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
          {latestSubmission.comment && (
            <div className="td-submission-item" style={{ marginTop: "12px" }}>
              <span className="td-submission-label">Submission Notes</span>
              <p className="td-submission-text">{latestSubmission.comment}</p>
            </div>
          )}

          {/* Attachments */}
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

                {/* Old single file fallback */}
                {latestSubmission.file_name && atts.length === 0 && (
                  <div className="td-submission-item" style={{ marginTop: "12px" }}>
                    <span className="td-submission-label">Attached File</span>
                    <a
                      className="td-submission-file-link"
                      href={`${API_URL}/projects/submission-file/${latestSubmission.id}`}
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

          {isCreator && status === "submitted" && (
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
                Reject
              </button>
              <button
                className="td-review-btn td-review-btn--reopen"
                disabled={acting}
                onClick={() => setReopenDialog(true)}
              >
                Reject & Reopen
              </button>
            </div>
          )}
        </div>
      )}

      {historyItems.length > 0 && (
        <div className="td-card td-submission-card">
          <h3 className="td-card-title">Submission History</h3>
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
        title={confirmDialog.type === "approve" ? "Approve Project" : "Reject Project"}
        message={confirmMessages[confirmDialog.type] || ""}
        confirmText={confirmDialog.type === "approve" ? "Approve" : "Reject"}
        confirmColor={confirmDialog.type === "approve" ? "#16A34A" : "#DC2626"}
      />

      <ProjectReopenDialog
        isOpen={reopenDialog}
        onClose={() => setReopenDialog(false)}
        project={project}
        onReopenSuccess={onProjectUpdate}
      />
    </div>
  );
}

export default ProjectSubmissionPanel;
