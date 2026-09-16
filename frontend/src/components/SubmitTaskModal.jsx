/**
 * SubmitTaskModal.jsx
 * Modal form for submitting a task. Supports file uploads via drag-and-drop,
 * link attachments, and submission notes. Handles initial submissions,
 * editing existing submissions, and resubmissions for reopened status.
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
import { isDeliverableItem } from "../utils/delegationUtils";
import "./SubmitDeliverableModal.css";
import "./layout/CreateTaskModal.css";

const API_BASE = API_URL.replace(/\/api\/?$/, "");

function getFileUrl(url) {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  return API_BASE + (url.startsWith("/") ? "" : "/") + url;
}

function formatFileSize(bytes) {
  if (!bytes || isNaN(bytes)) return "";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

/**
 * Modal form for submitting or editing a task or subtask submission.
 * @param {boolean} isOpen - Whether the modal is visible.
 * @param {Function} onClose - Callback to close the modal.
 * @param {Object} task - The task or subtask being submitted.
 * @param {string} [entityType] - "task" or "deliverable".
 * @param {Object} [existingSubmission] - Existing submission data when editing.
 * @param {boolean} [isEdit] - Whether the modal is in edit mode.
 * @param {Function} onSubmitSuccess - Callback after successful submission, receives updated item.
 */
function SubmitTaskModal({ isOpen, onClose, task, entityType, existingSubmission = null, isEdit = false, onSubmitSuccess }) {
  const { t } = useTranslation();
  const { isDirty, setIsDirty, handleClose, ConfirmDialog } = useConfirmOnClose(onClose);
  useEscapeKey(isOpen, handleClose);

  const [comment, setComment] = useState("");
  const [files, setFiles] = useState([]);
  const [existingAttachments, setExistingAttachments] = useState([]);
  const [deletedAttachmentIds, setDeletedAttachmentIds] = useState([]);
  const [links, setLinks] = useState([]);
  const { submitting, run } = useSubmit();
  const [fileRemoveConfirmOpen, setFileRemoveConfirmOpen] = useState(false);
  const [pendingRemoval, setPendingRemoval] = useState(null);

  // Lock body scroll and reset form state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      if (isEdit && (existingSubmission || task?.latest_submission || task?.latestSubmission)) {
        const sub = existingSubmission || task?.latest_submission || task?.latestSubmission;
        setComment(sub?.comment || "");

        const rawAtts = sub?.attachments || [];
        const fileAtts = rawAtts.filter((a) => a.attachment_type === "file" || a.attachment_type === "image" || (!a.attachment_type && a.file_path));
        const legacyFile = sub?.file_path && !fileAtts.some((a) => (a.file_path && a.file_path === sub.file_path) || a.file_name === sub.file_name)
          ? [{ id: "main_file", file_name: sub.file_name || "Attachment", original_name: sub.file_name || "Attachment", url: sub.file_path, full_url: sub.file_path, attachment_type: "file" }]
          : [];
        const addFiles = Array.isArray(sub?.files) ? sub.files.filter((f) => !fileAtts.some((a) => a.id === f.id || a.file_path === f.file_path)) : [];
        const addImages = Array.isArray(sub?.images) ? sub.images.filter((img) => !fileAtts.some((a) => a.id === img.id || a.file_path === img.file_path)) : [];
        
        setExistingAttachments([...fileAtts, ...legacyFile, ...addFiles, ...addImages]);
        setDeletedAttachmentIds([]);

        const linkAtts = rawAtts
          .filter((a) => a.attachment_type === "link" || (a.url && /^https?:\/\//i.test(a.url) && !a.file_path))
          .map((a) => ({ id: a.id, url: a.url || a.file_name, name: a.original_name || a.url || a.file_name }));
        const addLinks = Array.isArray(sub?.links)
          ? sub.links.map((l) => (typeof l === "string" ? { url: l, name: l } : { id: l.id, url: l.url || l.name, name: l.name || l.url }))
          : [];
        const combinedLinks = [...linkAtts, ...addLinks.filter((al) => !linkAtts.some((la) => la.url === al.url))];
        setLinks(combinedLinks);
        setFiles([]);
      } else {
        setComment("");
        setFiles([]);
        setExistingAttachments([]);
        setDeletedAttachmentIds([]);
        setLinks([]);
      }
      setIsDirty(false);
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [isOpen, isEdit, existingSubmission, task, setIsDirty]);

  // Handle Ctrl+V (Clipboard Paste) for files/screenshots when modal is open
  useEffect(() => {
    if (!isOpen) return;

    const handlePaste = (e) => {
      const clipboardFiles = e.clipboardData?.files;
      if (clipboardFiles && clipboardFiles.length > 0) {
        const newFiles = Array.from(clipboardFiles);
        setIsDirty(true);
        setFiles((prev) => [...prev, ...newFiles]);
        notify.success(t("Pasted {{count}} file(s) from clipboard", { defaultValue: `Pasted ${newFiles.length} file(s) from clipboard`, count: newFiles.length }));
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

  const removeExistingAttachment = (item) => {
    setIsDirty(true);
    setExistingAttachments((prev) => prev.filter((a) => (a.id ? a.id !== item.id : a !== item)));
    if (item.id) {
      setDeletedAttachmentIds((prev) => [...prev, item.id]);
    }
  };

  /** Handles file drops onto the dropzone area */
  const handleDrop = (e) => {
    e.preventDefault();
    setIsDirty(true);
    setFiles((prev) => [...prev, ...Array.from(e.dataTransfer.files || [])]);
  };

  /**
   * Validates form data and submits the task with files, links, and notes.
   * Shows error if no content (comment, files, or links) is provided.
   */
  const handleSubmit = async () => {
    const validLinks = (links || [])
      .map((l) => (typeof l === "string" ? l.trim() : l?.url ? l.url.trim() : ""))
      .filter(Boolean);

    if (!comment.trim() && files.length === 0 && existingAttachments.length === 0 && validLinks.length === 0) {
      notify.error(t("Please add a comment, attach files, or add links.", { defaultValue: "Please add a comment, attach files, or add links." }));
      return;
    }
    await run(async () => {
      try {
        const token = authToken();
        const formData = new FormData();
        if (comment.trim()) formData.append("comment", comment.trim());
        files.forEach((f) => formData.append("files[]", f));
        validLinks.forEach((l) => formData.append("links[]", l));

        if (isEdit) {
          deletedAttachmentIds.forEach((id) => formData.append("deleted_attachment_ids[]", id));
          if (deletedAttachmentIds.includes("main_file")) {
            formData.append("remove_main_file", "1");
          }
        }

        const isDeliverable = entityType === "deliverable" || isDeliverableItem(task);

        const sub = existingSubmission || task?.latest_submission || task?.latestSubmission;
        const endpoint = isEdit && sub
          ? (isDeliverable ? `${API_URL}/deliverables/submissions/${sub.id}` : `${API_URL}/tasks/submissions/${sub.id}`)
          : (isDeliverable ? `${API_URL}/deliverables/${task.id}/submit` : `${API_URL}/tasks/${task.id}/submit`);

        const res = await fetch(endpoint, {
          method: "POST",
          headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
          body: formData,
          _notifHandled: true,
        });

        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          const entityLabel = isDeliverable ? t("Subtask", { defaultValue: "Subtask" }) : t("Task", { defaultValue: "Task" });
          if (data.file_skipped) {
            notify.warning(data.message || t("{{entity}} submitted, but file could not be uploaded due to storage limit.", { entity: entityLabel, defaultValue: `${entityLabel} submitted, but file could not be uploaded due to storage limit.` }));
          } else {
            notify.success(
              isEdit
                ? t("Submission updated successfully!", { defaultValue: "Submission updated successfully!" })
                : (isDeliverable
                    ? t("Subtask submitted successfully!", { defaultValue: "Subtask submitted successfully!" })
                    : t("Task submitted successfully!", { defaultValue: "Task submitted successfully!" }))
            );
          }
          setIsDirty(false);
          const updatedItem = data.deliverable || data.task || data;
          if (onSubmitSuccess) onSubmitSuccess(updatedItem);
          onClose();
        } else {
          let errorMsg = data?.message;
          if (data?.errors && typeof data.errors === "object") {
            const errorEntries = Object.entries(data.errors);
            if (errorEntries.length > 0) {
              const [, msgs] = errorEntries[0];
              const msg = Array.isArray(msgs) ? msgs[0] : msgs;
              if (msg) errorMsg = msg;
            }
          }
          notify.error(errorMsg || (isDeliverable ? t("Failed to submit subtask.", { defaultValue: "Failed to submit subtask." }) : t("Failed to submit task.", { defaultValue: "Failed to submit task." })));
        }
      } catch (err) {
        console.error("Submit task modal error:", err);
        const errorMsg = err?.response?.data?.message || err?.message || t("An error occurred. Please try again.", { defaultValue: "An error occurred. Please try again." });
        notify.error(errorMsg);
      }
    });
  };

  if (!isOpen || !task) return null;

  const isDeliverable = entityType === "deliverable" || isDeliverableItem(task);

  const statusLabel = t((task.status || "pending").charAt(0).toUpperCase() + (task.status || "pending").slice(1));
  const isResubmit = task.status === "reopened";
  const projectLabel = task.project?.title || task.project_title || "";

  const isImageFile = (f) => f.type?.startsWith("image/");
  const totalAttachmentCount = existingAttachments.length + files.length;

  return createPortal(
    <>
    <div className="sd-overlay">
      <div className="sd-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="sd-header">
          <div>
            <h2 className="sd-title">{task.title}</h2>
            <div className="sd-meta">
              {projectLabel && (
                <span className="sd-project-name" style={{ fontSize: "13px", color: "#6366f1", fontWeight: 500, marginRight: "12px" }}>
                  {t("Project", { defaultValue: "Project" })}: {projectLabel}
                </span>
              )}
              {task.assigner && (
                <span className="sd-assigner" style={{ fontSize: "13px", color: "#6b7280", marginRight: "12px" }}>
                  {t("Assigned by: {{name}}", { defaultValue: `Assigned by: ${task.assigner.name}`, name: task.assigner.name })}
                </span>
              )}
              <span className={`sd-status-badge sd-status-${task.status || "pending"}`}>{statusLabel}</span>
              {task.due_date && (
                <span className="sd-due-date" style={{ marginLeft: "12px" }}>
                  {t("Due Date & Time", { defaultValue: "Due Date & Time" })} {formatDateTimeShort(task.due_date)}
                </span>
              )}
            </div>
          </div>
          <button className="sd-close-btn" onClick={handleClose} title={t("Close", { defaultValue: "Close" })}>
            <X size={18} />
          </button>
        </div>

        <div className="sd-body">
          <h3 className="sd-section-title">
            {isEdit
              ? t("Edit Submission", { defaultValue: "Edit Submission" })
              : isResubmit
                ? (isDeliverable ? t("Resubmit Subtask", { defaultValue: "Resubmit Subtask" }) : t("Resubmit Task", { defaultValue: "Resubmit Task" }))
                : (isDeliverable ? t("Submit Subtask", { defaultValue: "Submit Subtask" }) : t("Submit Task", { defaultValue: "Submit Task" }))
            }
          </h3>

          <div className="sd-field">
            <label className="sd-label">{t("Submission Notes", { defaultValue: "Submission Notes" })}</label>
            <textarea
              className="sd-textarea"
              placeholder={t("Describe your submission...", { defaultValue: "Describe your submission..." })}
              value={comment}
              onChange={(e) => { setIsDirty(true); setComment(e.target.value); }}
              rows={3}
            />
          </div>

          <div className="sd-field">
            <label className="sd-label">{t("Attachments", { defaultValue: "Attachments" })} ({totalAttachmentCount})</label>
            <div
              className="sd-dropzone"
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => document.getElementById(`stm-file-${task.id}`)?.click()}
            >
              <div className="sd-dropzone-icon">
                <Upload size={24} strokeWidth={1.5} />
              </div>
              <p className="sd-dropzone-text">{t("Drag & drop files or", { defaultValue: "Drag & drop files or" })} <span className="sd-browse">{t("browse", { defaultValue: "browse" })}</span></p>
              <p className="sd-dropzone-hint">{t("Supports: PDF, DOC, XLS, PPT, images, ZIP, RAR", { defaultValue: "Supports: PDF, DOC, XLS, PPT, images, ZIP, RAR" })}</p>
            </div>
            <input
              id={`stm-file-${task.id}`}
              type="file"
              multiple
              style={{ display: "none" }}
              onChange={handleFileSelect}
            />
            {totalAttachmentCount > 0 && (
              <div className="sd-file-list">
                {/* Existing attachments */}
                {existingAttachments.map((att, idx) => {
                  const isImg = att.attachment_type === "image" ||
                    (att.file_name && /\.(png|jpe?g|gif|webp|svg)$/i.test(att.file_name)) ||
                    (att.original_name && /\.(png|jpe?g|gif|webp|svg)$/i.test(att.original_name));
                  const displayName = att.original_name || att.file_name || t("Attachment", { defaultValue: "Attachment" });
                  const fileSourceUrl = getFileUrl(att.full_url || att.url || att.file_path);

                  return (
                    <div key={att.id || `ext-${idx}`} className="sd-file-preview">
                      <div className="sd-file-icon">
                        {isImg && fileSourceUrl ? (
                          <img
                            src={fileSourceUrl}
                            alt={displayName}
                            style={{ width: 28, height: 28, objectFit: "cover", borderRadius: 4 }}
                          />
                        ) : isImg ? (
                          <Image size={18} strokeWidth={1.5} />
                        ) : (
                          <FileText size={18} strokeWidth={1.5} />
                        )}
                      </div>
                      <div className="sd-file-info">
                        <span className="sd-file-name" title={displayName}>{displayName}</span>
                        {att.file_size ? <span className="sd-file-size">{formatFileSize(att.file_size)}</span> : null}
                      </div>
                      <button
                        type="button"
                        className="sd-file-remove"
                        title={t("Remove File", { defaultValue: "Remove File" })}
                        onClick={() => {
                          setPendingRemoval({ type: "existing", item: att });
                          setFileRemoveConfirmOpen(true);
                        }}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  );
                })}

                {/* Newly attached files */}
                {files.map((f, i) => (
                  <div key={`new-${i}`} className="sd-file-preview">
                    <div className="sd-file-icon">
                      {isImageFile(f) ? <Image size={18} strokeWidth={1.5} /> : <FileText size={18} strokeWidth={1.5} />}
                    </div>
                    <div className="sd-file-info">
                      <span className="sd-file-name">{f.name}</span>
                      <span className="sd-file-size">{(f.size / 1024 / 1024).toFixed(1)} MB</span>
                    </div>
                    <button
                      type="button"
                      className="sd-file-remove"
                      title={t("Remove File", { defaultValue: "Remove File" })}
                      onClick={() => {
                        setPendingRemoval({ type: "new", index: i });
                        setFileRemoveConfirmOpen(true);
                      }}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <SubmissionLinkSection
            initialLinks={links}
            onLinksChange={(val) => { setIsDirty(true); setLinks(val); }}
          />
        </div>

        <div className="sd-footer">
          <button className="sd-cancel-btn" onClick={handleClose} disabled={submitting}>{t("Cancel")}</button>
          <LoadingButton className="sd-submit-btn" onClick={handleSubmit} loading={submitting}>
            {isEdit
              ? t("Edit Submission", { defaultValue: "Edit Submission" })
              : isResubmit
                ? (isDeliverable ? t("Resubmit Subtask", { defaultValue: "Resubmit Subtask" }) : t("Resubmit Task", { defaultValue: "Resubmit Task" }))
                : (isDeliverable ? t("Submit Subtask", { defaultValue: "Submit Subtask" }) : t("Submit Task", { defaultValue: "Submit Task" }))
            }
          </LoadingButton>
        </div>
      </div>
    </div>
    <ConfirmModal
      isOpen={fileRemoveConfirmOpen}
      onClose={() => { setFileRemoveConfirmOpen(false); setPendingRemoval(null); }}
      onConfirm={() => {
        if (pendingRemoval?.type === "existing") {
          removeExistingAttachment(pendingRemoval.item);
        } else if (pendingRemoval?.type === "new") {
          removeFile(pendingRemoval.index);
        }
        setFileRemoveConfirmOpen(false);
        setPendingRemoval(null);
      }}
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

export default SubmitTaskModal;
