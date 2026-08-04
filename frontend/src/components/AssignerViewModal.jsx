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
import AbandonModal from "./AbandonModal";
import { formatDateTime } from "../utils/formatDateTime";
import { showSuccessMessage } from "../utils/notify";
import { getUser } from "../utils/auth";
import "./AssignerViewModal.css";

const API_BASE = API_URL.replace(/\/api\/?$/, "");

function fileUrl(url) {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  return API_BASE + (url.startsWith("/") ? "" : "/storage/") + url;
}

function downloadUrl(path, filename) {
  if (!path) return null;
  const name = filename || path.split("/").pop();
  return `${API_URL}/files/download?path=${encodeURIComponent(path)}&name=${encodeURIComponent(name)}`;
}

async function triggerDownload(e, path, filename) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  if (!path) return;

  const name = filename || path.split("/").pop();
  const downloadApiUrl = `${API_URL}/files/download?path=${encodeURIComponent(path)}&name=${encodeURIComponent(name)}`;

  try {
    const token = authToken();
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const res = await fetch(downloadApiUrl, { headers });
    if (!res.ok) throw new Error("Fetch failed");
    const blob = await res.blob();
    const blobUrl = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(blobUrl);
  } catch {
    window.open(downloadApiUrl, "_blank");
  }
}

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
  const [abandonModalOpen, setAbandonModalOpen] = useState(false);
  const [abandonAction, setAbandonAction] = useState("request");
  const currentUser = getUser();
  const userRole = currentUser?.role;
  const isAdminOrManager = userRole === "admin" || userRole === "manager";
  const isMemberOrTeamLead = userRole === "member" || userRole === "team_lead" || userRole === "teamlead";

  const handleAbandonSubmit = async (reason) => {
    setAbandonModalOpen(false);
    let endpoint = "request-abandon";
    if (abandonAction === "approve") endpoint = "approve-abandon";
    else if (abandonAction === "decline") endpoint = "decline-abandon";
    else if (abandonAction === "direct") endpoint = "abandon";

    setActing(true);
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/deliverables/${subtask.id}/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reason }),
        _notifHandled: true,
      });
      const data = await res.json();
      if (res.ok) {
        onActionSuccess(data.deliverable);
        onClose();
      }
    } catch {
      // silently handle
    } finally {
      setActing(false);
    }
  };

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
                        <a key={att.id} className="avm-file-link" href={attachmentUrl(att.id, "download")} download={att.original_name || att.file_name} target="_blank" rel="noopener noreferrer">
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
                        <div key={att.id} className="avm-image-thumb" style={{ position: "relative" }}>
                          <img src={attachmentUrl(att.id)} alt={att.original_name || att.file_name} onClick={() => setImagePreview(attachmentUrl(att.id))} />
                          <a
                            href={attachmentUrl(att.id, "download")}
                            download={att.original_name || att.file_name}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Download Image"
                            style={{
                              position: "absolute", bottom: "4px", right: "4px",
                              background: "rgba(0,0,0,0.75)", color: "#fff",
                              padding: "4px 6px", borderRadius: "4px", display: "flex",
                              alignItems: "center", gap: "4px", fontSize: "11px"
                            }}
                          >
                            <Download size={13} /> Download
                          </a>
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
                      download={submission.file_name}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <FileText size={16} />
                      <span>{submission.file_name}</span>
                      <Download size={14} style={{ marginLeft: "auto" }} />
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
              {subtask.reopen_link && (
                <div className="avm-detail-item" style={{ marginTop: "12px" }}>
                  <span className="avm-detail-label">Attached Link</span>
                  <a href={subtask.reopen_link} target="_blank" rel="noopener noreferrer" className="avm-detail-value" style={{ color: "#6366f1", textDecoration: "underline", wordBreak: "break-all" }}>
                    {subtask.reopen_link}
                  </a>
                </div>
              )}
              {subtask.reopen_file_name && (
                <div className="avm-detail-item" style={{ marginTop: "12px" }}>
                  <span className="avm-detail-label">Attached File(s) / Screenshots</span>
                  <div className="avm-attachments-list" style={{ marginTop: "6px", display: "flex", flexDirection: "column", gap: "6px" }}>
                    {(() => {
                      const paths = (subtask.reopen_file_path || "").split(",").map((p) => p.trim()).filter(Boolean);
                      const names = (subtask.reopen_file_name || "").split(",").map((n) => n.trim()).filter(Boolean);
                      return (names.length ? names : paths).map((name, idx) => {
                        const path = paths[idx] || paths[0] || name;
                        const url = downloadUrl(path, name);
                        return (
                          <a
                            key={idx}
                            className="avm-file-link"
                            href={url}
                            download={name}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => triggerDownload(e, path, name)}
                            style={{ display: "inline-flex", alignItems: "center", gap: "6px", color: "#6366f1", fontWeight: 500 }}
                          >
                            <FileText size={16} />
                            <span>{name}</span>
                            <Download size={14} style={{ marginLeft: "auto" }} />
                          </a>
                        );
                      });
                    })()}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Abandon Requested Details */}
          {subtask.status === "abandon_requested" && (
            <div className="avm-section" style={{ borderLeft: "4px solid var(--color-warning, #f59e0b)" }}>
              <h3 className="avm-section-title" style={{ color: "var(--color-warning, #d97706)" }}>Abandon Requested</h3>
              <div className="avm-submission-grid">
                <div className="avm-detail-item">
                  <span className="avm-detail-label">Requested By</span>
                  <span className="avm-detail-value">{(subtask.abandon_requested_by || subtask.abandonRequestedBy)?.name || "—"}</span>
                </div>
                {subtask.abandon_requested_at && (
                  <div className="avm-detail-item">
                    <span className="avm-detail-label">Requested On</span>
                    <span className="avm-detail-value">{formatDateTime(subtask.abandon_requested_at)}</span>
                  </div>
                )}
              </div>
              {subtask.abandon_reason && (
                <div className="avm-detail-item" style={{ marginTop: "12px" }}>
                  <span className="avm-detail-label">Reason</span>
                  <p className="avm-description-text">{subtask.abandon_reason}</p>
                </div>
              )}
            </div>
          )}

          {/* Abandoned Details */}
          {subtask.status === "abandoned" && (
            <div className="avm-section" style={{ borderLeft: "4px solid var(--color-danger, #ef4444)" }}>
              <h3 className="avm-section-title" style={{ color: "var(--color-danger, #dc2626)" }}>Subtask Abandoned</h3>
              <div className="avm-submission-grid">
                <div className="avm-detail-item">
                  <span className="avm-detail-label">Abandoned By</span>
                  <span className="avm-detail-value">{(subtask.abandoned_by || subtask.abandonedBy)?.name || "—"}</span>
                </div>
                {subtask.abandoned_at && (
                  <div className="avm-detail-item">
                    <span className="avm-detail-label">Abandoned On</span>
                    <span className="avm-detail-value">{formatDateTime(subtask.abandoned_at)}</span>
                  </div>
                )}
              </div>
              {subtask.abandon_reason && (
                <div className="avm-detail-item" style={{ marginTop: "12px" }}>
                  <span className="avm-detail-label">Reason</span>
                  <p className="avm-description-text">{subtask.abandon_reason}</p>
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

          {isAdminOrManager && subtask.status === "abandon_requested" && (
            <div className="avm-action-btns">
              <button className="avm-action-btn avm-approve-btn" disabled={acting} onClick={() => handleAbandonSubmit("")}>
                Approve Abandon
              </button>
              <button className="avm-action-btn avm-reject-btn" disabled={acting} onClick={() => { setAbandonAction("decline"); setAbandonModalOpen(true); }}>
                Decline Abandon
              </button>
            </div>
          )}

          {isAdminOrManager && subtask.status !== "abandon_requested" && subtask.status !== "abandoned" && subtask.status !== "submitted" && (
            <div className="avm-action-btns">
              <button className="avm-action-btn avm-reject-btn" style={{ background: "#dc2626", borderColor: "#dc2626", color: "#fff" }} disabled={acting} onClick={() => { setAbandonAction("direct"); setAbandonModalOpen(true); }}>
                Abandon
              </button>
            </div>
          )}

          {isMemberOrTeamLead && subtask.status !== "abandon_requested" && subtask.status !== "abandoned" && (
            <div className="avm-action-btns">
              <button className="avm-action-btn avm-reject-btn" style={{ background: "#f59e0b", borderColor: "#f59e0b", color: "#fff" }} disabled={acting} onClick={() => { setAbandonAction("request"); setAbandonModalOpen(true); }}>
                Request Abandon
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

      <AbandonModal
        isOpen={abandonModalOpen}
        onClose={() => setAbandonModalOpen(false)}
        title={
          abandonAction === "request"
            ? "Request to Abandon Subtask"
            : abandonAction === "decline"
            ? "Decline Abandon Request"
            : "Abandon Subtask"
        }
        subtitle={subtask.title}
        actionLabel={
          abandonAction === "request"
            ? "Submit Request"
            : abandonAction === "decline"
            ? "Decline Request"
            : "Confirm Abandon"
        }
        onSubmit={handleAbandonSubmit}
        loading={acting}
      />
    </div>,
    document.body
  );
}

export default AssignerViewModal;
