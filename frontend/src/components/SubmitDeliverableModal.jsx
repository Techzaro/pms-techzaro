import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { FileText, Upload, X, Image } from "lucide-react";
import API_URL from "../config/api";
import { authToken } from "../utils/auth";
import "./SubmitDeliverableModal.css";
import "./layout/CreateTaskModal.css";

function formatShortDate(value) {
  if (!value) return "\u2014";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "\u2014";
  const date = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  const time = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
  return `${date} ${time}`;
}

function SubmitDeliverableModal({ isOpen, onClose, deliverable, onSubmitSuccess }) {
  const [comment, setComment] = useState("");
  const [files, setFiles] = useState([]);
  const [links, setLinks] = useState([]);
  const [linkInput, setLinkInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      setComment("");
      setFiles([]);
      setLinks([]);
      setLinkInput("");
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

  const removeFile = (index) => setFiles((prev) => prev.filter((_, i) => i !== index));

  const handleAddLink = () => {
    if (!linkInput.trim()) return;
    let url = linkInput.trim();
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;
    setLinks((prev) => [...prev, { url, name: url }]);
    setLinkInput("");
  };

  const handleRemoveLink = (index) => {
    setLinks((prev) => prev.filter((_, i) => i !== index));
  };

  const handleLinkKeyDown = (e) => {
    if (e.key === "Enter") { e.preventDefault(); handleAddLink(); }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setFiles((prev) => [...prev, ...Array.from(e.dataTransfer.files || [])]);
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

      const res = await fetch(`${API_URL}/deliverables/${deliverable.id}/submit`, {
        method: "POST",
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
        body: formData,
      });

      const data = await res.json();
      if (res.ok) {
        onSubmitSuccess(data.deliverable);
        onClose();
      } else {
        setError(data.message || "Failed to submit deliverable.");
      }
    } catch {
      setError("An error occurred. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen || !deliverable) return null;

  const statusLabel = (deliverable.status || "pending").charAt(0).toUpperCase() + (deliverable.status || "pending").slice(1);
  const isImageFile = (f) => f.type?.startsWith("image/");

  return createPortal(
    <div className="sd-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sd-modal" role="dialog" aria-modal="true">
        <div className="sd-header">
          <div>
            <h2 className="sd-title">{deliverable.title}</h2>
            <div className="sd-meta">
              <span className={`sd-status-badge sd-status-${deliverable.status || "pending"}`}>{statusLabel}</span>
              {deliverable.due_date && (
                <span className="sd-due-date">Due Date {formatShortDate(deliverable.due_date)}</span>
              )}
            </div>
          </div>
        </div>

        <div className="sd-body">
          <h3 className="sd-section-title">Submit Deliverable</h3>

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
              onClick={() => document.getElementById(`sdm-file-${deliverable.id}`)?.click()}
            >
              <div className="sd-dropzone-icon">
                <Upload size={24} strokeWidth={1.5} />
              </div>
              <p className="sd-dropzone-text">Drag & drop files or <span className="sd-browse">browse</span></p>
              <p className="sd-dropzone-hint">Supports: PDF, DOC, XLS, PPT, images, ZIP, RAR</p>
            </div>
            <input
              id={`sdm-file-${deliverable.id}`}
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

          <div className="sd-field">
            <label className="sd-label">Links ({links.length})</label>
            <div className="task-link-input-row">
              <input
                type="text"
                placeholder="Paste link (Drive, Figma, GitHub, etc.)"
                value={linkInput}
                onChange={(e) => setLinkInput(e.target.value)}
                onKeyDown={handleLinkKeyDown}
              />
              <button
                type="button"
                className="task-link-add-btn"
                onClick={handleAddLink}
                disabled={!linkInput.trim()}
              >
                Add Link
              </button>
            </div>
            {links.length > 0 && (
              <div className="task-attachments-list">
                {links.map((link, index) => (
                  <div key={index} className="task-attachment-item">
                    <span className="task-attachment-icon">🔗</span>
                    <a href={link.url} target="_blank" rel="noopener noreferrer" className="task-attachment-name task-attachment-link">
                      {link.url.length > 45 ? link.url.substring(0, 45) + "..." : link.url}
                    </a>
                    <a href={link.url} target="_blank" rel="noopener noreferrer" className="task-attachment-open">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                        <polyline points="15 3 21 3 21 9" />
                        <line x1="10" y1="14" x2="21" y2="3" />
                      </svg>
                    </a>
                    <button type="button" className="task-attachment-remove" onClick={() => handleRemoveLink(index)}>✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {error && <div className="sd-error">{error}</div>}
        </div>

        <div className="sd-footer">
          <button className="sd-cancel-btn" onClick={onClose} disabled={submitting}>Cancel</button>
          <button className="sd-submit-btn" onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Submitting..." : deliverable.status === "rework_required" ? "Resubmit Deliverable" : "Submit Deliverable"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default SubmitDeliverableModal;
