/**
 * SelfReworkDialog.jsx
 * Modal dialog allowing a team member to mark their own deliverable as needing
 * rework. Used for self-review workflows where the submitter identifies issues
 * and requests improvements before final approval.
 */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import API_URL from "../config/api";
import { authToken } from "../utils/auth";
import { useEscapeKey } from "../hooks/useEscapeKey";
import useConfirmOnClose from "../hooks/useConfirmOnClose";
import { notify } from "../utils/notify";
import { useSubmit } from "../hooks/useSubmit";
import LoadingButton from "./LoadingButton";
import "./ReopenDialog.css";
import { toDatetimeLocal, toUTCIso } from "../utils/formatDateTime";

/**
 * Dialog for marking a deliverable as needing rework by the assignee themselves.
 * @param {boolean} isOpen - Whether the dialog is visible.
 * @param {Function} onClose - Callback to close the dialog.
 * @param {Object} deliverable - The deliverable being marked for rework.
 * @param {Function} onReworkSuccess - Callback after successful rework, receives updated deliverable.
 */
function SelfReworkDialog({ isOpen, onClose, deliverable, onReworkSuccess }) {
  const { isDirty, setIsDirty, handleClose, ConfirmDialog } = useConfirmOnClose(onClose);
  useEscapeKey(isOpen, handleClose);

  const [comment, setComment] = useState("");
  const [instructions, setInstructions] = useState("");
  const [newDeadline, setNewDeadline] = useState("");
  const [file, setFile] = useState(null);
  const { submitting, run } = useSubmit();
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  /** Submits the rework request with notes, instructions, new deadline, and file */
  const handleSubmit = async () => {
    if (!comment.trim() && !instructions.trim()) {
      notify.error("Please provide rework notes or improvement instructions.");
      return;
    }
    await run(async () => {
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
          notify.error(data.message || "Failed to mark subtask for rework.");
        }
      } catch {
        notify.error("An error occurred. Please try again.");
      }
    });
  };

  if (!isOpen || !deliverable) return null;

  return createPortal(
    <div className="rd-overlay">
      <div className="rd-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
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
              onChange={(e) => { setComment(e.target.value); setIsDirty(true); }}
              rows={3}
            />
          </div>

          <div className="rd-field">
            <label className="rd-label">Improvement Instructions</label>
            <textarea
              className="rd-textarea"
              placeholder="Provide specific instructions for resubmission..."
              value={instructions}
              onChange={(e) => { setInstructions(e.target.value); setIsDirty(true); }}
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
              onChange={(e) => { setNewDeadline(e.target.value); setIsDirty(true); }}
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
              onChange={(e) => { if (e.target.files.length) { setFile(e.target.files[0]); setIsDirty(true); } }}
            />
          </div>
        </div>

        <div className="rd-footer">
          <button className="rd-cancel-btn" onClick={handleClose} disabled={submitting}>Cancel</button>
          <LoadingButton className="rd-submit-btn" onClick={handleSubmit} loading={submitting}>
            Confirm Rework
          </LoadingButton>
        </div>
        {ConfirmDialog}
      </div>
    </div>,
    document.body
  );
}

export default SelfReworkDialog;
