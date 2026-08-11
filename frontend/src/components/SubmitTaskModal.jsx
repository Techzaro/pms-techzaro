/**
 * SubmitTaskModal.jsx
 * Modal form for submitting a task. Supports file uploads via drag-and-drop,
 * link attachments, and submission notes. Handles both initial submissions and
 * resubmissions for reopened status.
 */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { FileText, Upload, X, Image } from "lucide-react";
import API_URL from "../config/api";
import { authToken } from "../utils/auth";
import { useEscapeKey } from "../hooks/useEscapeKey";
import useConfirmOnClose from "../hooks/useConfirmOnClose";
import { formatDateTimeShort } from "../utils/formatDateTime";
import { notify } from "../utils/notify";
import { useSubmit } from "../hooks/useSubmit";
import SubmissionLinkSection from "./SubmissionLinkSection";
import LoadingButton from "./LoadingButton";
import ConfirmModal from "./ConfirmModal";
import "./SubmitDeliverableModal.css";
import "./layout/CreateTaskModal.css";

/**
 * Modal form for submitting or resubmitting a task.
 * @param {boolean} isOpen - Whether the modal is visible.
 * @param {Function} onClose - Callback to close the modal.
 * @param {Object} task - The task being submitted.
 * @param {Function} onSubmitSuccess - Callback after successful submission, receives updated task.
 */
function SubmitTaskModal({ isOpen, onClose, task, existingSubmission = null, isEdit = false, onSubmitSuccess }) {
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
      if (isEdit && (existingSubmission || task?.latest_submission || task?.latestSubmission)) {
        const sub = existingSubmission || task?.latest_submission || task?.latestSubmission;
        setComment(sub?.comment || "");
        const prevLinks = (sub?.attachments || [])
          .filter((a) => a.attachment_type === "link")
          .map((a) => ({ url: a.url || a.file_name }));
        setLinks(prevLinks);
        setFiles([]);
      } else {
        setComment("");
        setFiles([]);
        setLinks([]);
      }
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [isOpen, isEdit, existingSubmission, task]);

  // Handle Ctrl+V (Clipboard Paste) for files/screenshots when modal is open
  useEffect(() => {
    if (!isOpen) return;

    const handlePaste = (e) => {
      const clipboardFiles = e.clipboardData?.files;
      if (clipboardFiles && clipboardFiles.length > 0) {
        const newFiles = Array.from(clipboardFiles);
        setIsDirty(true);
        setFiles((prev) => [...prev, ...newFiles]);
        notify.success(`Pasted ${newFiles.length} file(s) from clipboard`);
      }
    };

    window.addEventListener("paste", handlePaste);
    return () => {
      window.removeEventListener("paste", handlePaste);
    };
  }, [isOpen, setIsDirty]);

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
   * Validates form data and submits the task with files, links, and notes.
   * Shows error if no content (comment, files, or links) is provided.
   */
  const handleSubmit = async () => {
    const validLinks = links.map((l) => l.url);
    if (!comment.trim() && files.length === 0 && validLinks.length === 0) {
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

        const sub = existingSubmission || task?.latest_submission || task?.latestSubmission;
        const endpoint = isEdit && sub
          ? `${API_URL}/tasks/submissions/${sub.id}`
          : `${API_URL}/tasks/${task.id}/submit`;

        const res = await fetch(endpoint, {
          method: "POST",
          headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
          body: formData,
          _notifHandled: true,
        });

        const data = await res.json();
        if (res.ok) {
          onSubmitSuccess(data.task);
          onClose();
        } else {
          notify.error(data.message || "Failed to submit task.");
        }
      } catch {
        notify.error("An error occurred. Please try again.");
      }
    });
  };

  if (!isOpen || !task) return null;

  const statusLabel = (task.status || "pending").charAt(0).toUpperCase() + (task.status || "pending").slice(1);
  const isResubmit = task.status === "reopened";
  const projectLabel = task.project?.title || task.project_title || "";

  const isImageFile = (f) => f.type?.startsWith("image/");

  return createPortal(
    <>
    <div className="sd-overlay">
      <div className="sd-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="sd-header">
          <div>
            <h2 className="sd-title">{task.title}</h2>
            <div className="sd-meta">
              {projectLabel && (
                <span className="sd-project-name" style={{ fontSize: "13px", color: "#6366f1", fontWeight: 500, marginRight: "12px" }}>
                  Project: {projectLabel}
                </span>
              )}
              {task.assigner && (
                <span className="sd-assigner" style={{ fontSize: "13px", color: "#6b7280", marginRight: "12px" }}>
                  Assigned by: {task.assigner.name}
                </span>
              )}
              <span className={`sd-status-badge sd-status-${task.status || "pending"}`}>{statusLabel}</span>
              {task.due_date && (
                <span className="sd-due-date" style={{ marginLeft: "12px" }}>
                  Due Date & Time {formatDateTimeShort(task.due_date)}
                </span>
              )}
            </div>
          </div>
          <button className="sd-close-btn" onClick={handleClose} title="Close">
            <X size={18} />
          </button>
        </div>

        <div className="sd-body">
          <h3 className="sd-section-title">{isEdit ? "Edit Submission" : isResubmit ? "Resubmit Task" : "Submit Task"}</h3>

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
              onClick={() => document.getElementById(`stm-file-${task.id}`)?.click()}
            >
              <div className="sd-dropzone-icon">
                <Upload size={24} strokeWidth={1.5} />
              </div>
              <p className="sd-dropzone-text">Drag & drop files or <span className="sd-browse">browse</span></p>
              <p className="sd-dropzone-hint">Supports: PDF, DOC, XLS, PPT, images, ZIP, RAR</p>
            </div>
            <input
              id={`stm-file-${task.id}`}
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
            {isResubmit ? "Resubmit Task" : "Submit Task"}
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

export default SubmitTaskModal;
