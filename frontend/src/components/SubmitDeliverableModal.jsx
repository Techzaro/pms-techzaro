/**
 * SubmitDeliverableModal.jsx
 * Modal form for submitting a subtask. Supports file uploads via drag-and-drop,
 * link attachments, and submission notes. Handles both initial submissions and
 * resubmissions for rework-required status.
 */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { FileText, Upload, X, Image } from "lucide-react";
import API_URL from "../config/api";
import { authToken } from "../utils/auth";
import { useEscapeKey } from "../hooks/useEscapeKey";
import useConfirmOnClose from "../hooks/useConfirmOnClose";
import { formatDateTimeShort } from "../utils/formatDateTime";
import { notify, showSuccessMessage } from "../utils/notify";
import { useSubmit } from "../hooks/useSubmit";
import SubmissionLinkSection from "./SubmissionLinkSection";
import LoadingButton from "./LoadingButton";
import ConfirmModal from "./ConfirmModal";
import "./SubmitDeliverableModal.css";
import "./layout/CreateTaskModal.css";

/**
 * Modal form for submitting or resubmitting a subtask.
 * @param {boolean} isOpen - Whether the modal is visible.
 * @param {Function} onClose - Callback to close the modal.
 * @param {Object} subtask - The subtask being submitted.
 * @param {Function} onSubmitSuccess - Callback after successful submission, receives updated subtask.
 */
function SubmitDeliverableModal({ isOpen, onClose, subtask, onSubmitSuccess, submissionToEdit = null }) {
  const { isDirty, setIsDirty, handleClose, ConfirmDialog } = useConfirmOnClose(onClose);
  useEscapeKey(isOpen, handleClose);

  const [comment, setComment] = useState("");
  const [files, setFiles] = useState([]);
  const [links, setLinks] = useState([]);
  const { submitting, run } = useSubmit();
  const [fileRemoveConfirmOpen, setFileRemoveConfirmOpen] = useState(false);
  const [pendingFileIndex, setPendingFileIndex] = useState(-1);

  // Lock body scroll and reset form state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      setComment(submissionToEdit ? submissionToEdit.comment || "" : "");
      setFiles([]);
      setLinks([]);
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [isOpen, submissionToEdit]);

  /** Appends newly selected files to the existing file list */
  const handleFileSelect = (e) => {
    const selected = Array.from(e.target.files || []);
    setIsDirty(true);
    setFiles((prev) => [...prev, ...selected]);
    e.target.value = "";
  };

  const removeFile = (index) => { setIsDirty(true); setFiles((prev) => prev.filter((_, i) => i !== index)); };

  /** Handles file drops onto the dropzone area */
  const handleDrop = (e) => {
    e.preventDefault();
    setIsDirty(true);
    setFiles((prev) => [...prev, ...Array.from(e.dataTransfer.files || [])]);
  };

  /**
   * Validates form data and submits or edits the subtask submission.
   */
  const handleSubmit = async () => {
    const validLinks = links.map((l) => l.url);
    if (!comment.trim() && files.length === 0 && validLinks.length === 0 && !submissionToEdit) {
      notify.error("Please add a comment, attach files, or add links.");
      return;
    }
    await run(async () => {
      try {
        const token = authToken();
        const formData = new FormData();
        if (comment.trim()) formData.append("comment", comment.trim());
        files.forEach((f) => formData.append("files[]", f));
        validLinks.forEach((l) => formData.append("links[]", l));

        const endpoint = submissionToEdit
          ? `${API_URL}/deliveries/submissions/${submissionToEdit.id}`
          : `${API_URL}/deliverables/${subtask.id}/submit`;

        const res = await fetch(endpoint, {
          method: "POST",
          headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
          body: formData,
          _notifHandled: true,
        });

        const data = await res.json();
        if (res.ok) {
          showSuccessMessage("Submission", submissionToEdit ? "updated" : "submitted");
          onSubmitSuccess(data.deliverable || subtask);
          onClose();
        } else {
          notify.error(data.message || "Failed to submit.");
        }
      } catch {
        notify.error("An error occurred. Please try again.");
      }
    });
  };

  if (!isOpen || !subtask) return null;

  const statusLabel = (subtask.status || "pending").charAt(0).toUpperCase() + (subtask.status || "pending").slice(1);
  const isImageFile = (f) => f.type?.startsWith("image/");

  return createPortal(
    <>
    <div className="sd-overlay">
      <div className="sd-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="sd-header">
          <div>
            <h2 className="sd-title">{subtask.title}</h2>
            <div className="sd-meta">
              <span className={`sd-status-badge sd-status-${subtask.status || "pending"}`}>{statusLabel}</span>
              {subtask.due_date && (
                <span className="sd-due-date">Due Date {formatDateTimeShort(subtask.due_date)}</span>
              )}
            </div>
          </div>
        </div>

        <div className="sd-body">
          <h3 className="sd-section-title">Submit Subtask</h3>

          <div className="sd-field">
            <label className="sd-label">Submission Notes</label>
            <textarea
              className="sd-textarea"
              placeholder="Describe your submission..."
              value={comment}
              onChange={(e) => { setIsDirty(true); setComment(e.target.value); }}
              rows={3}
            />
          </div>

          <div className="sd-field">
            <label className="sd-label">Attachments ({files.length})</label>
            <div
              className="sd-dropzone"
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => document.getElementById(`sdm-file-${subtask.id}`)?.click()}
            >
              <div className="sd-dropzone-icon">
                <Upload size={24} strokeWidth={1.5} />
              </div>
              <p className="sd-dropzone-text">Drag & drop files or <span className="sd-browse">browse</span></p>
              <p className="sd-dropzone-hint">Supports: PDF, DOC, XLS, PPT, images, ZIP, RAR</p>
            </div>
            <input
              id={`sdm-file-${subtask.id}`}
              type="file"
              multiple
              style={{ display: "none" }}
              onChange={handleFileSelect}
            />
            {files.length > 0 && (
              <div className="sd-file-list">
                {files.map((f, i) => (
                  <div key={i} className="sd-file-preview">
                    <div className="sd-file-icon">
                      {isImageFile(f) ? <Image size={18} strokeWidth={1.5} /> : <FileText size={18} strokeWidth={1.5} />}
                    </div>
                    <div className="sd-file-info">
                      <span className="sd-file-name">{f.name}</span>
                      <span className="sd-file-size">{(f.size / 1024 / 1024).toFixed(1)} MB</span>
                    </div>
                    <button className="sd-file-remove" onClick={() => { setPendingFileIndex(i); setFileRemoveConfirmOpen(true); }}>
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <SubmissionLinkSection
            onLinksChange={(val) => { setIsDirty(true); setLinks(val); }}
          />
        </div>

        <div className="sd-footer">
          <button className="sd-cancel-btn" onClick={handleClose} disabled={submitting}>Cancel</button>
          <LoadingButton className="sd-submit-btn" onClick={handleSubmit} loading={submitting}>
            {subtask.status === "rework_required" ? "Resubmit Subtask" : "Submit Subtask"}
          </LoadingButton>
        </div>
      </div>
    </div>
    <ConfirmModal
      isOpen={fileRemoveConfirmOpen}
      onClose={() => { setFileRemoveConfirmOpen(false); setPendingFileIndex(-1); }}
      onConfirm={() => { removeFile(pendingFileIndex); setFileRemoveConfirmOpen(false); setPendingFileIndex(-1); }}
      title="Remove File"
      message="Are you sure you want to remove this file?"
      confirmText="Remove"
      cancelText="Cancel"
      danger
    />
    {ConfirmDialog}
    </>,
    document.body
  );
}

export default SubmitDeliverableModal;
