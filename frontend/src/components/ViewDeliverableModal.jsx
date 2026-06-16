import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { FileText } from "lucide-react";
import API_URL from "../config/api";
import { authToken } from "../utils/auth";
import "./ViewDeliverableModal.css";

function formatDateTime(value) {
  if (!value) return "\u2014";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "\u2014";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function buildAttachmentUrl(attachment) {
  if (!attachment) return null;
  if (attachment.attachment_type === "link") return attachment.url;
  const url = attachment.full_url || attachment.url;
  if (!url) return null;
  if (url.startsWith("http")) return url;
  return `${API_URL.replace("/api", "")}${url}`;
}

function ViewDeliverableModal({ isOpen, onClose, deliverable, onSubmitSuccess }) {
  const [submission, setSubmission] = useState(null);
  const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState("");
  const [file, setFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isOpen || !deliverable) return;
    document.body.style.overflow = "hidden";

    const token = authToken();
    fetch(`${API_URL}/deliverables/${deliverable.id}/latest-submission`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => { setSubmission(data.submission); setLoading(false); })
      .catch(() => { setLoading(false); });

    return () => { document.body.style.overflow = ""; };
  }, [isOpen, deliverable]);

  const handleResubmit = async () => {
    if (!comment.trim() && !file) {
      setError("Please add a comment or attach a file.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const token = authToken();
      const formData = new FormData();
      if (comment.trim()) formData.append("comment", comment.trim());
      if (file) formData.append("file", file);

      const res = await fetch(`${API_URL}/deliverables/${deliverable.id}/submit`, {
        method: "POST",
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
        body: formData,
      });

      const data = await res.json();
      if (res.ok) {
        if (onSubmitSuccess) onSubmitSuccess(data.deliverable);
        onClose();
      } else {
        setError(data.message || "Failed to resubmit deliverable.");
      }
    } catch {
      setError("An error occurred. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen || !deliverable) return null;

  const statusLabel = (deliverable.status || "pending").charAt(0).toUpperCase() + (deliverable.status || "pending").slice(1);
  const isReopened = deliverable.status === "reopened";
  const attachments = submission?.attachments || [];
  const files = attachments.filter((item) => item.attachment_type === "file");
  const images = attachments.filter((item) => item.attachment_type === "image");
  const links = attachments.filter((item) => item.attachment_type === "link");

  return createPortal(
    <div className="vd-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="vd-modal" role="dialog" aria-modal="true">
        <div className="vd-header">
          <div>
            <h2 className="vd-title">{deliverable.title}</h2>
            <div className="vd-meta">
              <span className={`vd-status-badge vd-status-${deliverable.status || "pending"}`}>{statusLabel}</span>
              {deliverable.due_date && (
                <span className="vd-due-date">Due Date & Time {formatDateTime(deliverable.due_date)}</span>
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
                      <span className="vd-detail-value">{deliverable.reopenedBy?.name || "\u2014"}</span>
                    </div>
                    <div className="vd-detail-item">
                      <span className="vd-detail-label">Reopened On</span>
                      <span className="vd-detail-value">{formatDateTime(deliverable.reopened_at)}</span>
                    </div>
                  </div>
                  {deliverable.reopen_comment && (
                    <div className="vd-detail-item" style={{ marginTop: "12px" }}>
                      <span className="vd-detail-label">Comment</span>
                      <p className="vd-text">{deliverable.reopen_comment}</p>
                    </div>
                  )}
                  {deliverable.reopen_instructions && (
                    <div className="vd-detail-item" style={{ marginTop: "12px" }}>
                      <span className="vd-detail-label">Instructions</span>
                      <p className="vd-text">{deliverable.reopen_instructions}</p>
                    </div>
                  )}
                  {deliverable.reopen_new_deadline && (
                    <div className="vd-detail-item" style={{ marginTop: "12px" }}>
                      <span className="vd-detail-label">New Deadline</span>
                      <span className="vd-detail-value">{formatDateTime(deliverable.reopen_new_deadline)}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Submission Details */}
              {submission && (
                <>
                  <div className="vd-section">
                    <h3 className="vd-section-title">Submission Notes</h3>
                    <p className="vd-text">{submission.comment || "\u2014"}</p>
                  </div>

                  {submission.file_name && (
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
                  {files.length > 0 && (
                    <div className="vd-section">
                      <h3 className="vd-section-title">Submitted Files</h3>
                      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        {files.map((file) => (
                          <a key={`vd-file-${file.id}`} className="vd-file-link" href={buildAttachmentUrl(file)} target="_blank" rel="noopener noreferrer">
                            <FileText size={16} />
                            <span>{file.original_name || file.file_name}</span>
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                  {images.length > 0 && (
                    <div className="vd-section">
                      <h3 className="vd-section-title">Submitted Images</h3>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
                        {images.map((image) => (
                          <a key={`vd-image-${image.id}`} href={buildAttachmentUrl(image)} target="_blank" rel="noopener noreferrer">
                            <img
                              src={buildAttachmentUrl(image)}
                              alt={image.original_name || image.file_name || "Submission image"}
                              style={{ width: "84px", height: "84px", objectFit: "cover", borderRadius: "8px", border: "1px solid #e5e7eb" }}
                            />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                  {links.length > 0 && (
                    <div className="vd-section">
                      <h3 className="vd-section-title">Submitted Links</h3>
                      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        {links.map((link) => (
                          <a key={`vd-link-${link.id}`} className="vd-file-link" href={buildAttachmentUrl(link)} target="_blank" rel="noopener noreferrer">
                            <span>{link.url}</span>
                          </a>
                        ))}
                      </div>
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
                  <h3 className="vd-section-title">Resubmit Deliverable</h3>
                  <div className="vd-field">
                    <label className="vd-label">Comment</label>
                    <textarea
                      className="vd-textarea"
                      placeholder="Describe your revised submission..."
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      rows={3}
                    />
                  </div>
                  <div className="vd-field">
                    <label className="vd-label">Attachments</label>
                    <div
                      className="vd-dropzone"
                      onClick={() => document.getElementById(`vd-file-${deliverable.id}`)?.click()}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files.length) setFile(e.dataTransfer.files[0]); }}
                    >
                      {file ? (
                        <div className="vd-file-preview">
                          <span className="vd-file-name">{file.name}</span>
                          <button className="vd-file-remove" onClick={(e) => { e.stopPropagation(); setFile(null); }}>Remove</button>
                        </div>
                      ) : (
                        <p className="vd-dropzone-text">Drag & drop a file or <span className="vd-browse">browse</span></p>
                      )}
                    </div>
                    <input
                      type="file"
                      id={`vd-file-${deliverable.id}`}
                      style={{ display: "none" }}
                      onChange={(e) => { if (e.target.files.length) setFile(e.target.files[0]); }}
                    />
                  </div>
                  {error && <div className="vd-error">{error}</div>}
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

        <div className="vd-footer">
          <button className="vd-close-btn" onClick={onClose}>Close</button>
          {isReopened && (
            <button className="vd-resubmit-btn" onClick={handleResubmit} disabled={submitting}>
              {submitting ? "Submitting..." : "Resubmit"}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

export default ViewDeliverableModal;
