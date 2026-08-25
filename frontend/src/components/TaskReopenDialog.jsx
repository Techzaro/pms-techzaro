/**
 * TaskReopenDialog.jsx
 * Modal dialog for reopening a task (after submission or approval).
 * Requires a reason for reopening with predefined options or custom text.
 * Optionally includes instructions, new deadline, and file attachment.
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

function TaskReopenDialog({ isOpen, onClose, task, onReopenSuccess }) {
  const [reopenReason, setReopenReason] = useState("");
  const [reopenReasonDetail, setReopenReasonDetail] = useState("");
  const [instructions, setInstructions] = useState("");
  const [newDeadline, setNewDeadline] = useState("");
  const [link, setLink] = useState("");
  const [files, setFiles] = useState([]);
  const { submitting, run } = useSubmit();
  const fileInputRef = useRef(null);

  const initialValues = useMemo(() => ({ reopenReason: "", reopenReasonDetail: "", instructions: "", newDeadline: "", link: "", files: [] }), []);
  const currentValues = useMemo(() => ({ reopenReason, reopenReasonDetail, instructions, newDeadline, link, files }), [reopenReason, reopenReasonDetail, instructions, newDeadline, link, files]);
  const { isDirty, handleClose, markSaved, resetBaseline, ConfirmDialog } = useUnsavedChanges(initialValues, currentValues, onClose);
  useEscapeKey(isOpen, handleClose);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      setReopenReason("");
      setReopenReasonDetail("");
      setInstructions("");
      setNewDeadline(task?.end_date ? toDatetimeLocal(task.end_date) : "");
      setLink("");
      setFiles([]);
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
        if (link.trim()) formData.append("link", link.trim());
        if (files && files.length > 0) {
          files.forEach((f) => formData.append("files[]", f));
          formData.append("file", files[0]);
        }

        const res = await fetch(`${API_URL}/tasks/${task.id}/reopen`, {
          method: "POST",
          headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
          body: formData,
          _notifHandled: true,
        });

        const data = await res.json();
        if (res.ok) {
          markSaved();
          onReopenSuccess(data.task);
          onClose();
        } else {
          notify.error(data.message || "Failed to reopen task.");
        }
      } catch {
        notify.error("An error occurred. Please try again.");
      }
    });
  };

  if (!isOpen || !task) return null;

  const isApprovedOrAbandoned = task.status === "approved" || task.status === "abandoned";

  return createPortal(
    <div className="rd-overlay">
      <div className="rd-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="rd-header">
          <h2 className="rd-title">{isApprovedOrAbandoned ? "Reopen Task" : "Decline & Reopen Task"}</h2>
          <p className="rd-subtitle">{task.title}</p>
        </div>

        <div className="rd-body">
          <div className="rd-field">
            <label className="rd-label">Reason for Reopening <span style={{ color: "var(--color-danger)" }}>*</span></label>
            <select
              className="rd-input"
              value={reopenReason}
              onChange={(e) => { setReopenReason(e.target.value); }}
            >
              <option value="">Select a reason...</option>
              {REOPEN_REASONS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <div className="rd-reason-tags">
              {REOPEN_REASONS.map((r) => (
                <button
                  type="button"
                  key={r}
                  className={`rd-tag-chip ${reopenReason === r ? "rd-tag-chip--selected" : ""}`}
                  onClick={() => setReopenReason(r)}
                >
                  {r}
                </button>
              ))}
            </div>
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
                onChange={(e) => { setReopenReasonDetail(e.target.value); }}
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
            <label className="rd-label">New Deadline</label>
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
            {isApprovedOrAbandoned ? "Reopen" : "Decline & Reopen"}
          </LoadingButton>
        </div>
      </div>
      {ConfirmDialog}
    </div>,
    document.body
  );
}

export default TaskReopenDialog;
