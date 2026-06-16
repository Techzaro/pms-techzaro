import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import API_URL from "../config/api";
import { authToken } from "../utils/auth";
import "./SubmitDeliverableModal.css";

function formatShortDate(value) {
  if (!value) return "\u2014";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "\u2014";
  const date = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  const time = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
  return `${date} ${time}`;
}

function SubmitProjectModal({ isOpen, onClose, project, onSubmitSuccess }) {
  const [comment, setComment] = useState("");
  const [file, setFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      setComment("");
      setFile(null);
      setError("");
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  const handleSubmit = async () => {
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

      const res = await fetch(`${API_URL}/projects/${project.id}/submit`, {
        method: "POST",
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
        body: formData,
      });

      const data = await res.json();
      if (res.ok) {
        onSubmitSuccess(data.project);
        onClose();
      } else {
        setError(data.message || "Failed to submit project.");
      }
    } catch {
      setError("An error occurred. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen || !project) return null;

  const statusLabel = (project.status || "pending").charAt(0).toUpperCase() + (project.status || "pending").slice(1);
  const isResubmit = project.status === "reopened";

  return createPortal(
    <div className="sd-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sd-modal" role="dialog" aria-modal="true">
        <div className="sd-header">
          <div>
            <h2 className="sd-title">{project.title}</h2>
            <div className="sd-meta">
              <span className={`sd-status-badge sd-status-${project.status || "pending"}`}>{statusLabel}</span>
              {project.end_date && (
                <span className="sd-due-date">Due Date & Time {formatShortDate(project.end_date)}</span>
              )}
            </div>
          </div>
        </div>

        <div className="sd-body">
          <h3 className="sd-section-title">{isResubmit ? "Resubmit Project" : "Submit Project"}</h3>

          <div className="sd-field">
            <label className="sd-label">Submission Notes <span className="sd-required">*</span></label>
            <textarea
              className="sd-textarea"
              placeholder="Describe your submission..."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={4}
            />
          </div>

          <div className="sd-field">
            <label className="sd-label">Attachments</label>
            <div
              className="sd-dropzone"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files.length) setFile(e.dataTransfer.files[0]); }}
            >
              {file ? (
                <div className="sd-file-preview">
                  <div className="sd-file-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                  </div>
                  <div className="sd-file-info">
                    <span className="sd-file-name">{file.name}</span>
                    <span className="sd-file-size">{(file.size / 1024 / 1024).toFixed(1)} MB</span>
                  </div>
                  <button className="sd-file-remove" onClick={(e) => { e.stopPropagation(); setFile(null); }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>
              ) : (
                <>
                  <div className="sd-dropzone-icon">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                  </div>
                  <p className="sd-dropzone-text">Drag & drop a file or <span className="sd-browse">browse</span></p>
                </>
              )}
            </div>
            <input
              type="file"
              ref={fileInputRef}
              style={{ display: "none" }}
              onChange={(e) => { if (e.target.files.length) setFile(e.target.files[0]); }}
            />
          </div>

          {error && <div className="sd-error">{error}</div>}
        </div>

        <div className="sd-footer">
          <button className="sd-cancel-btn" onClick={onClose} disabled={submitting}>Cancel</button>
          <button className="sd-submit-btn" onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Submitting..." : isResubmit ? "Resubmit Project" : "Submit Project"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default SubmitProjectModal;
