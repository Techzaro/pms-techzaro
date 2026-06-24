import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { FileText, Upload, X, Image } from "lucide-react";
import API_URL from "../config/api";
import { authToken } from "../utils/auth";
import { formatDateTimeShort } from "../utils/formatDateTime";
import SubmissionLinkSection from "./SubmissionLinkSection";
import "./SubmitDeliverableModal.css";
import "./layout/CreateTaskModal.css";

function SubmitTaskModal({ isOpen, onClose, task, onSubmitSuccess }) {
  const [comment, setComment] = useState("");
  const [files, setFiles] = useState([]);
  const [links, setLinks] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      setComment("");
      setFiles([]);
      setLinks([]);
      setError("");
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  const handleFileSelect = (e) => {
    const selected = Array.from(e.target.files || []);
    setFiles((prev) => [...prev, ...selected]);
    e.target.value = "";
  };

  const removeFile = (index) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const dropped = Array.from(e.dataTransfer.files || []);
    setFiles((prev) => [...prev, ...dropped]);
  };

  const handleSubmit = async () => {
    const validLinks = links.map((l) => l.url);
    if (!comment.trim() && files.length === 0 && validLinks.length === 0) {
      setError("Please add a comment, attach files, or add links.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const token = authToken();
      const formData = new FormData();
      if (comment.trim()) formData.append("comment", comment.trim());
      files.forEach((f) => formData.append("files[]", f));
      validLinks.forEach((l) => formData.append("links[]", l));

      const res = await fetch(`${API_URL}/tasks/${task.id}/submit`, {
        method: "POST",
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
        body: formData,
      });

      const data = await res.json();
      if (res.ok) {
        onSubmitSuccess(data.task);
        onClose();
      } else {
        setError(data.message || "Failed to submit task.");
      }
    } catch {
      setError("An error occurred. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen || !task) return null;

  const statusLabel = (task.status || "pending").charAt(0).toUpperCase() + (task.status || "pending").slice(1);
  const isResubmit = task.status === "reopened";
  const projectLabel = task.project?.title || task.project_title || "";

  const isImageFile = (f) => f.type?.startsWith("image/");

  return createPortal(
    <div className="sd-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sd-modal" role="dialog" aria-modal="true">
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
              {task.end_date && (
                <span className="sd-due-date">Due Date & Time {formatDateTimeShort(task.end_date)}</span>
              )}
            </div>
          </div>
        </div>

        <div className="sd-body">
          <h3 className="sd-section-title">{isResubmit ? "Resubmit Task" : "Submit Task"}</h3>

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

          {error && <div className="sd-error">{error}</div>}
        </div>

        <div className="sd-footer">
          <button className="sd-cancel-btn" onClick={onClose} disabled={submitting}>Cancel</button>
          <button className="sd-submit-btn" onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Submitting..." : isResubmit ? "Resubmit Task" : "Submit Task"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default SubmitTaskModal;
