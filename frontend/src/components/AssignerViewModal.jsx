import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { FileText } from "lucide-react";
import API_URL from "../config/api";
import { authToken } from "../utils/auth";
import ConfirmationDialog from "./ConfirmationDialog";
import ReopenDialog from "./ReopenDialog";
import "./AssignerViewModal.css";

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

function AssignerViewModal({ isOpen, onClose, deliverable, onActionSuccess }) {
  const [submission, setSubmission] = useState(null);
  const [loading, setLoading] = useState(true);
  const [confirmDialog, setConfirmDialog] = useState({ open: false, type: null });
  const [reopenDialog, setReopenDialog] = useState(false);
  const [acting, setActing] = useState(false);

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

  const handleAction = async (action, body = {}) => {
    setActing(true);
    try {
      const token = authToken();
      let res;
      if (action === "reopen") {
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

  const confirmMessages = {
    approve: "Are you sure you want to approve this deliverable?",
    reject: "Are you sure you want to reject this deliverable? The assignee will not be able to resubmit.",
    reopen: "Are you sure you want to reject and reopen this deliverable?",
  };

  const confirmColors = {
    approve: "#16A34A",
    reject: "#DC2626",
    reopen: "#D97706",
  };

  if (!isOpen || !deliverable) return null;

  const statusLabel = (deliverable.status || "pending").charAt(0).toUpperCase() + (deliverable.status || "pending").slice(1);
  const attachments = submission?.attachments || [];
  const files = attachments.filter((item) => item.attachment_type === "file");
  const images = attachments.filter((item) => item.attachment_type === "image");
  const links = attachments.filter((item) => item.attachment_type === "link");

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
                    <span className="avm-detail-label">Comment</span>
                    <p className="avm-description-text">{submission.comment}</p>
                  </div>
                )}
                {submission.file_name && (
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
                {files.length > 0 && (
                  <div className="avm-detail-item" style={{ marginTop: "12px" }}>
                    <span className="avm-detail-label">Submitted Files</span>
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "6px" }}>
                      {files.map((file) => (
                        <a key={`assignee-file-${file.id}`} className="avm-file-link" href={buildAttachmentUrl(file)} target="_blank" rel="noopener noreferrer">
                          <FileText size={16} />
                          <span>{file.original_name || file.file_name}</span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
                {images.length > 0 && (
                  <div className="avm-detail-item" style={{ marginTop: "12px" }}>
                    <span className="avm-detail-label">Submitted Images</span>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", marginTop: "8px" }}>
                      {images.map((image) => (
                        <a key={`assignee-image-${image.id}`} href={buildAttachmentUrl(image)} target="_blank" rel="noopener noreferrer">
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
                  <div className="avm-detail-item" style={{ marginTop: "12px" }}>
                    <span className="avm-detail-label">Submitted Links</span>
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "6px" }}>
                      {links.map((link) => (
                        <a key={`assignee-link-${link.id}`} className="avm-file-link" href={buildAttachmentUrl(link)} target="_blank" rel="noopener noreferrer">
                          <span>{link.url}</span>
                        </a>
                      ))}
                    </div>
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
