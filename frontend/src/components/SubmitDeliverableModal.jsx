/**
 * SubmitDeliverableModal.jsx
 * Modal form for submitting a subtask. Supports file uploads via drag-and-drop,
 * link attachments, and submission notes. Handles both initial submissions and
 * resubmissions for rework-required status.
 */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { FileText, Upload, X, Image } from "lucide-react";
import API_URL from "../config/api";
import { authToken } from "../utils/auth";
import { useEscapeKey } from "../hooks/useEscapeKey";
import useConfirmOnClose from "../hooks/useConfirmOnClose";
import { formatDateTimeShort } from "../utils/formatDateTime";
import { notify } from "../utils/notify";
import { useSubmit } from "../hooks/useSubmit";
import SubmissionLinkSection from "./SubmissionLinkSection";
import LoadingButton from "./LoadingButton";
import ConfirmModal from "./ConfirmModal";
import "./SubmitDeliverableModal.css";
import "./layout/CreateTaskModal.css";

/**
 * Modal form for submitting or resubmitting a subtask.
 * @param {boolean} isOpen - Whether the modal is visible.
 * @param {Function} onClose - Callback to close the modal.
 * @param {Object} [subtask] - The subtask being submitted.
 * @param {Object} [deliverable] - Alternative prop alias for subtask.
 * @param {Function} [onSubmitSuccess] - Callback after successful submission, receives updated subtask.
 * @param {Object} [submissionToEdit] - Existing submission object when editing.
 */
function SubmitDeliverableModal({
  isOpen,
  onClose,
  subtask: subtaskProp,
  deliverable,
  onSubmitSuccess,
  submissionToEdit = null,
}) {
  const { t } = useTranslation();
  const subtask = subtaskProp || deliverable;

  const { isDirty, setIsDirty, handleClose, ConfirmDialog } = useConfirmOnClose(onClose);
  useEscapeKey(isOpen, handleClose);

  const [comment, setComment] = useState("");
  const [files, setFiles] = useState([]);
  const [links, setLinks] = useState([]);
  const { submitting, run } = useSubmit();
  const [fileRemoveConfirmOpen, setFileRemoveConfirmOpen] = useState(false);
  const [pendingFileIndex, setPendingFileIndex] = useState(-1);

  // Lock body scroll and reset form state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      if (submissionToEdit) {
        setComment(submissionToEdit.comment || "");
        const prevLinks = (submissionToEdit.attachments || [])
          .filter((a) => a.attachment_type === "link")
          .map((a) => ({ url: a.url || a.file_name }));
        setLinks(prevLinks);
        setFiles([]);
      } else {
        setComment("");
        setFiles([]);
        setLinks([]);
      }
      setIsDirty(false);
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen, submissionToEdit, setIsDirty]);

  // Handle Ctrl+V (Clipboard Paste) for files/screenshots when modal is open
  useEffect(() => {
    if (!isOpen) return;

    const handlePaste = (e) => {
      const clipboardFiles = e.clipboardData?.files;
      if (clipboardFiles && clipboardFiles.length > 0) {
        const newFiles = Array.from(clipboardFiles);
        setIsDirty(true);
        setFiles((prev) => [...prev, ...newFiles]);
        notify.success(
          t("Pasted {{count}} file(s) from clipboard", {
            defaultValue: `Pasted ${newFiles.length} file(s) from clipboard`,
            count: newFiles.length,
          })
        );
      }
    };

    window.addEventListener("paste", handlePaste);
    return () => {
      window.removeEventListener("paste", handlePaste);
    };
  }, [isOpen, setIsDirty, t]);

  /** Appends newly selected files to the existing file list */
  const handleFileSelect = (e) => {
    const selected = Array.from(e.target.files || []);
    setIsDirty(true);
    setFiles((prev) => [...prev, ...selected]);
    e.target.value = "";
  };

  const removeFile = (index) => {
    setIsDirty(true);
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDirty(true);
    setFiles((prev) => [...prev, ...Array.from(e.dataTransfer.files || [])]);
  };

  /**
   * Validates form data and submits or edits the subtask submission.
   */
  const handleSubmit = async () => {
    const validLinks = (links || [])
      .map((l) => (typeof l === "string" ? l.trim() : l?.url ? l.url.trim() : ""))
      .filter(Boolean);

    if (!comment.trim() && files.length === 0 && validLinks.length === 0 && !submissionToEdit) {
      notify.error(
        t("Please add a comment, attach files, or add links.", {
          defaultValue: "Please add a comment, attach files, or add links.",
        })
      );
      return;
    }

    const subtaskId = subtask?.id || subtask?.deliverable_id || subtask?.deliverable?.id;
    if (!subtaskId && !submissionToEdit) {
      notify.error(t("Subtask ID is missing.", { defaultValue: "Subtask ID is missing." }));
      return;
    }

    await run(async () => {
      try {
        const token = authToken();
        const formData = new FormData();
        if (comment.trim()) formData.append("comment", comment.trim());
        files.forEach((f) => formData.append("files[]", f));
        if (files.length === 1) formData.append("file", files[0]);
        validLinks.forEach((l) => formData.append("links[]", l));

        const endpoint = submissionToEdit
          ? `${API_URL}/deliveries/submissions/${submissionToEdit.id}`
          : `${API_URL}/deliverables/${subtaskId}/submit`;

        const res = await fetch(endpoint, {
          method: "POST",
          headers: {
            Accept: "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: formData,
          _notifHandled: true,
        });

        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          if (data.file_skipped || data.files_skipped) {
            notify.warning(
              data.message ||
                t("Subtask submitted, but file could not be uploaded due to storage limit.", {
                  defaultValue: "Subtask submitted, but file could not be uploaded due to storage limit.",
                })
            );
          } else {
            notify.success(
              data.message ||
                (submissionToEdit
                  ? t("Submission updated successfully!", { defaultValue: "Submission updated successfully!" })
                  : t("Subtask submitted successfully!", { defaultValue: "Subtask submitted successfully!" }))
            );
          }
          setIsDirty(false);
          if (onSubmitSuccess) {
            onSubmitSuccess(data.deliverable || data.task || data || subtask);
          }
          if (onClose) {
            onClose();
          }
        } else {
          // Extract backend validation error (422) or generic message
          let errorMsg = data.message;
          if (data.errors && typeof data.errors === "object") {
            const errorEntries = Object.entries(data.errors);
            if (errorEntries.length > 0) {
              const [, msgs] = errorEntries[0];
              const msg = Array.isArray(msgs) ? msgs[0] : msgs;
              if (msg) errorMsg = msg;
            }
          }
          notify.error(errorMsg || t("Failed to submit.", { defaultValue: "Failed to submit." }));
        }
      } catch (err) {
        console.error("Submit deliverable error:", err);
        notify.error(err?.message || t("An error occurred. Please try again.", { defaultValue: "An error occurred. Please try again." }));
      }
    });
  };

  if (!isOpen || !subtask) return null;

  const statusLabel = t((subtask.status || "pending").charAt(0).toUpperCase() + (subtask.status || "pending").slice(1));
  const isImageFile = (f) => f.type?.startsWith("image/");

  return createPortal(
    <>
    <div className="sd-overlay">
      <div className="sd-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="sd-header">
          <div>
            <h2 className="sd-title">{subtask.title}</h2>
            <div className="sd-meta">
              <span className={`sd-status-badge sd-status-${subtask.status || "pending"}`}>{statusLabel}</span>
              {subtask.due_date && (
                <span className="sd-due-date">{t("Due Date", { defaultValue: "Due Date" })} {formatDateTimeShort(subtask.due_date)}</span>
              )}
            </div>
          </div>
          <button className="sd-close-btn" onClick={handleClose} title={t("Close", { defaultValue: "Close" })}>
            <X size={18} />
          </button>
        </div>

        <div className="sd-body">
          <h3 className="sd-section-title">{submissionToEdit ? t("Edit Submission", { defaultValue: "Edit Submission" }) : ["rework_required", "rejected", "reopened"].includes(subtask.status) ? t("Resubmit Subtask", { defaultValue: "Resubmit Subtask" }) : t("Submit Subtask", { defaultValue: "Submit Subtask" })}</h3>

          <div className="sd-field">
            <label className="sd-label">{t("Submission Notes", { defaultValue: "Submission Notes" })}</label>
            <textarea
              className="sd-textarea"
              placeholder={t("Describe your submission...", { defaultValue: "Describe your submission..." })}
              value={comment}
              onChange={(e) => { setComment(e.target.value); }}
              rows={3}
            />
          </div>

          <div className="sd-field">
            <label className="sd-label">{t("Attachments", { defaultValue: "Attachments" })} ({files.length})</label>
            <div
              className="sd-dropzone"
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => document.getElementById(`sdm-file-${subtask.id}`)?.click()}
            >
              <div className="sd-dropzone-icon">
                <Upload size={24} strokeWidth={1.5} />
              </div>
              <p className="sd-dropzone-text">{t("Drag & drop files or", { defaultValue: "Drag & drop files or" })} <span className="sd-browse">{t("browse", { defaultValue: "browse" })}</span></p>
              <p className="sd-dropzone-hint">{t("Supports: PDF, DOC, XLS, PPT, images, ZIP, RAR", { defaultValue: "Supports: PDF, DOC, XLS, PPT, images, ZIP, RAR" })}</p>
            </div>
            <input
              id={`sdm-file-${subtask.id}`}
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
                    <button className="sd-file-remove" onClick={() => { setPendingFileIndex(i); setFileRemoveConfirmOpen(true); }}>
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <SubmissionLinkSection
            onLinksChange={(val) => { setLinks(val); }}
          />
        </div>

        <div className="sd-footer">
          <button className="sd-cancel-btn" onClick={handleClose} disabled={submitting}>{t("Cancel")}</button>
          <LoadingButton className="sd-submit-btn" onClick={handleSubmit} loading={submitting}>
            {submissionToEdit ? t("Edit Submission", { defaultValue: "Edit Submission" }) : ["rework_required", "rejected", "reopened"].includes(subtask.status) ? t("Resubmit Subtask", { defaultValue: "Resubmit Subtask" }) : t("Submit Subtask", { defaultValue: "Submit Subtask" })}
          </LoadingButton>
        </div>
      </div>
    </div>
    <ConfirmModal
      isOpen={fileRemoveConfirmOpen}
      onClose={() => { setFileRemoveConfirmOpen(false); setPendingFileIndex(-1); }}
      onConfirm={() => { removeFile(pendingFileIndex); setFileRemoveConfirmOpen(false); setPendingFileIndex(-1); }}
      title={t("Remove File", { defaultValue: "Remove File" })}
      message={t("Are you sure you want to remove this file?", { defaultValue: "Are you sure you want to remove this file?" })}
      confirmText={t("Remove", { defaultValue: "Remove" })}
      cancelText={t("Cancel")}
      danger
    />
    {ConfirmDialog}
    </>,
    document.body
  );
}

export default SubmitDeliverableModal;
