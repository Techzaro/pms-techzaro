import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import API_URL from "../config/api";
import { authToken } from "../utils/auth";
import { notify } from "../utils/notify";
import "./ReopenDialog.css";
import { toDatetimeLocal, toUTCIso } from "../utils/formatDateTime";

function SelfReworkDialog({ isOpen, onClose, deliverable, onReworkSuccess }) {
  const [comment, setComment] = useState("");
  const [instructions, setInstructions] = useState("");
  const [newDeadline, setNewDeadline] = useState("");
  const [file, setFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  const handleSubmit = async () => {
    if (!comment.trim() && !instructions.trim()) {
      notify.error("Please provide rework notes or improvement instructions.");
      return;
    }
    setSubmitting(true);
    try {
      const token = authToken();
      const formData = new FormData();
      if (comment.trim()) formData.append("comment", comment.trim());
      if (instructions.trim()) formData.append("instructions", instructions.trim());
      if (newDeadline) formData.append("new_deadline", toUTCIso(newDeadline));
      if (file) formData.append("file", file);

      const res = await fetch(`${API_URL}/deliverables/${deliverable.id}/self-rework`, {
        method: "POST",
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
        body: formData,
        _notifHandled: true,
      });

      const data = await res.json();
      if (res.ok) {
        onReworkSuccess(data.deliverable);
        onClose();
      } else {
        notify.error(data.message || "Failed to mark deliverable for rework.");
      }
    } catch {
      notify.error("An error occurred. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen || !deliverable) return null;

  return createPortal(
    <div className="rd-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="rd-modal" role="dialog" aria-modal="true">
        <div className="rd-header">
          <h2 className="rd-title">Rework Required</h2>
          <p className="rd-subtitle">{deliverable.title}</p>
        </div>

        <div className="rd-body">
          <div className="rd-field">
            <label className="rd-label">Rework Notes</label>
            <textarea
              className="rd-textarea"
              placeholder="Explain what needs to be improved..."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
            />
          </div>

          <div className="rd-field">
            <label className="rd-label">Improvement Instructions</label>
            <textarea
              className="rd-textarea"
              placeholder="Provide specific instructions for resubmission..."
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows={3}
            />
          </div>

          <div className="rd-field">
            <label className="rd-label">New Target Date & Time (optional)</label>
            <input
              type="datetime-local"
              className="rd-input"
              value={newDeadline}
              min={new Date().toISOString().slice(0, 16)}
              onChange={(e) => setNewDeadline(e.target.value)}
            />
          </div>

          <div className="rd-field">
            <label className="rd-label">Attach Files</label>
            <div
              className="rd-dropzone"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files.length) setFile(e.dataTransfer.files[0]); }}
            >
              {file ? (
                <div className="rd-file-info">
                  <span className="rd-file-name">{file.name}</span>
                  <button className="rd-file-remove" onClick={(e) => { e.stopPropagation(); setFile(null); }}>Remove</button>
                </div>
              ) : (
                <p className="rd-dropzone-text">Drag & drop a file or <span className="rd-browse">browse</span></p>
              )}
            </div>
            <input
              type="file"
              ref={fileInputRef}
              style={{ display: "none" }}
              onChange={(e) => { if (e.target.files.length) setFile(e.target.files[0]); }}
            />
          </div>
        </div>

        <div className="rd-footer">
          <button className="rd-cancel-btn" onClick={onClose} disabled={submitting}>Cancel</button>
          <button className="rd-submit-btn" onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Processing..." : "Confirm Rework"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default SelfReworkDialog;
