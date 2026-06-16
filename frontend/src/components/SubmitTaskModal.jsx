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

function SubmitTaskModal({ isOpen, onClose, task, onSubmitSuccess }) {
  const [comment, setComment] = useState("");
  const [files, setFiles] = useState([]);
  const [links, setLinks] = useState([""]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      setComment("");
      setFiles([]);
      setLinks([""]);
      setError("");
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  const addSelectedFiles = (incomingFiles) => {
    if (!incomingFiles?.length) return;
    setFiles((prev) => [...prev, ...Array.from(incomingFiles)]);
  };

  const removeFileAt = (index) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const updateLinkAt = (index, value) => {
    setLinks((prev) => prev.map((item, i) => (i === index ? value : item)));
  };

  const addLinkField = () => setLinks((prev) => [...prev, ""]);
  const removeLinkField = (index) => {
    setLinks((prev) => (prev.length === 1 ? [""] : prev.filter((_, i) => i !== index)));
  };

  const handleSubmit = async () => {
    const trimmedLinks = links.map((link) => link.trim()).filter(Boolean);
    if (!comment.trim() && files.length === 0 && trimmedLinks.length === 0) {
      setError("Please add notes, at least one attachment, or a link.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const token = authToken();
      const formData = new FormData();
      if (comment.trim()) formData.append("comment", comment.trim());
      files.forEach((selectedFile) => formData.append("files[]", selectedFile));
      trimmedLinks.forEach((link) => formData.append("links[]", link));

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

  return createPortal(
    <div className="sd-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sd-modal" role="dialog" aria-modal="true">
        <div className="sd-header">
          <div>
            <h2 className="sd-title">{task.title}</h2>
            <div className="sd-meta">
              <span className={`sd-status-badge sd-status-${task.status || "pending"}`}>{statusLabel}</span>
              {task.end_date && (
                <span className="sd-due-date">Due Date & Time {formatShortDate(task.end_date)}</span>
              )}
            </div>
          </div>
        </div>

        <div className="sd-body">
          <h3 className="sd-section-title">{isResubmit ? "Resubmit Task" : "Submit Task"}</h3>

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
              onDrop={(e) => { e.preventDefault(); addSelectedFiles(e.dataTransfer.files); }}
            >
              {files.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {files.map((selectedFile, index) => (
                    <div key={`${selectedFile.name}-${index}`} className="sd-file-preview">
                      <div className="sd-file-icon">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                      </div>
                      <div className="sd-file-info">
                        <span className="sd-file-name">{selectedFile.name}</span>
                        <span className="sd-file-size">{(selectedFile.size / 1024 / 1024).toFixed(1)} MB</span>
                      </div>
                      <button className="sd-file-remove" onClick={(e) => { e.stopPropagation(); removeFileAt(index); }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                    </div>
                  ))}
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
              multiple
              onChange={(e) => { addSelectedFiles(e.target.files); e.target.value = ""; }}
            />
          </div>

          <div className="sd-field">
            <label className="sd-label">Links</label>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {links.map((link, index) => (
                <div key={`task-link-${index}`} style={{ display: "flex", gap: "8px" }}>
                  <input
                    type="url"
                    className="sd-textarea"
                    style={{ minHeight: "44px", resize: "none" }}
                    placeholder="https://example.com/..."
                    value={link}
                    onChange={(e) => updateLinkAt(index, e.target.value)}
                  />
                  <button className="sd-cancel-btn" type="button" onClick={() => removeLinkField(index)}>Remove</button>
                </div>
              ))}
              <button className="sd-cancel-btn" type="button" onClick={addLinkField} style={{ width: "fit-content" }}>+ Add Link</button>
            </div>
          </div>

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
