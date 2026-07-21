/**
 * ReopenDialog.jsx
 * Modal dialog for reopening a subtask (after submission or approval).
 * Requires a reason for reopening with predefined options or custom text.
 * Optionally includes instructions, new deadline, and file attachment.
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

const REOPEN_REASONS = [
  "Missing functionality",
  "Incorrect implementation",
  "Design issue",
  "Bug found",
  "Client requested changes",
  "Additional requirements",
  "Quality improvement",
  "Other",
];

function ReopenDialog({ isOpen, onClose, subtask, onReopenSuccess }) {
  const { isDirty, setIsDirty, handleClose, ConfirmDialog } = useConfirmOnClose(onClose);
  useEscapeKey(isOpen, handleClose);

  const [reopenReason, setReopenReason] = useState("");
  const [reopenReasonDetail, setReopenReasonDetail] = useState("");
  const [instructions, setInstructions] = useState("");
  const [newDeadline, setNewDeadline] = useState("");
  const [file, setFile] = useState(null);
  const { submitting, run } = useSubmit();
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      setReopenReason("");
      setReopenReasonDetail("");
      setInstructions("");
      setNewDeadline(subtask?.due_date ? toDatetimeLocal(subtask.due_date) : "");
      setFile(null);
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  const handleSubmit = async () => {
    if (!reopenReason) {
      notify.error("Please select a reason for reopening.");
      return;
    }
    if (reopenReason === "Other" && !reopenReasonDetail.trim()) {
      notify.error("Please provide details for the 'Other' reason.");
      return;
    }
    await run(async () => {
      try {
        const token = authToken();
        const formData = new FormData();
        formData.append("reopen_reason", reopenReason);
        if (reopenReason === "Other" || reopenReasonDetail.trim()) {
          formData.append("reopen_reason_detail", reopenReasonDetail.trim());
        }
        if (instructions.trim()) formData.append("instructions", instructions.trim());
        if (newDeadline) formData.append("new_deadline", toUTCIso(newDeadline));
        if (file) formData.append("file", file);

        const res = await fetch(`${API_URL}/deliverables/${subtask.id}/reopen`, {
          method: "POST",
          headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
          body: formData,
          _notifHandled: true,
        });

        const data = await res.json();
        if (res.ok) {
          onReopenSuccess(data.deliverable);
          onClose();
        } else {
          notify.error(data.message || "Failed to reopen subtask.");
        }
      } catch {
        notify.error("An error occurred. Please try again.");
      }
    });
  };

  if (!isOpen || !subtask) return null;

  const isApproved = subtask.status === "approved";

  return createPortal(
    <div className="rd-overlay">
      <div className="rd-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="rd-header">
          <h2 className="rd-title">{isApproved ? "Reopen Subtask" : "Decline & Reopen Subtask"}</h2>
          <p className="rd-subtitle">{subtask.title}</p>
        </div>

        <div className="rd-body">
          <div className="rd-field">
            <label className="rd-label">Reason for Reopening <span style={{ color: "var(--color-danger)" }}>*</span></label>
            <select
              className="rd-input"
              value={reopenReason}
              onChange={(e) => { setReopenReason(e.target.value); setIsDirty(true); }}
            >
              <option value="">Select a reason...</option>
              {REOPEN_REASONS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>

          {(reopenReason === "Other" || reopenReason) && (
            <div className="rd-field">
              <label className="rd-label">
                {reopenReason === "Other" ? "Specify Reason *" : "Additional Details"}
              </label>
              <textarea
                className="rd-textarea"
                placeholder={reopenReason === "Other" ? "Please describe the reason..." : "Provide more details (optional)..."}
                value={reopenReasonDetail}
                onChange={(e) => { setReopenReasonDetail(e.target.value); setIsDirty(true); }}
                rows={3}
              />
            </div>
          )}

          <div className="rd-field">
            <label className="rd-label">Additional Instructions</label>
            <textarea
              className="rd-textarea"
              placeholder="Provide specific instructions for resubmission..."
              value={instructions}
              onChange={(e) => { setInstructions(e.target.value); setIsDirty(true); }}
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
            {isApproved ? "Reopen" : "Decline & Reopen"}
          </LoadingButton>
        </div>
      </div>
      {ConfirmDialog}
    </div>,
    document.body
  );
}

export default ReopenDialog;
