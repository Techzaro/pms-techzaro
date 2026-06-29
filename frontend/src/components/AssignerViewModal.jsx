/**
 * AssignerViewModal.jsx
 * Modal component for assigners to view deliverable details, submissions,
 * attachments (files, images, links), and take actions (approve, reject, reopen).
 */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { FileText, Download, ExternalLink } from "lucide-react";
import API_URL from "../config/api";
import { authToken } from "../utils/auth";
import ConfirmationDialog from "./ConfirmationDialog";
import ReopenDialog from "./ReopenDialog";
import { formatDateTime } from "../utils/formatDateTime";
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
 * Modal for assigners to view deliverable details, submissions, and perform actions.
 * @param {boolean} isOpen - Whether the modal is visible
 * @param {Function} onClose - Callback to close the modal
 * @param {Object} deliverable - The deliverable object to display
 * @param {Function} onActionSuccess - Callback when an action (approve/reject/reopen) succeeds
 */
function AssignerViewModal({ isOpen, onClose, deliverable, onActionSuccess }) {
  const [submission, setSubmission] = useState(null);
  const [loading, setLoading] = useState(true);
  const [confirmDialog, setConfirmDialog] = useState({ open: false, type: null });
  const [reopenDialog, setReopenDialog] = useState(false);
  const [acting, setActing] = useState(false);
  const [imagePreview, setImagePreview] = useState(null);

  // Fetch the latest submission when modal opens or deliverable changes
  useEffect(() => {
    if (!isOpen || !deliverable) return;
    // Prevent background scrolling while modal is open
    document.body.style.overflow = "hidden";

    const token = authToken();
    fetch(`${API_URL}/deliverables/${deliverable.id}/latest-submission`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => { setSubmission(data.submission); setLoading(false); })
      .catch(() => { setLoading(false); });

    // Restore scrolling on unmount
    return () => { document.body.style.overflow = ""; };
  }, [isOpen, deliverable]);

  /**
   * Handles approve, reject, or reopen actions on the deliverable.
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
        res = await fetch(`${API_URL}/deliverables/${deliverable.id}/reopen`, {
          method: "POST",
          headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
          body: formData,
        });
      } else {
        // Approve/reject use JSON payload
        res = await fetch(`${API_URL}/deliverables/${deliverable.id}/${action}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify(body),
        });
      }

      const data = await res.json();
      if (res.ok) {
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
    approve: "Are you sure you want to approve this deliverable?",
    reject: "Are you sure you want to reject this deliverable? The assignee will not be able to resubmit.",
    reopen: "Are you sure you want to reject and reopen this deliverable?",
  };

  // Color codes for confirmation dialog confirm button
  const confirmColors = {
    approve: "#16A34A",
    reject: "#DC2626",
    reopen: "#D97706",
  };

  if (!isOpen || !deliverable) return null;

  const token = authToken();

  /**
   * Builds a download URL for a deliverable attachment.
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
  const statusLabel = (deliverable.status || "pending").charAt(0).toUpperCase() + (deliverable.status || "pending").slice(1);
  // Separate attachments by type for organized display
  const attachments = submission?.attachments || [];
  const files = attachments.filter((a) => a.attachment_type === "file");
  const images = attachments.filter((a) => a.attachment_type === "image");
  const links = attachments.filter((a) => a.attachment_type === "link");

  return createPortal(
    <div className="avm-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="avm-modal" role="dialog" aria-modal="true">
        <div className="avm-header">
          <div className="avm-header-top">
            <h2 className="avm-title">{deliverable.title}</h2>
            <span className={`avm-status-badge avm-status-${deliverable.status}`}>{statusLabel}</span>
          </div>
          {deliverable.due_date && (
            <div className="avm-due">Due Date & Time {formatDateTime(deliverable.due_date)}</div>
          )}
        </div>

        <div className="avm-body">
          {/* Deliverable Details Section */}
          <div className="avm-section">
            <h3 className="avm-section-title">Details</h3>
            <div className="avm-details-grid">
              <div className="avm-detail-item">
                <span className="avm-detail-label">Task / Project</span>
                <span className="avm-detail-value">{deliverable.task?.title || deliverable.project?.title || "\u2014"}</span>
              </div>
              <div className="avm-detail-item">
                <span className="avm-detail-label">Priority</span>
                <span className="avm-detail-value">{deliverable.priority || "Medium"}</span>
              </div>
              <div className="avm-detail-item">
                <span className="avm-detail-label">Assigned To</span>
                <span className="avm-detail-value">{deliverable.assignee?.name || "Unassigned"}</span>
              </div>
              <div className="avm-detail-item">
                <span className="avm-detail-label">Created By</span>
                <span className="avm-detail-value">{deliverable.creator?.name || "\u2014"}</span>
              </div>
            </div>
            {deliverable.description && (
              <div className="avm-description">
                <span className="avm-detail-label">Description</span>
                <p className="avm-description-text">{deliverable.description}</p>
              </div>
            )}
            <div className="avm-detail-item">
              <span className="avm-detail-label">Created On</span>
              <span className="avm-detail-value">{formatDateTime(deliverable.created_at)}</span>
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
                <p>Waiting for deliverable submission.</p>
              </div>
            )}
          </div>

          {/* Reopen Details (if reopened) */}
          {deliverable.status === "reopened" && (
            <div className="avm-section avm-reopen-section">
              <h3 className="avm-section-title">Reopen Details</h3>
              <div className="avm-submission-grid">
                <div className="avm-detail-item">
                  <span className="avm-detail-label">Reopened By</span>
                  <span className="avm-detail-value">{deliverable.reopenedBy?.name || "\u2014"}</span>
                </div>
                <div className="avm-detail-item">
                  <span className="avm-detail-label">Reopened On</span>
                  <span className="avm-detail-value">{formatDateTime(deliverable.reopened_at)}</span>
                </div>
              </div>
              {deliverable.reopen_comment && (
                <div className="avm-detail-item" style={{ marginTop: "12px" }}>
                  <span className="avm-detail-label">Comment</span>
                  <p className="avm-description-text">{deliverable.reopen_comment}</p>
                </div>
              )}
              {deliverable.reopen_instructions && (
                <div className="avm-detail-item" style={{ marginTop: "12px" }}>
                  <span className="avm-detail-label">Instructions</span>
                  <p className="avm-description-text">{deliverable.reopen_instructions}</p>
                </div>
              )}
              {deliverable.reopen_new_deadline && (
                <div className="avm-detail-item" style={{ marginTop: "12px" }}>
                  <span className="avm-detail-label">New Deadline</span>
                  <span className="avm-detail-value">{formatDateTime(deliverable.reopen_new_deadline)}</span>
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
          {deliverable.status === "submitted" && (
            <div className="avm-action-btns">
              <button className="avm-action-btn avm-approve-btn" disabled={acting} onClick={() => setConfirmDialog({ open: true, type: "approve" })}>
                Approve
              </button>
              <button className="avm-action-btn avm-reject-btn" disabled={acting} onClick={() => setConfirmDialog({ open: true, type: "reject" })}>
                Reject
              </button>
              <button className="avm-action-btn avm-reopen-btn" disabled={acting} onClick={() => setReopenDialog(true)}>
                Reject & Reopen
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
        title={confirmDialog.type === "approve" ? "Approve Deliverable" : confirmDialog.type === "reject" ? "Reject Deliverable" : "Reject & Reopen"}
        message={confirmMessages[confirmDialog.type] || ""}
        confirmText={confirmDialog.type === "approve" ? "Approve" : confirmDialog.type === "reject" ? "Reject" : "Reject & Reopen"}
        confirmColor={confirmColors[confirmDialog.type] || "#4F46E5"}
      />

      <ReopenDialog
        isOpen={reopenDialog}
        onClose={() => setReopenDialog(false)}
        deliverable={deliverable}
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
