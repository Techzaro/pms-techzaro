/**
 * MarkTaskCompletedModal.jsx
 * Modal dialog allowing the assigner to force-complete a pending or in-progress task.
 * Includes predefined completion reasons, delivery notes, and attachment upload.
 */

import { useEffect, useRef, useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { CheckCircle2, X } from "lucide-react";
import API_URL from "../config/api";
import { authToken } from "../utils/auth";
import { useEscapeKey } from "../hooks/useEscapeKey";
import useUnsavedChanges from "../hooks/useUnsavedChanges";
import { notify } from "../utils/notify";
import { useSubmit } from "../hooks/useSubmit";
import LoadingButton from "./LoadingButton";
import "./MarkTaskCompletedModal.css";

const COMPLETION_REASONS = [
  "Work was completed outside PMS.",
  "Receiver completed the work but did not update PMS.",
  "Receiver is unavailable.",
  "Task was completed verbally/through WhatsApp/email/etc.",
  "The assigner no longer requires a PMS delivery.",
  "The task was assigned to a senior/C-level person who completed it without using PMS.",
  "Others",
];

function statusLabel(status, t) {
  const s = (status || "").toLowerCase();
  const map = {
    pending: "Pending",
    in_progress: "In Progress",
    "in-progress": "In Progress",
    acknowledged: "In Progress",
    paused: "Paused",
    submitted: "Submitted",
    reopened: "Pending",
    approved: "Completed",
    completed: "Completed",
  };
  const label = map[s] || status || "Pending";
  return t ? t(label, { defaultValue: label }) : label;
}

function MarkTaskCompletedModal({ isOpen, onClose, task, entityType = "task", onCompleteSuccess }) {
  const { t } = useTranslation();
  const [selectedReason, setSelectedReason] = useState("");
  const [customReason, setCustomReason] = useState("");
  const [deliveryNotes, setDeliveryNotes] = useState("");
  const [files, setFiles] = useState([]);
  const { submitting, run } = useSubmit();
  const fileInputRef = useRef(null);

  const initialValues = useMemo(() => ({ selectedReason: "", customReason: "", deliveryNotes: "", files: [] }), []);
  const currentValues = useMemo(() => ({ selectedReason, customReason, deliveryNotes, files }), [selectedReason, customReason, deliveryNotes, files]);
  const { isDirty, handleClose, markSaved, ConfirmDialog } = useUnsavedChanges(initialValues, currentValues, onClose);
  useEscapeKey(isOpen, handleClose);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      setSelectedReason("");
      setCustomReason("");
      setDeliveryNotes("");
      setFiles([]);
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  const handleSubmit = async () => {
    if (!selectedReason) {
      notify.error(t("Please select a completion reason.", { defaultValue: "Please select a completion reason." }));
      return;
    }
    if (selectedReason === "Others" && !customReason.trim()) {
      notify.error(t("Please specify the reason.", { defaultValue: "Please specify the reason." }));
      return;
    }

    const finalReason = selectedReason === "Others" ? customReason.trim() : selectedReason;

    await run(async () => {
      try {
        const token = authToken();
        const formData = new FormData();
        formData.append("reason", finalReason);
        if (deliveryNotes.trim()) {
          formData.append("delivery_notes", deliveryNotes.trim());
        }
        if (files && files.length > 0) {
          files.forEach((f) => {
            formData.append("attachments[]", f);
            formData.append("files[]", f);
          });
          formData.append("file", files[0]);
        }

        const endpoint = entityType === "deliverable"
          ? `${API_URL}/deliverables/${task.id}/mark-as-completed`
          : `${API_URL}/tasks/${task.id}/mark-as-completed`;

        const res = await fetch(endpoint, {
          method: "POST",
          headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
          body: formData,
          _notifHandled: true,
        });

        const data = await res.json();
        if (res.ok) {
          if (data.file_skipped) {
            notify.warning(data.message || t("Task completed, but files could not be uploaded due to storage limit."));
          } else {
            notify.success(data.message || t("Task marked as completed successfully."));
          }
          markSaved();
          if (onCompleteSuccess) {
            onCompleteSuccess(data.task || data.deliverable);
          }
          onClose();
        } else {
          notify.error(data.message || t("Failed to mark task as completed.", { defaultValue: "Failed to mark task as completed." }));
        }
      } catch {
        notify.error(t("An error occurred. Please try again.", { defaultValue: "An error occurred. Please try again." }));
      }
    });
  };

  if (!isOpen || !task) return null;

  const currentStatusDisplay = statusLabel(task.status, t);

  return createPortal(
    <div className="mtc-overlay" onClick={handleClose}>
      <div className="mtc-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="mtc-header">
          <div className="mtc-title-group">
            <h2 className="mtc-title">
              <CheckCircle2 size={20} color="#16a34a" />
              {t("Mark as Completed", { defaultValue: "Mark as Completed" })}
            </h2>
            <p className="mtc-subtitle">{task.title}</p>
          </div>
          <button className="mtc-close-btn" onClick={handleClose} disabled={submitting}>
            <X size={18} />
          </button>
        </div>

        <div className="mtc-body">
          <div className="mtc-prompt-text">
            {t("This task is currently", { defaultValue: "This task is currently" })}{" "}
            <span className="mtc-status-highlight">{currentStatusDisplay}</span>.{" "}
            {t("Are you sure you want to mark this task as completed?", { defaultValue: "Are you sure you want to mark this task as completed?" })}
          </div>

          <div className="mtc-field">
            <label className="mtc-label">
              {t("Reason for Completion", { defaultValue: "Reason for Completion" })}{" "}
              <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <select
              className="mtc-select"
              value={selectedReason}
              onChange={(e) => setSelectedReason(e.target.value)}
            >
              <option value="">{t("Select reason...", { defaultValue: "Select reason..." })}</option>
              {COMPLETION_REASONS.map((reason) => (
                <option key={reason} value={reason}>
                  {t(reason, { defaultValue: reason })}
                </option>
              ))}
            </select>
          </div>

          {selectedReason === "Others" && (
            <div className="mtc-field">
              <label className="mtc-label">
                {t("Specify Reason", { defaultValue: "Specify Reason" })}{" "}
                <span style={{ color: "#ef4444" }}>*</span>
              </label>
              <textarea
                className="mtc-textarea"
                placeholder={t("Please specify the completion reason...", { defaultValue: "Please specify the completion reason..." })}
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                rows={2}
              />
            </div>
          )}

          <div className="mtc-field">
            <label className="mtc-label">{t("Delivery notes", { defaultValue: "Delivery notes" })}</label>
            <textarea
              className="mtc-textarea"
              placeholder={t("Optional delivery notes or summary...", { defaultValue: "Optional delivery notes or summary..." })}
              value={deliveryNotes}
              onChange={(e) => setDeliveryNotes(e.target.value)}
              rows={3}
            />
          </div>

          <div className="mtc-field">
            <label className="mtc-label">{t("Attach Files", { defaultValue: "Attach Files" })}</label>
            <div
              className="mtc-dropzone"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (e.dataTransfer.files.length) {
                  setFiles((prev) => [...prev, ...Array.from(e.dataTransfer.files)]);
                }
              }}
            >
              {files.length > 0 ? (
                <div className="mtc-files-list">
                  {files.map((f, idx) => (
                    <div key={idx} className="mtc-file-item">
                      <span className="mtc-file-name">{f.name}</span>
                      <button
                        type="button"
                        className="mtc-file-remove"
                        onClick={(e) => {
                          e.stopPropagation();
                          setFiles((prev) => prev.filter((_, i) => i !== idx));
                        }}
                      >
                        {t("Remove", { defaultValue: "Remove" })}
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="mtc-browse"
                    style={{ alignSelf: "flex-end", fontSize: 12, marginTop: 4, background: "none", border: "none" }}
                    onClick={(e) => {
                      e.stopPropagation();
                      fileInputRef.current?.click();
                    }}
                  >
                    {t("+ Add more files", { defaultValue: "+ Add more files" })}
                  </button>
                </div>
              ) : (
                <p className="mtc-dropzone-text">
                  {t("Drag & drop files or", { defaultValue: "Drag & drop files or" })}{" "}
                  <span className="mtc-browse">{t("browse", { defaultValue: "browse" })}</span>
                </p>
              )}
            </div>
            <input
              type="file"
              ref={fileInputRef}
              multiple
              style={{ display: "none" }}
              onChange={(e) => {
                if (e.target.files.length) {
                  setFiles((prev) => [...prev, ...Array.from(e.target.files)]);
                }
              }}
            />
          </div>
        </div>

        <div className="mtc-footer">
          <button className="mtc-btn-cancel" onClick={handleClose} disabled={submitting}>
            {t("Cancel")}
          </button>
          <LoadingButton className="mtc-btn-submit" onClick={handleSubmit} loading={submitting}>
            <CheckCircle2 size={16} />
            {t("Mark as Completed", { defaultValue: "Mark as Completed" })}
          </LoadingButton>
        </div>
      </div>
      {ConfirmDialog}
    </div>,
    document.body
  );
}

export default MarkTaskCompletedModal;
