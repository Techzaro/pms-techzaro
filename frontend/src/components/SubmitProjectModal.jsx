import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { FileText, Upload, X, Plus, Image } from "lucide-react";
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
  const [files, setFiles] = useState([]);
  const [links, setLinks] = useState([""]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

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

  const handleFileSelect = (e) => {
    const selected = Array.from(e.target.files || []);
    setFiles((prev) => [...prev, ...selected]);
    e.target.value = "";
  };

  const removeFile = (index) => setFiles((prev) => prev.filter((_, i) => i !== index));

  const addLink = () => setLinks((prev) => [...prev, ""]);
  const removeLink = (index) => setLinks((prev) => prev.filter((_, i) => i !== index));
  const updateLink = (index, value) => setLinks((prev) => prev.map((l, i) => (i === index ? value : l)));

  const handleDrop = (e) => {
    e.preventDefault();
    setFiles((prev) => [...prev, ...Array.from(e.dataTransfer.files || [])]);
  };

  const normalizeUrl = (url) => {
    url = url.trim();
    if (url && !/^https?:\/\//i.test(url)) return "https://" + url;
    return url;
  };

  const handleSubmit = async () => {
    const validLinks = links.filter((l) => l.trim()).map(normalizeUrl);
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
                <span className="sd-due-date">Due Date & Time {formatShortDate(project.end_date)}</span>
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

          <div className="sd-field">
            <label className="sd-label">Links ({links.filter((l) => l.trim()).length})</label>
            {links.map((link, i) => (
              <div key={i} className="sd-link-row">
                <input
                  type="url"
                  className="sd-link-input"
                  placeholder="https://example.com/file"
                  value={link}
                  onChange={(e) => updateLink(i, e.target.value)}
                />
                {links.length > 1 && (
                  <button className="sd-link-remove" onClick={() => removeLink(i)}>
                    <X size={14} />
                  </button>
                )}
                {i === links.length - 1 && (
                  <button className="sd-link-add" onClick={addLink}>
                    <Plus size={14} />
                  </button>
                )}
              </div>
            ))}
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
