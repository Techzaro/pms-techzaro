/**
 * TaskSubmissionPanel.jsx
 * Displays the submission workflow panel for a task. Shows submission details,
 * attachments (files, images, links), approval/rejection actions for the creator,
 * a submission history section, and a chronological history of all workflow events.
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FileText, Download, ExternalLink } from "lucide-react";
import ConfirmationDialog from "./ConfirmationDialog";
import TaskReopenDialog from "./TaskReopenDialog";
import AbandonModal from "./AbandonModal";
import API_URL from "../config/api";
import { authToken, getUser } from "../utils/auth";
import { formatDateTime } from "../utils/formatDateTime";
import { notify } from "../utils/notify";

const API_BASE = API_URL.replace(/\/api\/?$/, "");

function fileUrl(url) {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  return API_BASE + url;
}

function downloadUrl(path, filename) {
  if (!path) return null;
  const name = filename || path.split("/").pop();
  return `${API_URL}/files/download?path=${encodeURIComponent(path)}&name=${encodeURIComponent(name)}`;
}

async function triggerDownload(e, path, filename) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  if (!path) return;

  const name = filename || path.split("/").pop();
  const downloadApiUrl = `${API_URL}/files/download?path=${encodeURIComponent(path)}&name=${encodeURIComponent(name)}`;

  try {
    const token = authToken();
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const res = await fetch(downloadApiUrl, { headers });
    if (!res.ok) throw new Error("Fetch failed");
    const blob = await res.blob();
    const blobUrl = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(blobUrl);
  } catch {
    window.open(downloadApiUrl, "_blank");
  }
}

function formatFileSize(bytes) {
  if (!bytes) return "";
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return mb.toFixed(1) + " MB";
  const kb = bytes / 1024;
  if (kb >= 1) return kb.toFixed(0) + " KB";
  return bytes + " B";
}

function formatDateShort(value) {
  return formatDateTime(value);
}

function actionLabel(action, t) {
  const map = {
    submitted: t ? t("Submitted", { defaultValue: "Submitted" }) : "Submitted",
    resubmitted: t ? t("Resubmitted", { defaultValue: "Resubmitted" }) : "Resubmitted",
    acknowledged: t ? t("Acknowledged", { defaultValue: "Acknowledged" }) : "Acknowledged",
    paused: t ? t("Paused", { defaultValue: "Paused" }) : "Paused",
    continued: t ? t("Continued", { defaultValue: "Continued" }) : "Continued",
    approved: t ? t("Approved", { defaultValue: "Approved" }) : "Approved",
    rejected: t ? t("Declined", { defaultValue: "Declined" }) : "Declined",
    reopened: t ? t("Reopened", { defaultValue: "Reopened" }) : "Reopened",
  };
  return map[action] || action;
}

function submissionStatusLabel(status, t) {
  const map = {
    pending: t ? t("Pending Review", { defaultValue: "Pending Review" }) : "Pending Review",
    approved: t ? t("Approved", { defaultValue: "Approved" }) : "Approved",
    reopened: t ? t("Reopened", { defaultValue: "Reopened" }) : "Reopened",
  };
  return map[status] || (t ? t(status || "Pending") : status || "Pending");
}

function submissionStatusColor(status) {
  const map = {
    pending: "var(--color-blue)",
    approved: "var(--color-success)",
    reopened: "var(--color-warning)",
  };
  return map[status] || "var(--text-secondary)";
}

function submissionStatusBg(status) {
  const map = {
    pending: "var(--color-blue-bg)",
    approved: "var(--color-success-bg)",
    reopened: "var(--color-warning-bg)",
  };
  return map[status] || "var(--bg-hover)";
}

function TaskSubmissionPanel({
  task,
  isCreator,
  isAssignee,
  isSuperAdmin: propIsSuperAdmin,
  canApprove: propCanApprove,
  onTaskUpdate,
  onSubmitClick,
  confirmDialog,
  setConfirmDialog,
  reopenDialog,
  setReopenDialog,
  acting,
  setActing,
  hideTimeline,
  onEditSubmissionClick,
}) {
  const { t } = useTranslation();
  const latestSubmission = task.latest_submission || task.latestSubmission;
  const workflowEvents = task.workflow_events || task.workflowEvents || [];
  const submissions = task.submissions || [];
  const status = task.status;
  const isNextApprover = task.is_next_approver;
  const hasDelegationChain = task.has_delegation_chain;
  const transferorHasApproved = task.transferor_has_approved ?? false;
  const currentUser = getUser();
  const userRole = currentUser?.role;
  const isSuperAdmin = propIsSuperAdmin ?? (userRole === "admin" || userRole === "super_admin");
  const canApprove = propCanApprove ?? (!isAssignee && (isCreator || isSuperAdmin));

  const [abandonModalOpen, setAbandonModalOpen] = useState(false);
  const [abandonAction, setAbandonAction] = useState(null);

  const handleAbandonSubmit = async (reason) => {
    setAbandonModalOpen(false);
    if (abandonAction === "request") {
      await handleAction("request-abandon", { reason });
    } else if (abandonAction === "decline") {
      await handleAction("decline-abandon", { reason });
    } else if (abandonAction === "direct") {
      await handleAction("abandon", { reason });
    }
  };

  const handleAction = async (action, body = {}) => {
    setActing(true);
    try {
      const token = authToken();
      let res;
      if (action === "reopen") {
        return;
      }
      res = await fetch(`${API_URL}/tasks/${task.id}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
        _notifHandled: true,
      });
      const data = await res.json();
      if (res.ok) {
        onTaskUpdate(data.task);
        publish("task:updated", data.task);
        publish("data:changed", { type: "task", action, id: task.id });
      }
    } catch {
      // silently fail
    } finally {
      setActing(false);
    }
  };

  const confirmMessages = {
    approve: t("Are you sure you want to approve this task?", { defaultValue: "Are you sure you want to approve this task?" }),
    reject: t("Are you sure you want to decline this task? The assignee will not be able to resubmit.", { defaultValue: "Are you sure you want to decline this task? The assignee will not be able to resubmit." }),
  };

  const historyItems = workflowEvents
    .filter((e) => e.action !== 'field_changed')
    .map((e) => ({
    id: `evt-${e.id}`,
    action: e.action,
    user: e.user,
    date: e.created_at,
    comment: e.comment,
    instructions: e.instructions,
    new_deadline: e.new_deadline,
    file_name: e.file_name,
    file_path: e.file_path,
    type: e.action === "submitted" || e.action === "resubmitted" ? "submission" : "event",
  })).reverse();

  return (
    <div className="td-submission-panel">
      {/* Abandon requested details */}
      {status === "abandon_requested" && (
        <div className="td-card td-submission-card" style={{ borderLeft: "4px solid var(--color-warning, #f59e0b)" }}>
          <h3 className="td-card-title" style={{ color: "var(--color-warning, #d97706)" }}>{t("Abandon Requested", { defaultValue: "Abandon Requested" })}</h3>
          <div className="td-submission-grid">
            <div className="td-submission-item">
              <span className="td-submission-label">{t("Requested By", { defaultValue: "Requested By" })}</span>
              <span className="td-submission-value">{(task.abandon_requested_by || task.abandonRequestedBy)?.name || "—"}</span>
            </div>
            {task.abandon_requested_at && (
              <div className="td-submission-item">
                <span className="td-submission-label">{t("Requested On", { defaultValue: "Requested On" })}</span>
                <span className="td-submission-value">{formatDateTime(task.abandon_requested_at)}</span>
              </div>
            )}
          </div>
          {task.abandon_reason && (
            <div className="td-submission-item" style={{ marginTop: "12px" }}>
              <span className="td-submission-label">{t("Reason for Abandonment", { defaultValue: "Reason for Abandonment" })}</span>
              <p className="td-submission-text">{task.abandon_reason}</p>
            </div>
          )}
        </div>
      )}

      {/* Abandoned details */}
      {status === "abandoned" && (
        <div className="td-card td-submission-card" style={{ borderLeft: "4px solid var(--color-danger, #ef4444)" }}>
          <h3 className="td-card-title" style={{ color: "var(--color-danger, #dc2626)" }}>{t("Task Abandoned", { defaultValue: "Task Abandoned" })}</h3>
          <div className="td-submission-grid">
            <div className="td-submission-item">
              <span className="td-submission-label">{t("Abandoned By", { defaultValue: "Abandoned By" })}</span>
              <span className="td-submission-value">{(task.abandoned_by || task.abandonedBy)?.name || "—"}</span>
            </div>
            {task.abandoned_at && (
              <div className="td-submission-item">
                <span className="td-submission-label">{t("Abandoned On", { defaultValue: "Abandoned On" })}</span>
                <span className="td-submission-value">{formatDateTime(task.abandoned_at)}</span>
              </div>
            )}
          </div>
          {task.abandon_reason && (
            <div className="td-submission-item" style={{ marginTop: "12px" }}>
              <span className="td-submission-label">{t("Reason", { defaultValue: "Reason" })}</span>
              <p className="td-submission-text">{task.abandon_reason}</p>
            </div>
          )}
          {canApprove && (
            <div className="td-review-actions" style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center", marginTop: "16px" }}>
              <button
                className="td-review-btn td-review-btn--reopen"
                disabled={acting}
                onClick={() => setReopenDialog(true)}
              >
                {t("Reopen Task", { defaultValue: "Reopen Task" })}
              </button>
            </div>
          )}
        </div>
      )}
      {/* Reopen details for assignee */}
      {status === "reopened" && (
        <div className="td-card td-submission-card">
          <h3 className="td-card-title">{t("Reopen Details", { defaultValue: "Reopen Details" })}</h3>
          <div className="td-submission-grid">
            <div className="td-submission-item">
              <span className="td-submission-label">{t("Reopened By", { defaultValue: "Reopened By" })}</span>
              <span className="td-submission-value">{(task.reopened_by || task.reopenedBy)?.name || "\u2014"}</span>
            </div>
            <div className="td-submission-item">
              <span className="td-submission-label">{t("Reopened On", { defaultValue: "Reopened On" })}</span>
              <span className="td-submission-value">{formatDateTime(task.reopened_at)}</span>
            </div>
          </div>
          {task.reopen_reason && (
            <div className="td-submission-item" style={{ marginTop: "12px" }}>
              <span className="td-submission-label">{t("Reason", { defaultValue: "Reason" })}</span>
              <p className="td-submission-text">{task.reopen_reason}</p>
            </div>
          )}
          {task.reopen_comment && task.reopen_comment !== task.reopen_reason && (
            <div className="td-submission-item" style={{ marginTop: "12px" }}>
              <span className="td-submission-label">{t("Reopen Comment", { defaultValue: "Reopen Comment" })}</span>
              <p className="td-submission-text">{task.reopen_comment}</p>
            </div>
          )}
          {task.reopen_instructions && (
            <div className="td-submission-item" style={{ marginTop: "12px" }}>
              <span className="td-submission-label">{t("Additional Instructions", { defaultValue: "Additional Instructions" })}</span>
              <p className="td-submission-text">{task.reopen_instructions}</p>
            </div>
          )}
          {task.reopen_new_deadline && (
            <div className="td-submission-item" style={{ marginTop: "12px" }}>
              <span className="td-submission-label">{t("New Deadline", { defaultValue: "New Deadline" })}</span>
              <span className="td-submission-value">{formatDateShort(task.reopen_new_deadline)}</span>
            </div>
          )}
          {task.reopen_link && (
            <div className="td-submission-item" style={{ marginTop: "12px" }}>
              <span className="td-submission-label">{t("Attached Link", { defaultValue: "Attached Link" })}</span>
              <a href={task.reopen_link} target="_blank" rel="noopener noreferrer" className="td-submission-value" style={{ color: "#6366f1", textDecoration: "underline", wordBreak: "break-all" }}>
                {task.reopen_link}
              </a>
            </div>
          )}
          {task.reopen_file_name && (
            <div className="td-submission-item" style={{ marginTop: "12px" }}>
              <span className="td-submission-label">{t("Attached File(s) / Screenshots", { defaultValue: "Attached File(s) / Screenshots" })}</span>
              <div className="td-attachments-list" style={{ marginTop: "6px", display: "flex", flexDirection: "column", gap: "6px" }}>
                {(() => {
                  const paths = (task.reopen_file_path || "").split(",").map((p) => p.trim()).filter(Boolean);
                  const names = (task.reopen_file_name || "").split(",").map((n) => n.trim()).filter(Boolean);
                  return (names.length ? names : paths).map((name, idx) => {
                    const path = paths[idx] || paths[0] || name;
                    const href = downloadUrl(path, name);
                    return (
                      <a
                        key={idx}
                        className="td-submission-file-link"
                        href={href}
                        download={name}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => triggerDownload(e, path, name)}
                      >
                        <FileText size={16} />
                        <span>{name}</span>
                        <Download size={14} style={{ marginLeft: "auto" }} />
                      </a>
                    );
                  });
                })()}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Submission details */}
      {(status === "submitted" || status === "submitted_late" || status === "approved" || status === "rejected" || status === "in_progress" || status === "reopened") && latestSubmission && (
        <div className="td-card td-submission-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
            <h3 className="td-card-title" style={{ margin: 0 }}>{t("Submission Details", { defaultValue: "Submission Details" })}</h3>
            {!task.has_edited_submission &&
              ((latestSubmission.submitted_by || latestSubmission.submittedBy)?.id === currentUser?.id || latestSubmission.submitted_by === currentUser?.id) && (
                <button
                  type="button"
                  className="td-review-btn"
                  onClick={() => onEditSubmissionClick && onEditSubmissionClick()}
                  style={{ padding: "4px 12px", fontSize: "12px", background: "#6366f1", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer" }}
                >
                  {t("Edit Submission", { defaultValue: "Edit Submission" })}
                </button>
              )}
          </div>
          <div className="td-submission-grid">
            <div className="td-submission-item">
              <span className="td-submission-label">{t("Submitted By", { defaultValue: "Submitted By" })}</span>
              <span className="td-submission-value">{(latestSubmission.submitted_by || latestSubmission.submittedBy)?.name || t("Unknown", { defaultValue: "Unknown" })}</span>
            </div>
            <div className="td-submission-item">
              <span className="td-submission-label">{t("Submitted At", { defaultValue: "Submitted At" })}</span>
              <span className="td-submission-value">{formatDateTime(latestSubmission.created_at)}</span>
            </div>
          </div>
          {latestSubmission.version_number > 1 && (
            <div className="td-submission-item" style={{ marginTop: "8px" }}>
              <span className="td-submission-label">{t("Submission Version", { defaultValue: "Submission Version" })}</span>
              <span className="td-submission-value">#{latestSubmission.version_number}</span>
            </div>
          )}
          {latestSubmission.comment && (
            <div className="td-submission-item" style={{ marginTop: "12px" }}>
              <span className="td-submission-label">{t("Submission Notes", { defaultValue: "Submission Notes" })}</span>
              <p className="td-submission-text">{latestSubmission.comment}</p>
            </div>
          )}

          {(() => {
            const atts = latestSubmission.attachments || [];
            const files = atts.filter((a) => a.attachment_type === "file");
            const images = atts.filter((a) => a.attachment_type === "image");
            const links = atts.filter((a) => a.attachment_type === "link");

            return (
              <>
                {files.length > 0 && (
                  <div className="td-submission-item" style={{ marginTop: "12px" }}>
                    <span className="td-submission-label">{t("Files ({{count}})", { defaultValue: `Files (${files.length})`, count: files.length })}</span>
                    <div className="td-attachments-list">
                      {files.map((att) => {
                        const href = downloadUrl(att.full_url, att.original_name || att.file_name);
                        const name = att.original_name || att.file_name;
                        return (
                          <a
                            key={att.id}
                            className="td-submission-file-link"
                            href={href}
                            download={name}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => triggerDownload(e, att.full_url, name)}
                          >
                            <FileText size={16} />
                            <span>{name}</span>
                            {att.file_size && <span style={{ fontSize: "11px", color: "#9CA3AF", marginLeft: "auto" }}>{formatFileSize(att.file_size)}</span>}
                            <Download size={14} />
                          </a>
                        );
                      })}
                    </div>
                  </div>
                )}

                {images.length > 0 && (
                  <div className="td-submission-item" style={{ marginTop: "12px" }}>
                    <span className="td-submission-label">{t("Images ({{count}})", { defaultValue: `Images (${images.length})`, count: images.length })}</span>
                    <div className="td-image-grid">
                      {images.map((att) => {
                        const name = att.original_name || att.file_name;
                        const href = downloadUrl(att.full_url, name);
                        return (
                          <div key={att.id} className="td-image-thumb" style={{ position: "relative" }}>
                            <img src={fileUrl(att.full_url)} alt={name} onClick={() => window.open(fileUrl(att.full_url), "_blank")} />
                            <a
                              href={href}
                              download={name}
                              target="_blank"
                              rel="noopener noreferrer"
                              title={t("Download Image", { defaultValue: "Download Image" })}
                              onClick={(e) => triggerDownload(e, att.full_url, name)}
                              style={{
                                position: "absolute", bottom: "4px", right: "4px",
                                background: "rgba(0,0,0,0.75)", color: "#fff",
                                padding: "4px 6px", borderRadius: "4px", display: "flex",
                                alignItems: "center", gap: "4px", fontSize: "11px", cursor: "pointer"
                              }}
                            >
                              <Download size={13} /> {t("Download", { defaultValue: "Download" })}
                            </a>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {links.length > 0 && (
                  <div className="td-submission-item" style={{ marginTop: "12px" }}>
                    <span className="td-submission-label">{t("Links ({{count}})", { defaultValue: `Links (${links.length})`, count: links.length })}</span>
                    <div className="td-attachments-list">
                      {links.map((att) => (
                        <div key={att.id} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <a className="td-submission-file-link" href={att.url} target="_blank" rel="noopener noreferrer" style={{ flex: 1 }}>
                            <ExternalLink size={16} />
                            <span>{att.original_name || att.url}</span>
                          </a>
                          <button
                            type="button"
                            className="td-review-btn"
                            style={{ padding: "4px 8px", fontSize: "11px", height: "auto", border: "1px solid #D1D5DB" }}
                            onClick={() => {
                              navigator.clipboard.writeText(att.url);
                              notify.success(t("Link copied to clipboard!", { defaultValue: "Link copied to clipboard!" }));
                            }}
                          >
                            {t("Copy Link", { defaultValue: "Copy Link" })}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {latestSubmission.file_name && atts.length === 0 && (
                  <div className="td-submission-item" style={{ marginTop: "12px" }}>
                    <span className="td-submission-label">{t("Attached File", { defaultValue: "Attached File" })}</span>
                    <a
                      className="td-submission-file-link"
                      href={`${API_URL}/tasks/submission-file/${latestSubmission.id}`}
                      download={latestSubmission.file_name}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <FileText size={16} />
                      <span>{latestSubmission.file_name}</span>
                      <Download size={14} style={{ marginLeft: "auto" }} />
                    </a>
                  </div>
                )}
              </>
            );
          })()}

          {/* Combined Review & Abandon action buttons */}
          <div className="td-review-actions" style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center", marginTop: "16px" }}>
            {canApprove && status === "submitted" && (
              <>
                <button
                  className="td-review-btn td-review-btn--approve"
                  disabled={acting}
                  onClick={() => setConfirmDialog({ open: true, type: "approve" })}
                >
                  {t("Approve", { defaultValue: "Approve" })}
                </button>
                <button
                  className="td-review-btn td-review-btn--reject"
                  disabled={acting}
                  onClick={() => setConfirmDialog({ open: true, type: "reject" })}
                >
                  {t("Decline", { defaultValue: "Decline" })}
                </button>
                <button
                  className="td-review-btn td-review-btn--reopen"
                  disabled={acting}
                  onClick={() => setReopenDialog(true)}
                >
                  {t("Decline & Reopen", { defaultValue: "Decline & Reopen" })}
                </button>
              </>
            )}

            {canApprove && status === "approved" && (
              <button
                className="td-review-btn td-review-btn--reopen"
                disabled={acting}
                onClick={() => setReopenDialog(true)}
              >
                {t("Reopen Task", { defaultValue: "Reopen Task" })}
              </button>
            )}

            {status !== "abandoned" && (
              <>
                {canApprove && status === "abandon_requested" && (
                  <>
                    <button
                      className="td-review-btn td-review-btn--approve"
                      disabled={acting}
                      onClick={() => handleAction("approve-abandon")}
                    >
                      {t("Approve Abandon", { defaultValue: "Approve Abandon" })}
                    </button>
                    <button
                      className="td-review-btn td-review-btn--reject"
                      disabled={acting}
                      onClick={() => {
                        setAbandonAction("decline");
                        setAbandonModalOpen(true);
                      }}
                    >
                      {t("Decline Abandon", { defaultValue: "Decline Abandon" })}
                    </button>
                  </>
                )}

                {canApprove && status !== "abandon_requested" && (
                  <button
                    className="td-review-btn td-review-btn--reject"
                    style={{ background: "#dc2626", color: "#fff", borderColor: "#dc2626" }}
                    disabled={acting}
                    onClick={() => {
                      setAbandonAction("direct");
                      setAbandonModalOpen(true);
                    }}
                  >
                    {t("Abandon Task", { defaultValue: "Abandon Task" })}
                  </button>
                )}

                {isAssignee && !canApprove && status !== "abandon_requested" && (
                  <button
                    className="td-review-btn td-review-btn--reject"
                    style={{ background: "#f59e0b", color: "#fff", borderColor: "#f59e0b" }}
                    disabled={acting}
                    onClick={() => {
                      setAbandonAction("request");
                      setAbandonModalOpen(true);
                    }}
                  >
                    {t("Request Abandon", { defaultValue: "Request Abandon" })}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Submission History */}
      {submissions.length > 1 && (
        <div className="td-card td-submission-card">
          <h3 className="td-card-title">{t("Submission History", { defaultValue: "Submission History" })}</h3>
          <div className="td-submission-history">
            {submissions.map((sub, idx) => (
              <div key={sub.id} className="td-history-entry" style={{
                padding: "12px 16px",
                borderBottom: idx < submissions.length - 1 ? "1px solid var(--border)" : "none",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                  <span style={{ fontWeight: 600, fontSize: "13px", color: "var(--text-heading)" }}>
                    {t("Submission #{{version}}", { defaultValue: `Submission #${sub.version_number || (submissions.length - idx)}`, version: sub.version_number || (submissions.length - idx) })}
                  </span>
                  <span className="badge" style={{
                    background: submissionStatusBg(sub.status),
                    color: submissionStatusColor(sub.status),
                    fontSize: "11px",
                    padding: "2px 8px",
                    borderRadius: "12px",
                    fontWeight: 600,
                  }}>
                    {submissionStatusLabel(sub.status, t)}
                  </span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 16px", fontSize: "12px", color: "var(--text-secondary)" }}>
                  <span>{t("By: {{name}}", { defaultValue: `By: ${sub.submitted_by?.name || sub.submittedBy?.name || "Unknown"}`, name: sub.submitted_by?.name || sub.submittedBy?.name || t("Unknown") })}</span>
                  <span>{t("On: {{date}}", { defaultValue: `On: ${formatDateTime(sub.created_at)}`, date: formatDateTime(sub.created_at) })}</span>
                  {sub.approved_by && (
                    <>
                      <span>{t("Approved by: {{name}}", { defaultValue: `Approved by: ${sub.approved_by?.name || "Unknown"}`, name: sub.approved_by?.name || t("Unknown") })}</span>
                      <span>{t("Approved: {{date}}", { defaultValue: `Approved: ${formatDateTime(sub.approved_at)}`, date: formatDateTime(sub.approved_at) })}</span>
                    </>
                  )}
                  {sub.reopened_by && (
                    <>
                      <span>{t("Reopened by: {{name}}", { defaultValue: `Reopened by: ${sub.reopened_by?.name || "Unknown"}`, name: sub.reopened_by?.name || t("Unknown") })}</span>
                      <span>{t("Reason: {{reason}}", { defaultValue: `Reason: ${sub.reopen_reason || "N/A"}`, reason: sub.reopen_reason || "N/A" })}</span>
                    </>
                  )}
                </div>
                {sub.comment && (
                  <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "6px", fontStyle: "italic" }}>
                    "{sub.comment}"
                  </p>
                )}
                {/* Show attachments for all submissions in history */}
                {(sub.attachments?.length > 0 || sub.file_name) && (
                  <div style={{ marginTop: "8px", display: "flex", flexWrap: "wrap", gap: "8px" }}>
                    {(sub.attachments || []).map((att) => {
                      const name = att.original_name || att.file_name;
                      return (
                        <a
                          key={att.id}
                          className="td-submission-file-link"
                          href={att.attachment_type === "link" ? att.url : downloadUrl(att.full_url, name)}
                          download={att.attachment_type === "link" ? undefined : name}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => att.attachment_type !== "link" && triggerDownload(e, att.full_url, name)}
                          style={{ fontSize: "11px", padding: "2px 8px" }}
                        >
                          {att.attachment_type === "link" ? <ExternalLink size={12} /> : <FileText size={12} />}
                          <span>{name}</span>
                        </a>
                      );
                    })}
                    {sub.file_name && (!sub.attachments || sub.attachments.length === 0) && (
                      <a
                        className="td-submission-file-link"
                        href={`${API_URL}/tasks/submission-file/${sub.id}`}
                        download={sub.file_name}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ fontSize: "11px", padding: "2px 8px" }}
                      >
                        <FileText size={12} />
                        <span>{sub.file_name}</span>
                      </a>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Reopen Count */}
      {(task.reopen_count > 0 || (status !== "reopened" && historyItems.filter(i => i.action === "reopened").length > 0)) && (
        <div className="td-card td-submission-card" style={{ padding: "12px 16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "13px", color: "var(--text-secondary)" }}>{t("Reopen Count", { defaultValue: "Reopen Count" })}</span>
            <span style={{
              fontSize: "18px", fontWeight: 700,
              color: (task.reopen_count || historyItems.filter(i => i.action === "reopened").length) > 0 ? "var(--color-warning)" : "var(--text-primary)",
            }}>
              {task.reopen_count || historyItems.filter(i => i.action === "reopened").length}
            </span>
          </div>
        </div>
      )}

      {/* Submission history timeline */}
      {!hideTimeline && historyItems.length > 0 && (
        <div className="td-card td-submission-card">
          <h3 className="td-card-title">{t("Timeline History", { defaultValue: "Timeline History" })}</h3>
          <ul className="td-history-list">
            {historyItems.map((item) => (
              <li key={item.id} className="td-history-item">
                <div className="td-history-header">
                  <span className={`td-history-badge td-history-badge--${item.action}`}>{actionLabel(item.action, t)}</span>
                  <span className="td-history-date">{formatDateTime(item.date)}</span>
                </div>
                <div className="td-history-meta">
                  {t("by {{name}}", { defaultValue: `by ${item.user?.name || "Unknown"}`, name: item.user?.name || t("Unknown") })}
                </div>
                {item.comment && <p className="td-submission-text">{item.comment}</p>}
                {item.instructions && (
                  <p className="td-submission-text"><strong>{t("Instructions:", { defaultValue: "Instructions:" })}</strong> {item.instructions}</p>
                )}
                {item.new_deadline && (
                  <p className="td-submission-text"><strong>{t("New Deadline:", { defaultValue: "New Deadline:" })}</strong> {formatDateShort(item.new_deadline)}</p>
                )}
                {item.file_name && item.file_path && (
                  <a
                    className="td-submission-file-link"
                    href={downloadUrl(item.file_path, item.file_name)}
                    download={item.file_name}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ marginTop: "6px" }}
                  >
                    <FileText size={14} />
                    <span>{item.file_name}</span>
                    <Download size={14} style={{ marginLeft: "auto" }} />
                  </a>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <ConfirmationDialog
        isOpen={confirmDialog.open}
        onClose={() => setConfirmDialog({ open: false, type: null })}
        onConfirm={() => {
          const type = confirmDialog.type;
          setConfirmDialog({ open: false, type: null });
          handleAction(type);
        }}
        title={confirmDialog.type === "approve" ? t("Approve Task", { defaultValue: "Approve Task" }) : t("Decline Task", { defaultValue: "Decline Task" })}
        message={confirmMessages[confirmDialog.type] || ""}
        confirmText={confirmDialog.type === "approve" ? t("Approve", { defaultValue: "Approve" }) : t("Decline", { defaultValue: "Decline" })}
        cancelText={t("Cancel")}
        confirmColor={confirmDialog.type === "approve" ? "#16A34A" : "#DC2626"}
      />

      <TaskReopenDialog
        isOpen={reopenDialog}
        onClose={() => setReopenDialog(false)}
        task={task}
        onReopenSuccess={onTaskUpdate}
      />

      <AbandonModal
        isOpen={abandonModalOpen}
        onClose={() => setAbandonModalOpen(false)}
        title={
          abandonAction === "request"
            ? t("Request to Abandon Task", { defaultValue: "Request to Abandon Task" })
            : abandonAction === "decline"
            ? t("Decline Abandon Request", { defaultValue: "Decline Abandon Request" })
            : t("Abandon Task", { defaultValue: "Abandon Task" })
        }
        subtitle={task.title}
        actionLabel={
          abandonAction === "request"
            ? t("Submit Request", { defaultValue: "Submit Request" })
            : abandonAction === "decline"
            ? t("Decline Request", { defaultValue: "Decline Request" })
            : t("Confirm Abandon", { defaultValue: "Confirm Abandon" })
        }
        onSubmit={handleAbandonSubmit}
        loading={acting}
      />
    </div>
  );
}

export default TaskSubmissionPanel;
