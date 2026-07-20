/**
 * AssignerViewModal.jsx
 * Modal component for assigners to view subtask details, submissions,
 * attachments (files, images, links), and take actions (approve, reject, reopen).
 */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { FileText, Download, ExternalLink } from "lucide-react";
import API_URL from "../config/api";
import { authToken } from "../utils/auth";
import { useEscapeKey } from "../hooks/useEscapeKey";
import ConfirmationDialog from "./ConfirmationDialog";
import ReopenDialog from "./ReopenDialog";
import { formatDateTime } from "../utils/formatDateTime";
import { showSuccessMessage } from "../utils/notify";
import "./AssignerViewModal.css";

/**
 * Formats a file size in bytes to a human-readable string (B, KB, or MB).
 * @param {number} bytes - File size in bytes
 * @returns {string} Formatted file size string
 */
function formatFileSize(bytes) {
  if (!bytes) return "";
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return mb.toFixed(1) + " MB";
  const kb = bytes / 1024;
  if (kb >= 1) return kb.toFixed(0) + " KB";
  return bytes + " B";
}

/**
 * Modal for assigners to view subtask details, submissions, and perform actions.
 * @param {boolean} isOpen - Whether the modal is visible
 * @param {Function} onClose - Callback to close the modal
 * @param {Object} subtask - The subtask object to display
 * @param {Function} onActionSuccess - Callback when an action (approve/reject/reopen) succeeds
 */
function AssignerViewModal({ isOpen, onClose, subtask, onActionSuccess }) {
  useEscapeKey(isOpen, onClose);

  const [submission, setSubmission] = useState(null);
  const [loading, setLoading] = useState(true);
  const [confirmDialog, setConfirmDialog] = useState({ open: false, type: null });
  const [reopenDialog, setReopenDialog] = useState(false);
  const [acting, setActing] = useState(false);
  const [imagePreview, setImagePreview] = useState(null);

  // Fetch the latest submission when modal opens or subtask changes
  useEffect(() => {
    if (!isOpen || !subtask) return;
    // Prevent background scrolling while modal is open
    document.body.style.overflow = "hidden";

    const token = authToken();
    fetch(`${API_URL}/deliverables/${subtask.id}/latest-submission`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      skipLoader: true,
    })
      .then((res) => res.json())
      .then((data) => { setSubmission(data.submission); setLoading(false); })
      .catch(() => { setLoading(false); });

    // Restore scrolling on unmount
    return () => { document.body.style.overflow = ""; };
  }, [isOpen, subtask]);

  /**
   * Handles approve, reject, or reopen actions on the subtask.
   * Uses FormData for reopen (supports file uploads), JSON for other actions.
   * @param {string} action - The action to perform: "approve", "reject", or "reopen"
   * @param {Object} body - Optional payload (comment, instructions, new_deadline, file)
   */
  const handleAction = async (action, body = {}) => {
    setActing(true);
    try {
      const token = authToken();
      let res;
      if (action === "reopen") {
        // Reopen uses FormData to support file attachments
        const formData = new FormData();
        if (body.comment) formData.append("comment", body.comment);
        if (body.instructions) formData.append("instructions", body.instructions);
        if (body.new_deadline) formData.append("new_deadline", body.new_deadline);
        if (body.file) formData.append("file", body.file);
        res = await fetch(`${API_URL}/deliverables/${subtask.id}/reopen`, {
          method: "POST",
          headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
          body: formData,
          _notifHandled: true,
        });
      } else {
        // Approve/reject use JSON payload
        res = await fetch(`${API_URL}/deliverables/${subtask.id}/${action}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify(body),
          _notifHandled: true,
        });
      }

      const data = await res.json();
      if (res.ok) {
        const actionLabel = action === "approve" ? "approved" : action === "reject" ? "rejected" : "reopened";
        showSuccessMessage("Subtask", actionLabel);
        onActionSuccess(data.deliverable);
        onClose();
      }
    } catch {
      // silently fail
    } finally {
      setActing(false);
    }
  };

  // Confirmation dialog messages for each action type
  const confirmMessages = {
    approve: "Are you sure you want to approve this subtask?",
    reject: "Are you sure you want to decline this subtask? The assignee will not be able to resubmit.",
    reopen: "Are you sure you want to decline and reopen this subtask?",
  };

  // Color codes for confirmation dialog confirm button
  const confirmColors = {
    approve: "#16A34A",
    reject: "#DC2626",
    reopen: "#D97706",
  };

  if (!isOpen || !subtask) return null;

  const token = authToken();

  /**
   * Builds a download URL for a subtask attachment.
   * @param {number} attId - Attachment ID
   * @param {string} [action] - Optional action parameter (e.g., "download")
   * @returns {string} Full attachment URL with auth token
   */
  const attachmentUrl = (attId, action) => {
    let url = `${API_URL}/deliverables/attachment/${attId}/download`;
    const params = [];
    if (action) params.push(`action=${action}`);
    if (token) params.push(`token=${token}`);
    if (params.length) url += `?${params.join("&")}`;
    return url;
  };

  // Capitalize status for display
  const statusLabel = (subtask.status || "pending").charAt(0).toUpperCase() + (subtask.status || "pending").slice(1);
  // Separate attachments by type for organized display
  const attachments = submission?.attachments || [];
  const files = attachments.filter((a) => a.attachment_type === "file");
  const images = attachments.filter((a) => a.attachment_type === "image");
  const links = attachments.filter((a) => a.attachment_type === "link");

  return createPortal(
    <div className="avm-overlay">
      <div className="avm-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="avm-header">
          <div className="avm-header-top">
            <h2 className="avm-title">{subtask.title}</h2>
            <span className={`avm-status-badge avm-status-${subtask.status}`}>{statusLabel}</span>
          </div>
          {subtask.due_date && (
            <div className="avm-due">Due Date & Time {formatDateTime(subtask.due_date)}</div>
          )}
        </div>

        <div className="avm-body">
          {/* Deliverable Details Section */}
          <div className="avm-section">
            <h3 className="avm-section-title">Details</h3>
            <div className="avm-details-grid">
              <div className="avm-detail-item">
                <span className="avm-detail-label">Task / Project</span>
                <span className="avm-detail-value">{subtask.task?.title || subtask.project?.title || "\u2014"}</span>
              </div>
              <div className="avm-detail-item">
                <span className="avm-detail-label">Priority</span>
                <span className="avm-detail-value">{subtask.priority || "Medium"}</span>
              </div>
              <div className="avm-detail-item">
                <span className="avm-detail-label">Assigned To</span>
                <span className="avm-detail-value">{subtask.assignee?.name || "Unassigned"}</span>
              </div>
              <div className="avm-detail-item">
                <span className="avm-detail-label">Created By</span>
                <span className="avm-detail-value">{subtask.creator?.name || "\u2014"}</span>
              </div>
            </div>
            {subtask.description && (
              <div className="avm-description">
                <span className="avm-detail-label">Description</span>
                <div
                  className="avm-description-text rte-display"
                  dangerouslySetInnerHTML={{ __html: subtask.description }}
                />
              </div>
            )}
            <div className="avm-detail-item">
              <span className="avm-detail-label">Created On</span>
              <span className="avm-detail-value">{formatDateTime(subtask.created_at)}</span>
            </div>
          </div>

          {/* Submission Section */}
          <div className="avm-section">
            <h3 className="avm-section-title">Submission</h3>
            {loading ? (
              <div className="avm-loading">Loading submission...</div>
            ) : submission ? (
              <div className="avm-submission">
                <div className="avm-submission-grid">
                  <div className="avm-detail-item">
                    <span className="avm-detail-label">Submitted By</span>
                    <span className="avm-detail-value">{submission.submitted_by?.name || "Unknown"}</span>
                  </div>
                  <div className="avm-detail-item">
                    <span className="avm-detail-label">Submitted On</span>
                    <span className="avm-detail-value">{formatDateTime(submission.created_at)}</span>
                  </div>
                </div>
                {submission.comment && (
                  <div className="avm-detail-item" style={{ marginTop: "12px" }}>
                    <span className="avm-detail-label">Notes</span>
                    <p className="avm-description-text">{submission.comment}</p>
                  </div>
                )}

                {/* Files */}
                {files.length > 0 && (
                  <div className="avm-attachments-section" style={{ marginTop: "12px" }}>
                    <span className="avm-detail-label">Files ({files.length})</span>
                    <div className="avm-attachments-list">
                      {files.map((att) => (
                        <a key={att.id} className="avm-file-link" href={attachmentUrl(att.id, "download")} target="_blank" rel="noopener noreferrer">
                          <FileText size={16} />
                          <span className="avm-attach-name">{att.original_name || att.file_name}</span>
                          {att.file_size && <span className="avm-attach-size">{formatFileSize(att.file_size)}</span>}
                          <Download size={14} />
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {/* Images */}
                {images.length > 0 && (
                  <div className="avm-attachments-section" style={{ marginTop: "12px" }}>
                    <span className="avm-detail-label">Images ({images.length})</span>
                    <div className="avm-image-grid">
                      {images.map((att) => (
                        <div key={att.id} className="avm-image-thumb" onClick={() => setImagePreview(attachmentUrl(att.id))}>
                          <img src={attachmentUrl(att.id)} alt={att.original_name || att.file_name} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Links */}
                {links.length > 0 && (
                  <div className="avm-attachments-section" style={{ marginTop: "12px" }}>
                    <span className="avm-detail-label">Links ({links.length})</span>
                    <div className="avm-attachments-list">
                      {links.map((att) => (
                        <a key={att.id} className="avm-file-link" href={att.url} target="_blank" rel="noopener noreferrer">
                          <ExternalLink size={16} />
                          <span className="avm-attach-name">{att.original_name || att.url}</span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {/* Old single file fallback */}
                {submission.file_name && attachments.length === 0 && (
                  <div className="avm-detail-item" style={{ marginTop: "12px" }}>
                    <span className="avm-detail-label">Attachment</span>
                    <a
                      className="avm-file-link"
                      href={`${API_URL}/deliverables/submission-file/${submission.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <FileText size={16} />
                      <span>{submission.file_name}</span>
                    </a>
                  </div>
                )}
              </div>
            ) : (
              <div className="avm-empty">
                <p>Waiting for subtask submission.</p>
              </div>
            )}
          </div>

          {/* Reopen Details (if reopened) */}
          {subtask.status === "reopened" && (
            <div className="avm-section avm-reopen-section">
              <h3 className="avm-section-title">Reopen Details</h3>
              <div className="avm-submission-grid">
                <div className="avm-detail-item">
                  <span className="avm-detail-label">Reopened By</span>
                  <span className="avm-detail-value">{subtask.reopenedBy?.name || "\u2014"}</span>
                </div>
                <div className="avm-detail-item">
                  <span className="avm-detail-label">Reopened On</span>
                  <span className="avm-detail-value">{formatDateTime(subtask.reopened_at)}</span>
                </div>
              </div>
              {subtask.reopen_comment && (
                <div className="avm-detail-item" style={{ marginTop: "12px" }}>
                  <span className="avm-detail-label">Comment</span>
                  <p className="avm-description-text">{subtask.reopen_comment}</p>
                </div>
              )}
              {subtask.reopen_instructions && (
                <div className="avm-detail-item" style={{ marginTop: "12px" }}>
                  <span className="avm-detail-label">Instructions</span>
                  <p className="avm-description-text">{subtask.reopen_instructions}</p>
                </div>
              )}
              {subtask.reopen_new_deadline && (
                <div className="avm-detail-item" style={{ marginTop: "12px" }}>
                  <span className="avm-detail-label">New Deadline</span>
                  <span className="avm-detail-value">{formatDateTime(subtask.reopen_new_deadline)}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Image Preview Modal */}
        {imagePreview && (
          <div className="avm-image-overlay" onClick={() => setImagePreview(null)}>
            <img src={imagePreview} alt="Preview" className="avm-image-full" />
          </div>
        )}

        <div className="avm-footer">
          <button className="avm-close-btn" onClick={onClose}>Close</button>
          {subtask.status === "submitted" && (
            <div className="avm-action-btns">
              <button className="avm-action-btn avm-approve-btn" disabled={acting} onClick={() => setConfirmDialog({ open: true, type: "approve" })}>
                Approve
              </button>
              <button className="avm-action-btn avm-reject-btn" disabled={acting} onClick={() => setConfirmDialog({ open: true, type: "reject" })}>
                Decline
              </button>
              <button className="avm-action-btn avm-reopen-btn" disabled={acting} onClick={() => setReopenDialog(true)}>
                Decline & Reopen
              </button>
            </div>
          )}
        </div>
      </div>

      <ConfirmationDialog
        isOpen={confirmDialog.open}
        onClose={() => setConfirmDialog({ open: false, type: null })}
        onConfirm={() => {
          const type = confirmDialog.type;
          setConfirmDialog({ open: false, type: null });
          handleAction(type);
        }}
        title={confirmDialog.type === "approve" ? "Approve Subtask" : confirmDialog.type === "reject" ? "Decline Subtask" : "Decline & Reopen"}
        message={confirmMessages[confirmDialog.type] || ""}
        confirmText={confirmDialog.type === "approve" ? "Approve" : confirmDialog.type === "reject" ? "Decline" : "Decline & Reopen"}
        confirmColor={confirmColors[confirmDialog.type] || "#4F46E5"}
      />

      <ReopenDialog
        isOpen={reopenDialog}
        onClose={() => setReopenDialog(false)}
        subtask={subtask}
        onReopenSuccess={(updated) => {
          onActionSuccess(updated);
          onClose();
        }}
      />
    </div>,
    document.body
  );
}

export default AssignerViewModal;
