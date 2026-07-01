/**
 * TaskReopenDialog.jsx
 * Modal dialog for rejecting and reopening a task submission.
 * Allows the reviewer to provide a comment, additional instructions,
 * set a new deadline, and optionally attach a file before reopening.
 */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import API_URL from "../config/api";
import { authToken } from "../utils/auth";
import { useEscapeKey } from "../hooks/useEscapeKey";
import { notify } from "../utils/notify";
import "./ReopenDialog.css";
import { toDatetimeLocal, toUTCIso } from "../utils/formatDateTime";

/**
 * Dialog for rejecting and reopening a task with feedback.
 * @param {boolean} isOpen - Whether the dialog is visible.
 * @param {Function} onClose - Callback to close the dialog.
 * @param {Object} task - The task being reopened.
 * @param {Function} onReopenSuccess - Callback after successful reopen, receives updated task.
 */
function TaskReopenDialog({ isOpen, onClose, task, onReopenSuccess }) {
  useEscapeKey(isOpen, onClose);

  const [comment, setComment] = useState("");
  const [instructions, setInstructions] = useState("");
  const [newDeadline, setNewDeadline] = useState("");
  const [file, setFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef(null);

  // Lock body scroll when dialog is open and reset form state
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      setComment("");
      setInstructions("");
      setNewDeadline(task?.end_date ? toDatetimeLocal(task.end_date) : "");
      setFile(null);
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  /** Submits the reopen request with comment, instructions, new deadline, and file */
  const handleSubmit = async () => {
    if (!comment.trim() && !instructions.trim()) {
      notify.error("Please provide a comment or instructions.");
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

      const res = await fetch(`${API_URL}/tasks/${task.id}/reopen`, {
        method: "POST",
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
        body: formData,
        _notifHandled: true,
      });

      const data = await res.json();
      if (res.ok) {
        onReopenSuccess(data.task);
        onClose();
      } else {
        notify.error(data.message || "Failed to reopen task.");
      }
    } catch {
      notify.error("An error occurred. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen || !task) return null;

  return createPortal(
    <div className="rd-overlay">
      <div className="rd-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="rd-header">
          <h2 className="rd-title">Reject & Reopen Task</h2>
          <p className="rd-subtitle">{task.title}</p>
        </div>

        <div className="rd-body">
          <div className="rd-field">
            <label className="rd-label">Reopen Comment</label>
            <textarea
              className="rd-textarea"
              placeholder="Explain why this task needs revision..."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
            />
          </div>

          <div className="rd-field">
            <label className="rd-label">Additional Instructions</label>
            <textarea
              className="rd-textarea"
              placeholder="Provide specific instructions for resubmission..."
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows={3}
            />
          </div>

          <div className="rd-field">
            <label className="rd-label">New Deadline</label>
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
            {submitting ? "Processing..." : "Reject & Reopen"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default TaskReopenDialog;
