/**
 * SelfReworkDialog.jsx
 * Modal dialog allowing a team member to mark their own subtask as needing
 * rework. Used for self-review workflows where the submitter identifies issues
 * and requests improvements before final approval.
 */

import { useEffect, useRef, useState, useMemo } from "react";
import { createPortal } from "react-dom";
import API_URL from "../config/api";
import { authToken } from "../utils/auth";
import { useEscapeKey } from "../hooks/useEscapeKey";
import useUnsavedChanges from "../hooks/useUnsavedChanges";
import { notify } from "../utils/notify";
import { useSubmit } from "../hooks/useSubmit";
import LoadingButton from "./LoadingButton";
import "./ReopenDialog.css";
import { toDatetimeLocal, toUTCIso } from "../utils/formatDateTime";

/**
 * Dialog for marking a subtask as needing rework by the assignee themselves.
 * @param {boolean} isOpen - Whether the dialog is visible.
 * @param {Function} onClose - Callback to close the dialog.
 * @param {Object} deliverable - The deliverable being marked for rework.
 * @param {Function} onReworkSuccess - Callback after successful rework, receives updated deliverable.
 */
function SelfReworkDialog({ isOpen, onClose, deliverable, onReworkSuccess }) {
  const [comment, setComment] = useState("");
  const [instructions, setInstructions] = useState("");
  const [newDeadline, setNewDeadline] = useState("");
  const [link, setLink] = useState("");
  const [files, setFiles] = useState([]);
  const { submitting, run } = useSubmit();
  const fileInputRef = useRef(null);

  const initialValues = useMemo(() => ({ comment: "", instructions: "", newDeadline: "", link: "", files: [] }), []);
  const currentValues = useMemo(() => ({ comment, instructions, newDeadline, link, files }), [comment, instructions, newDeadline, link, files]);
  const { isDirty, handleClose, markSaved, resetBaseline, ConfirmDialog } = useUnsavedChanges(initialValues, currentValues, onClose);
  useEscapeKey(isOpen, handleClose);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      setComment("");
      setInstructions("");
      setNewDeadline("");
      setLink("");
      setFiles([]);
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
        if (link.trim()) formData.append("link", link.trim());
        if (files && files.length > 0) {
          files.forEach((f) => formData.append("files[]", f));
          formData.append("file", files[0]);
        }

        const res = await fetch(`${API_URL}/deliverables/${deliverable.id}/self-rework`, {
          method: "POST",
          headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
          body: formData,
          _notifHandled: true,
        });

        const data = await res.json();
        if (res.ok) {
          if (data.file_skipped) {
            notify.warning(data.message || "Subtask marked for rework, but file could not be uploaded due to storage limit.");
          }
          markSaved();
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
              onChange={(e) => { setComment(e.target.value); }}
              rows={3}
            />
          </div>

          <div className="rd-field">
            <label className="rd-label">Improvement Instructions</label>
            <textarea
              className="rd-textarea"
              placeholder="Provide specific instructions for resubmission..."
              value={instructions}
              onChange={(e) => { setInstructions(e.target.value); }}
              rows={3}
            />
          </div>

          <div className="rd-field">
            <label className="rd-label">Attach Link / Reference URL</label>
            <input
              type="url"
              className="rd-input"
              placeholder="https://example.com/ref-link"
              value={link}
              onChange={(e) => { setLink(e.target.value); }}
            />
          </div>

          <div className="rd-field">
            <label className="rd-label">New Target Date & Time (optional)</label>
            <input
              type="datetime-local"
              className="rd-input"
              value={newDeadline}
              min={new Date().toISOString().slice(0, 16)}
              onChange={(e) => { setNewDeadline(e.target.value); }}
            />
          </div>

          <div className="rd-field">
            <label className="rd-label">Attach Files</label>
            <div
              className="rd-dropzone"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files.length) { setFiles((prev) => [...prev, ...Array.from(e.dataTransfer.files)]); } }}
            >
              {files.length > 0 ? (
                <div className="rd-files-list" style={{ display: "flex", flexDirection: "column", gap: 6, width: "100%" }}>
                  {files.map((f, idx) => (
                    <div key={idx} className="rd-file-info" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--bg-card-alt, #f9fafb)", padding: "6px 12px", borderRadius: 8, border: "1px solid var(--border-color, #e5e7eb)" }}>
                      <span className="rd-file-name" style={{ fontSize: 13, fontWeight: 500, color: "var(--text-dark)" }}>{f.name}</span>
                      <button type="button" className="rd-file-remove" onClick={(e) => { e.stopPropagation(); setFiles((prev) => prev.filter((_, i) => i !== idx)); }}>Remove</button>
                    </div>
                  ))}
                  <button type="button" className="rd-browse" style={{ alignSelf: "flex-end", fontSize: 12, marginTop: 4, background: "none", border: "none" }} onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}>+ Add more files</button>
                </div>
              ) : (
                <p className="rd-dropzone-text">Drag & drop files or <span className="rd-browse">browse</span></p>
              )}
            </div>
            <input
              type="file"
              ref={fileInputRef}
              multiple
              style={{ display: "none" }}
              onChange={(e) => { if (e.target.files.length) { setFiles((prev) => [...prev, ...Array.from(e.target.files)]); } }}
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
