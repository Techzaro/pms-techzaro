/**
 * SubmitProjectModal.jsx
 * Modal form for submitting a project. Supports file uploads via drag-and-drop,
 * link attachments, and submission notes. Handles both initial submissions and
 * resubmissions for reopened status.
 */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { FileText, Upload, X, Image } from "lucide-react";
import API_URL from "../config/api";
import { authToken } from "../utils/auth";
import { formatDateTimeShort } from "../utils/formatDateTime";
import { notify } from "../utils/notify";
import { useSubmit } from "../hooks/useSubmit";
import SubmissionLinkSection from "./SubmissionLinkSection";
import LoadingButton from "./LoadingButton";
import "./SubmitDeliverableModal.css";
import "./layout/CreateTaskModal.css";

/**
 * Modal form for submitting or resubmitting a project.
 * @param {boolean} isOpen - Whether the modal is visible.
 * @param {Function} onClose - Callback to close the modal.
 * @param {Object} project - The project being submitted.
 * @param {Function} onSubmitSuccess - Callback after successful submission, receives updated project.
 */
function SubmitProjectModal({ isOpen, onClose, project, onSubmitSuccess }) {
  const [comment, setComment] = useState("");
  const [files, setFiles] = useState([]);
  const [links, setLinks] = useState([]);
  const { submitting, run } = useSubmit();

  // Lock body scroll and reset form state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      setComment("");
      setFiles([]);
      setLinks([]);
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  /** Appends newly selected files to the existing file list */
  const handleFileSelect = (e) => {
    const selected = Array.from(e.target.files || []);
    setFiles((prev) => [...prev, ...selected]);
    e.target.value = "";
  };

  const removeFile = (index) => setFiles((prev) => prev.filter((_, i) => i !== index));

  /** Handles file drops onto the dropzone area */
  const handleDrop = (e) => {
    e.preventDefault();
    setFiles((prev) => [...prev, ...Array.from(e.dataTransfer.files || [])]);
  };

  /**
   * Validates form data and submits the project with files, links, and notes.
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

        const res = await fetch(`${API_URL}/projects/${project.id}/submit`, {
          method: "POST",
          headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
          body: formData,
          _notifHandled: true,
        });

        const data = await res.json();
        if (res.ok) {
          onSubmitSuccess(data.project);
          onClose();
        } else {
          notify.error(data.message || "Failed to submit project.");
        }
      } catch {
        notify.error("An error occurred. Please try again.");
      }
    });
  };

  if (!isOpen || !project) return null;

  const statusLabel = (project.status || "pending").charAt(0).toUpperCase() + (project.status || "pending").slice(1);
  const isResubmit = project.status === "reopened";
  const isImageFile = (f) => f.type?.startsWith("image/");

  return createPortal(
    <div className="sd-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sd-modal" role="dialog" aria-modal="true">
        <div className="sd-header">
          <div>
            <h2 className="sd-title">{project.title}</h2>
            <div className="sd-meta">
              <span className={`sd-status-badge sd-status-${project.status || "pending"}`}>{statusLabel}</span>
              {project.end_date && (
                <span className="sd-due-date">Due Date & Time {formatDateTimeShort(project.end_date)}</span>
              )}
            </div>
          </div>
        </div>

        <div className="sd-body">
          <h3 className="sd-section-title">{isResubmit ? "Resubmit Project" : "Submit Project"}</h3>

          <div className="sd-field">
            <label className="sd-label">Submission Notes</label>
            <textarea
              className="sd-textarea"
              placeholder="Describe your submission..."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
            />
          </div>

          <div className="sd-field">
            <label className="sd-label">Attachments ({files.length})</label>
            <div
              className="sd-dropzone"
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => document.getElementById(`spm-file-${project.id}`)?.click()}
            >
              <div className="sd-dropzone-icon">
                <Upload size={24} strokeWidth={1.5} />
              </div>
              <p className="sd-dropzone-text">Drag & drop files or <span className="sd-browse">browse</span></p>
              <p className="sd-dropzone-hint">Supports: PDF, DOC, XLS, PPT, images, ZIP, RAR</p>
            </div>
            <input
              id={`spm-file-${project.id}`}
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
                    <button className="sd-file-remove" onClick={() => removeFile(i)}>
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <SubmissionLinkSection
            onLinksChange={setLinks}
          />
        </div>

        <div className="sd-footer">
          <button className="sd-cancel-btn" onClick={onClose} disabled={submitting}>Cancel</button>
          <LoadingButton className="sd-submit-btn" onClick={handleSubmit} loading={submitting}>
            {isResubmit ? "Resubmit Project" : "Submit Project"}
          </LoadingButton>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default SubmitProjectModal;
