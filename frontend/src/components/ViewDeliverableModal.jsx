/**
 * ViewDeliverableModal.jsx
 * Modal for viewing a subtask's submission details as an admin/manager.
 * Displays reopen info, submission notes, file/image/link attachments, and
 * allows resubmission when the subtask is in reopened status.
 */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { FileText, Download, ExternalLink } from "lucide-react";
import API_URL from "../config/api";
import { authToken } from "../utils/auth";
import { useEscapeKey } from "../hooks/useEscapeKey";
import useConfirmOnClose from "../hooks/useConfirmOnClose";
import { formatDateTime } from "../utils/formatDateTime";
import { notify, showSuccessMessage } from "../utils/notify";
import SubmitDeliverableModal from "./SubmitDeliverableModal";
import "./ViewDeliverableModal.css";

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

/**
 * Modal for viewing subtask details and resubmitting when reopened.
 * @param {boolean} isOpen - Whether the modal is visible.
 * @param {Function} onClose - Callback to close the modal.
 * @param {Object} subtask - The subtask to display.
 * @param {Function} onSubmitSuccess - Callback after successful resubmission.
 */
function ViewDeliverableModal({ isOpen, onClose, subtask, onSubmitSuccess }) {
  const { isDirty, setIsDirty, handleClose, ConfirmDialog } = useConfirmOnClose(onClose);
  useEscapeKey(isOpen, handleClose);

  const [submission, setSubmission] = useState(null);
  const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState("");
  const [files, setFiles] = useState([]);
  const [links, setLinks] = useState([""]);
  const [submitting, setSubmitting] = useState(false);
  const [imagePreview, setImagePreview] = useState(null);
  const [editModalOpen, setEditModalOpen] = useState(false);

  useEffect(() => {
    if (!isOpen || !subtask) return;
    document.body.style.overflow = "hidden";

    const token = authToken();
    fetch(`${API_URL}/deliverables/${subtask.id}/latest-submission`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      skipLoader: true,
    })
      .then((res) => res.json())
      .then((data) => { setSubmission(data.submission); setLoading(false); })
      .catch(() => { setLoading(false); });

    return () => { document.body.style.overflow = ""; };
  }, [isOpen, subtask]);

  /**
   * Normalizes a URL by trimming whitespace and prepending https:// if missing.
   * @param {string} url - The raw URL string.
   * @returns {string} The normalized URL.
   */
  const normalizeUrl = (url) => {
    url = url.trim();
    if (url && !/^https?:\/\//i.test(url)) return "https://" + url;
    return url;
  };

   /** Handles resubmission of the subtask with updated files, links, and comment */
  const handleResubmit = async () => {
    const validLinks = links.filter((l) => l.trim()).map(normalizeUrl);
    if (!comment.trim() && files.length === 0 && validLinks.length === 0) {
      notify.error("Please add a comment, attach files, or add links.");
      return;
    }
    setSubmitting(true);
    try {
      const token = authToken();
      const formData = new FormData();
      if (comment.trim()) formData.append("comment", comment.trim());
      files.forEach((f) => formData.append("files[]", f));
      validLinks.forEach((l) => formData.append("links[]", l));

      const res = await fetch(`${API_URL}/deliverables/${subtask.id}/submit`, {
        method: "POST",
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
        body: formData,
        _notifHandled: true,
      });

      const data = await res.json();
      if (res.ok) {
        showSuccessMessage("Subtask", "resubmitted");
        if (onSubmitSuccess) onSubmitSuccess(data.deliverable);
        onClose();
      } else {
        notify.error(data.message || "Failed to resubmit subtask.");
      }
    } catch {
      notify.error("An error occurred. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen || !subtask) return null;

  const token = authToken();
  /** Constructs download URL for a specific attachment with optional action param */
  const attachmentUrl = (attId, action) => {
    let url = `${API_URL}/deliverables/attachment/${attId}/download`;
    const params = [];
    if (action) params.push(`action=${action}`);
    if (token) params.push(`token=${token}`);
    if (params.length) url += `?${params.join("&")}`;
    return url;
  };

  const statusLabel = (subtask.status || "pending").charAt(0).toUpperCase() + (subtask.status || "pending").slice(1);
  const isReopened = subtask.status === "reopened";
  const attachments = submission?.attachments || [];
  const viewFiles = attachments.filter((a) => a.attachment_type === "file");
  const viewImages = attachments.filter((a) => a.attachment_type === "image");
  const viewLinks = attachments.filter((a) => a.attachment_type === "link");

  return createPortal(
    <div className="vd-overlay">
      <div className="vd-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="vd-header">
          <div>
            <h2 className="vd-title">{subtask.title}</h2>
            <div className="vd-meta">
              <span className={`vd-status-badge vd-status-${subtask.status || "pending"}`}>{statusLabel}</span>
              {subtask.due_date && (
                <span className="vd-due-date">Due Date & Time {formatDateTime(subtask.due_date)}</span>
              )}
            </div>
          </div>
        </div>

        <div className="vd-body">
          {loading ? (
            <div className="vd-loading">Loading details...</div>
          ) : (
            <>
              {/* Reopen Details */}
              {isReopened && (
                <div className="vd-section vd-reopen-section">
                  <h3 className="vd-section-title">Reopen Details</h3>
                  <div className="vd-details-grid">
                    <div className="vd-detail-item">
                      <span className="vd-detail-label">Reopened By</span>
                      <span className="vd-detail-value">{subtask.reopenedBy?.name || "\u2014"}</span>
                    </div>
                    <div className="vd-detail-item">
                      <span className="vd-detail-label">Reopened On</span>
                      <span className="vd-detail-value">{formatDateTime(subtask.reopened_at)}</span>
                    </div>
                  </div>
                  {subtask.reopen_comment && (
                    <div className="vd-detail-item" style={{ marginTop: "12px" }}>
                      <span className="vd-detail-label">Comment</span>
                      <p className="vd-text">{subtask.reopen_comment}</p>
                    </div>
                  )}
                  {subtask.reopen_instructions && (
                    <div className="vd-detail-item" style={{ marginTop: "12px" }}>
                      <span className="vd-detail-label">Instructions</span>
                      <p className="vd-text">{subtask.reopen_instructions}</p>
                    </div>
                  )}
                  {subtask.reopen_new_deadline && (
                    <div className="vd-detail-item" style={{ marginTop: "12px" }}>
                      <span className="vd-detail-label">New Deadline</span>
                      <span className="vd-detail-value">{formatDateTime(subtask.reopen_new_deadline)}</span>
                    </div>
                  )}
                  {subtask.reopen_link && (
                    <div className="vd-detail-item" style={{ marginTop: "12px" }}>
                      <span className="vd-detail-label">Attached Link</span>
                      <a href={subtask.reopen_link} target="_blank" rel="noopener noreferrer" style={{ color: "#6366f1", textDecoration: "underline", wordBreak: "break-all" }}>
                        {subtask.reopen_link}
                      </a>
                    </div>
                  )}
                  {subtask.reopen_file_name && (
                    <div className="vd-detail-item" style={{ marginTop: "12px" }}>
                      <span className="vd-detail-label">Attached Files / Screenshots</span>
                      <div style={{ marginTop: "6px", display: "flex", flexDirection: "column", gap: "6px" }}>
                        {(subtask.reopen_file_name || "").split(",").map((name, idx) => {
                          const cleanName = name.trim();
                          const paths = (subtask.reopen_file_path || "").split(",").map((p) => p.trim());
                          const path = paths[idx] || paths[0] || cleanName;
                          return (
                            <a key={idx} className="vd-file-link" href={fileUrl(path) || `${API_BASE}/storage/${path}`} target="_blank" rel="noopener noreferrer" download={cleanName}>
                              <FileText size={16} />
                              <span>{cleanName}</span>
                              <Download size={14} style={{ marginLeft: "auto" }} />
                            </a>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Submission Details */}
              {submission && (
                <>
                  <div className="vd-section">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <h3 className="vd-section-title" style={{ margin: 0 }}>Submission Notes</h3>
                      {!subtask.has_edited_submission &&
                        ((submission.submitted_by || submission.submittedBy)?.id === getUser()?.id || submission.submitted_by === getUser()?.id) && (
                          <button
                            type="button"
                            className="task-add-phase-btn"
                            onClick={() => setEditModalOpen(true)}
                            style={{ padding: "4px 12px", fontSize: 12, cursor: "pointer", background: "#6366f1", color: "#fff", border: "none", borderRadius: 6 }}
                          >
                            Edit Submission
                          </button>
                        )}
                    </div>
                    <p className="vd-text">{submission.comment || "—"}</p>
                  </div>

                  {/* Files */}
                  {viewFiles.length > 0 && (
                    <div className="vd-section">
                      <h3 className="vd-section-title">Files ({viewFiles.length})</h3>
                      <div className="vd-file-list">
                        {viewFiles.map((att) => (
                          <a key={att.id} className="vd-file-link" href={fileUrl(att.full_url)} target="_blank" rel="noopener noreferrer">
                            <FileText size={16} />
                            <span className="vd-file-name">{att.original_name || att.file_name}</span>
                            {att.file_size && <span className="vd-file-size">{formatFileSize(att.file_size)}</span>}
                            <Download size={14} />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Images */}
                  {viewImages.length > 0 && (
                    <div className="vd-section">
                      <h3 className="vd-section-title">Images ({viewImages.length})</h3>
                      <div className="vd-image-grid">
                        {viewImages.map((att) => (
                          <div key={att.id} className="vd-image-thumb" onClick={() => setImagePreview(fileUrl(att.full_url))}>
                            <img src={fileUrl(att.full_url)} alt={att.original_name || att.file_name} />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Links */}
                  {viewLinks.length > 0 && (
                    <div className="vd-section">
                      <h3 className="vd-section-title">Links ({viewLinks.length})</h3>
                      <div className="vd-file-list">
                        {viewLinks.map((att) => (
                          <div key={att.id} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <a className="vd-file-link" href={att.url} target="_blank" rel="noopener noreferrer" style={{ flex: 1 }}>
                              <ExternalLink size={16} />
                              <span className="vd-file-name">{att.original_name || att.url}</span>
                            </a>
                            <button
                              type="button"
                              className="vd-close-btn"
                              style={{ padding: "4px 8px", fontSize: "11px", height: "auto" }}
                              onClick={() => {
                                navigator.clipboard.writeText(att.url);
                                notify.success("Link copied to clipboard!");
                              }}
                            >
                              Copy Link
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Old single file fallback */}
                  {submission.file_name && attachments.length === 0 && (
                    <div className="vd-section">
                      <h3 className="vd-section-title">Attached File</h3>
                      <a
                        className="vd-file-link"
                        href={`${API_URL}/deliverables/submission-file/${submission.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <FileText size={16} />
                        <span>{submission.file_name}</span>
                      </a>
                    </div>
                  )}

                  <div className="vd-section">
                    <h3 className="vd-section-title">Submission Details</h3>
                    <div className="vd-details-grid">
                      <div className="vd-detail-item">
                        <span className="vd-detail-label">Submitted By</span>
                        <span className="vd-detail-value">{submission.submitted_by?.name || "Unknown"}</span>
                      </div>
                      <div className="vd-detail-item">
                        <span className="vd-detail-label">Submitted At</span>
                        <span className="vd-detail-value">{formatDateTime(submission.created_at)}</span>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* Resubmit Form for Reopened Status */}
              {isReopened && (
                <div className="vd-section vd-resubmit-section">
                  <h3 className="vd-section-title">Resubmit Subtask</h3>
                  <div className="vd-field">
                    <label className="vd-label">Comment</label>
                    <textarea
                      className="vd-textarea"
                      placeholder="Describe your revised submission..."
                      value={comment}
                      onChange={(e) => { setIsDirty(true); setComment(e.target.value); }}
                      rows={3}
                    />
                  </div>
                  <div className="vd-field">
                    <label className="vd-label">Attachments</label>
                    <div
                      className="vd-dropzone"
                      onClick={() => document.getElementById(`vd-file-${subtask.id}`)?.click()}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files.length) { setIsDirty(true); setFiles(Array.from(e.dataTransfer.files)); } }}
                    >
                      <p className="vd-dropzone-text">Drag & drop files or <span className="vd-browse">browse</span></p>
                    </div>
                    <input
                      type="file"
                      multiple
                      id={`vd-file-${subtask.id}`}
                      style={{ display: "none" }}
                      onChange={(e) => { setIsDirty(true); setFiles(Array.from(e.target.files || [])); }}
                    />
                    <div className="vd-field">
                      <label className="vd-label">Links</label>
                      {links.map((link, i) => (
                        <div key={i} style={{ display: "flex", gap: "6px", marginBottom: "6px" }}>
                          <input
                            type="url"
                            style={{ flex: 1, padding: "8px 10px", border: "1px solid #E5E7EB", borderRadius: "8px", fontSize: "13px" }}
                            placeholder="https://example.com"
                            value={link}
                            onChange={(e) => { setIsDirty(true); setLinks(links.map((l, j) => (j === i ? e.target.value : l))); }}
                          />
                          {i === links.length - 1 && (
                            <button type="button" style={{ padding: "4px 10px", background: "var(--color-success-bg)", border: "1px solid var(--color-success)", borderRadius: "6px", color: "var(--color-success)", cursor: "pointer" }} onClick={() => { setIsDirty(true); setLinks([...links, ""]); }}>+</button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {!submission && !isReopened && (
                <div className="vd-empty">
                  <p>No submission found.</p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Image Preview Modal */}
        {imagePreview && (
          <div className="vd-image-overlay" onClick={() => setImagePreview(null)}>
            <img src={imagePreview} alt="Preview" className="vd-image-full" />
          </div>
        )}

        <div className="vd-footer">
          <button className="vd-close-btn" onClick={handleClose}>Close</button>
          {isReopened && (
            <button className="vd-resubmit-btn" onClick={handleResubmit} disabled={submitting}>
              {submitting ? "Submitting..." : "Resubmit"}
            </button>
          )}
        </div>
        {ConfirmDialog}
      </div>

      {editModalOpen && submission && (
        <SubmitDeliverableModal
          isOpen={editModalOpen}
          onClose={() => setEditModalOpen(false)}
          subtask={subtask}
          submissionToEdit={submission}
          onSubmitSuccess={(updatedSubtask) => {
            if (onSubmitSuccess) onSubmitSuccess(updatedSubtask);
            onClose();
          }}
        />
      )}
    </div>,
    document.body
  );
}

export default ViewDeliverableModal;
