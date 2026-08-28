/**
 * SelfDeliverableViewModal.jsx
 * Modal for a team member to view their own subtask details, including
 * submission history, rework instructions, and approval status. Supports
 * self-approval and requesting rework on submitted subtasks.
 */

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { FileText } from "lucide-react";
import API_URL from "../config/api";
import { authToken } from "../utils/auth";
import { useEscapeKey } from "../hooks/useEscapeKey";
import ConfirmationDialog from "./ConfirmationDialog";
import SelfReworkDialog from "./SelfReworkDialog";
import { formatDateTime } from "../utils/formatDateTime";
import { showSuccessMessage } from "../utils/notify";
import "./SelfDeliverableViewModal.css";

/**
 * Resolves a storage file path to a full URL.
 * @param {string} path - The relative storage path.
 * @returns {string|null} The full URL or null.
 */
function fileUrl(path) {
  if (!path) return null;
  return `${API_URL.replace("/api", "")}/storage/${path}`;
}

/**
 * Builds a chronological timeline of submissions and workflow events
 * for display in the submission history section.
 * @param {Object} deliverable - The deliverable with submissions and workflow events.
 * @returns {Array} Sorted array of timeline items.
 */
function buildHistoryTimeline(deliverable, t) {
  if (!deliverable) return [];

  const items = [];

    (deliverable.submissions || [])
      .slice()
      // Sort submissions chronologically before indexing
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      .forEach((sub, index) => {
    items.push({
      id: `submission-${sub.id}`,
      type: index === 0 ? "submission" : "resubmission",
      label: index === 0 ? t("Original Submission", { defaultValue: "Original Submission" }) : t("Resubmission", { defaultValue: "Resubmission" }),
      date: sub.created_at,
      user: sub.submitted_by?.name || sub.submittedBy?.name || t("You", { defaultValue: "You" }),
      comment: sub.comment,
      file_path: sub.file_path,
      file_name: sub.file_name,
      attachments: sub.attachments || [],
    });
  });

  (deliverable.workflow_events || deliverable.workflowEvents || []).forEach((event) => {
    items.push({
      id: `event-${event.id}`,
      type: event.event_type,
      label: event.event_type === "rework" ? t("Rework Required", { defaultValue: "Rework Required" }) : t("Approved", { defaultValue: "Approved" }),
      date: event.created_at,
      user: event.user?.name || t("You", { defaultValue: "You" }),
      comment: event.comment,
      instructions: event.instructions,
      new_deadline: event.new_deadline,
      file_path: event.file_path,
      file_name: event.file_name,
    });
  });

  // Combine submissions and workflow events into a single sorted timeline
  return items.sort((a, b) => new Date(a.date) - new Date(b.date));
}

/**
 * Modal for viewing own subtask with full submission history and actions.
 * @param {boolean} isOpen - Whether the modal is visible.
 * @param {Function} onClose - Callback to close the modal.
 * @param {Object} subtask - The initial subtask data.
 * @param {Function} onActionSuccess - Callback after a successful action (approve/rework).
 * @param {Function} [onResubmit] - Callback to open the resubmit form.
 */
function SelfDeliverableViewModal({ isOpen, onClose, subtask: initialSubtask, onActionSuccess, onResubmit }) {
  const { t } = useTranslation();
  useEscapeKey(isOpen, onClose);

  const [subtask, setSubtask] = useState(null);
  const [loading, setLoading] = useState(true);
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [reworkDialog, setReworkDialog] = useState(false);
  const [acting, setActing] = useState(false);

  useEffect(() => {
    if (!isOpen || !initialSubtask) return;
    document.body.style.overflow = "hidden";
    setLoading(true);

    const token = authToken();
    fetch(`${API_URL}/deliverables/${initialSubtask.id}`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      skipLoader: true,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        setSubtask(data?.deliverable || initialSubtask);
        setLoading(false);
      })
      .catch(() => {
        setSubtask(initialSubtask);
        setLoading(false);
      });

    return () => { document.body.style.overflow = ""; };
  }, [isOpen, initialSubtask]);

  /** Self-approves the subtask via the API */
  const handleSelfApprove = async () => {
    setActing(true);
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/deliverables/${subtask.id}/self-approve`, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        _notifHandled: true,
      });
      const data = await res.json();
      if (res.ok) {
        showSuccessMessage("Subtask", "approved");
        onActionSuccess(data.deliverable);
        onClose();
      }
    } catch {
      // silently fail
    } finally {
      setActing(false);
    }
  };

  /** Handles successful rework submission by updating and closing the modal */
  const handleReworkSuccess = (updated) => {
    onActionSuccess(updated);
    onClose();
  };

  const deliverable = subtask || initialSubtask;

  /** Builds the memoized history timeline from subtask data */
  const historyTimeline = useMemo(() => buildHistoryTimeline(deliverable, t), [deliverable, t]);

  if (!isOpen || !initialSubtask) return null;

  const status = subtask?.status || initialSubtask.status || "pending";
  const statusLabel = status === "pending" ? t("Draft", { defaultValue: "Draft" }) : status === "rework_required" ? t("Rework Required", { defaultValue: "Rework Required" }) : t(status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, " "));
  const latestSubmission = deliverable?.latest_submission || deliverable?.latestSubmission;
  const isSubmitted = status === "submitted";
  const isReworkRequired = status === "rework_required";
  const isApproved = status === "approved";

  const token = authToken();
  /** Constructs download URL for a specific attachment with optional action param */
  const attachmentUrl = (attId, action) => {
    let url = `${API_URL}/deliverables/attachment/${attId}/download`;
    const params = [];
    if (action) params.push(`action=${action}`);
    if (token) params.push(`token=${token}`);
    if (params.length) url += `?${params.join("&")}`;
    return url;
  };

  return createPortal(
    <div className="sdvm-overlay">
      <div className="sdvm-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="sdvm-header">
          <div className="sdvm-header-top">
            <h2 className="sdvm-title">{deliverable?.title}</h2>
            <span className={`sdvm-status-badge sdvm-status-${status}`}>{statusLabel}</span>
          </div>
          {deliverable?.due_date && (
            <div className="sdvm-due">{t("Due Date & Time", { defaultValue: "Due Date & Time" })} {formatDateTime(deliverable.due_date)}</div>
          )}
        </div>

        <div className="sdvm-body">
          {loading ? (
            <div className="sdvm-loading">{t("Loading details...", { defaultValue: "Loading details..." })}</div>
          ) : (
            <>
              <div className="sdvm-section">
                <h3 className="sdvm-section-title">{t("Subtask Details", { defaultValue: "Subtask Details" })}</h3>
                <div className="sdvm-details-grid">
                  <div className="sdvm-detail-item">
                    <span className="sdvm-detail-label">{t("Task / Project", { defaultValue: "Task / Project" })}</span>
                    <span className="sdvm-detail-value">{deliverable?.task?.title || deliverable?.project?.title || "\u2014"}</span>
                  </div>
                  <div className="sdvm-detail-item">
                    <span className="sdvm-detail-label">{t("Priority", { defaultValue: "Priority" })}</span>
                    <span className="sdvm-detail-value">{deliverable?.priority ? t(deliverable.priority) : t("Medium")}</span>
                  </div>
                </div>
                {deliverable?.description && (
                  <div className="sdvm-description">
                    <span className="sdvm-detail-label">{t("Description", { defaultValue: "Description" })}</span>
                    <div className="rte-display sdvm-description-text" dangerouslySetInnerHTML={{ __html: deliverable.description }} />
                  </div>
                )}
              </div>

              {isReworkRequired && (
                <div className="sdvm-section sdvm-rework-section">
                  <h3 className="sdvm-section-title">{t("Rework Instructions", { defaultValue: "Rework Instructions" })}</h3>
                  {deliverable.rework_comment && (
                    <div className="sdvm-detail-item">
                      <span className="sdvm-detail-label">{t("Rework Notes", { defaultValue: "Rework Notes" })}</span>
                      <p className="sdvm-description-text">{deliverable.rework_comment}</p>
                    </div>
                  )}
                  {deliverable.rework_instructions && (
                    <div className="sdvm-detail-item" style={{ marginTop: "12px" }}>
                      <span className="sdvm-detail-label">{t("Improvement Instructions", { defaultValue: "Improvement Instructions" })}</span>
                      <p className="sdvm-description-text">{deliverable.rework_instructions}</p>
                    </div>
                  )}
                  {deliverable.rework_new_deadline && (
                    <div className="sdvm-detail-item" style={{ marginTop: "12px" }}>
                      <span className="sdvm-detail-label">{t("New Target Date", { defaultValue: "New Target Date" })}</span>
                      <span className="sdvm-detail-value">{formatDateTime(deliverable.rework_new_deadline)}</span>
                    </div>
                  )}
                  {deliverable.rework_file_name && (
                    <div className="sdvm-detail-item" style={{ marginTop: "12px" }}>
                      <span className="sdvm-detail-label">{t("Attached File", { defaultValue: "Attached File" })}</span>
                      <a
                        className="sdvm-file-link"
                        href={fileUrl(deliverable.rework_file_path)}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <FileText size={16} />
                        <span>{deliverable.rework_file_name}</span>
                      </a>
                    </div>
                  )}
                </div>
              )}

              {latestSubmission && (
                <div className="sdvm-section">
                  <h3 className="sdvm-section-title">{t("Submission Details", { defaultValue: "Submission Details" })}</h3>
                  <div className="sdvm-submission">
                    <div className="sdvm-submission-grid">
                      <div className="sdvm-detail-item">
                        <span className="sdvm-detail-label">{t("Submitted By", { defaultValue: "Submitted By" })}</span>
                        <span className="sdvm-detail-value">{latestSubmission.submitted_by?.name || latestSubmission.submittedBy?.name || t("You", { defaultValue: "You" })}</span>
                      </div>
                      <div className="sdvm-detail-item">
                        <span className="sdvm-detail-label">{t("Submission Date", { defaultValue: "Submission Date" })}</span>
                        <span className="sdvm-detail-value">{formatDateTime(latestSubmission.created_at || deliverable?.submitted_at)}</span>
                      </div>
                    </div>
                    {latestSubmission.comment && (
                      <div className="sdvm-detail-item" style={{ marginTop: "12px" }}>
                        <span className="sdvm-detail-label">{t("Notes", { defaultValue: "Notes" })}</span>
                        <p className="sdvm-description-text">{latestSubmission.comment}</p>
                      </div>
                    )}
                    {latestSubmission.file_name && (
                      <div className="sdvm-detail-item" style={{ marginTop: "12px" }}>
                        <span className="sdvm-detail-label">{t("Attached File", { defaultValue: "Attached File" })}</span>
                        <a
                          className="sdvm-file-link"
                          href={fileUrl(latestSubmission.file_path)}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <FileText size={16} />
                          <span>{latestSubmission.file_name}</span>
                        </a>
                      </div>
                    )}
                    {latestSubmission.attachments?.length > 0 && (
                      <div className="sdvm-detail-item" style={{ marginTop: "12px" }}>
                        <span className="sdvm-detail-label">{t("Additional Attachments", { defaultValue: "Additional Attachments" })}</span>
                        {latestSubmission.attachments.map((att) => (
                          att.attachment_type === "link" ? (
                            <a key={att.id} className="sdvm-file-link" href={att.url} target="_blank" rel="noopener noreferrer" style={{ display: "block", marginTop: "4px" }}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                              <span>{att.original_name || att.url}</span>
                            </a>
                          ) : (
                            <a key={att.id} className="sdvm-file-link" href={attachmentUrl(att.id, "download")} target="_blank" rel="noopener noreferrer" style={{ display: "block", marginTop: "4px" }}>
                              <FileText size={14} />
                              <span>{att.original_name || att.file_name || t("Download File", { defaultValue: "Download File" })}</span>
                            </a>
                          )
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {isApproved && deliverable?.approved_at && (
                <div className="sdvm-section sdvm-approved-section">
                  <h3 className="sdvm-section-title">{t("Approval", { defaultValue: "Approval" })}</h3>
                  <div className="sdvm-detail-item">
                    <span className="sdvm-detail-label">{t("Approved On", { defaultValue: "Approved On" })}</span>
                    <span className="sdvm-detail-value">{formatDateTime(deliverable.approved_at)}</span>
                  </div>
                </div>
              )}

              {historyTimeline.length > 0 && (
                <div className="sdvm-section">
                  <h3 className="sdvm-section-title">{t("Timeline History", { defaultValue: "Timeline History" })}</h3>
                  <div className="sdvm-history">
                    {historyTimeline.map((item) => (
                      <div key={item.id} className={`sdvm-history-item sdvm-history-${item.type}`}>
                        <div className="sdvm-history-header">
                          <span className="sdvm-history-label">{item.label}</span>
                          <span className="sdvm-history-date">{formatDateTime(item.date)}</span>
                        </div>
                        <div className="sdvm-history-user">{t("By {{name}}", { defaultValue: `By ${item.user}`, name: item.user })}</div>
                        {item.comment && <p className="sdvm-history-text">{item.comment}</p>}
                        {item.instructions && (
                          <p className="sdvm-history-text"><strong>{t("Instructions", { defaultValue: "Instructions" })}:</strong> {item.instructions}</p>
                        )}
                        {item.new_deadline && (
                            <p className="sdvm-history-text"><strong>{t("Target Date", { defaultValue: "Target Date" })}:</strong> {formatDateTime(item.new_deadline)}</p>
                        )}
                        {item.file_name && (
                          <a className="sdvm-file-link" href={fileUrl(item.file_path)} target="_blank" rel="noopener noreferrer">
                            <FileText size={14} />
                            <span>{item.file_name}</span>
                          </a>
                        )}
                        {item.attachments?.length > 0 && (
                          <div style={{ marginTop: "8px", display: "flex", flexDirection: "column", gap: "4px" }}>
                            {item.attachments.map((att) => (
                              att.attachment_type === "link" ? (
                                <a key={att.id} className="sdvm-file-link" href={att.url} target="_blank" rel="noopener noreferrer">
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                                  <span>{att.original_name || att.url}</span>
                                </a>
                              ) : (
                                <a key={att.id} className="sdvm-file-link" href={attachmentUrl(att.id, "download")} target="_blank" rel="noopener noreferrer">
                                  <FileText size={14} />
                                  <span>{att.original_name || att.file_name || t("Download File", { defaultValue: "Download File" })}</span>
                                </a>
                              )
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!latestSubmission && !isReworkRequired && status === "pending" && (
                <div className="sdvm-empty">
                  <p>{t("No submission yet. Submit your subtask to begin review.", { defaultValue: "No submission yet. Submit your subtask to begin review." })}</p>
                </div>
              )}
            </>
          )}
        </div>

        <div className="sdvm-footer">
          <button className="sdvm-close-btn" onClick={onClose}>{t("Close", { defaultValue: "Close" })}</button>
          {isReworkRequired && onResubmit && (
            <button className="sdvm-resubmit-btn" onClick={() => { onResubmit(deliverable); onClose(); }}>
              {t("Resubmit Subtask", { defaultValue: "Resubmit Subtask" })}
            </button>
          )}
          {isSubmitted && (
            <div className="sdvm-action-btns">
              <button className="sdvm-action-btn sdvm-approve-btn" disabled={acting} onClick={() => setConfirmApprove(true)}>
                {t("Mark as Approved", { defaultValue: "Mark as Approved" })}
              </button>
              <button className="sdvm-action-btn sdvm-rework-btn" disabled={acting} onClick={() => setReworkDialog(true)}>
                {t("Rework Required", { defaultValue: "Rework Required" })}
              </button>
            </div>
          )}
        </div>
      </div>

      <ConfirmationDialog
        isOpen={confirmApprove}
        onClose={() => setConfirmApprove(false)}
        onConfirm={() => {
          setConfirmApprove(false);
          handleSelfApprove();
        }}
        title={t("Mark as Approved", { defaultValue: "Mark as Approved" })}
        message={t("Are you sure you want to mark this subtask as completed and approved?", { defaultValue: "Are you sure you want to mark this subtask as completed and approved?" })}
        confirmText={t("Mark as Approved", { defaultValue: "Mark as Approved" })}
        confirmColor="#16A34A"
      />

      <SelfReworkDialog
        isOpen={reworkDialog}
        onClose={() => setReworkDialog(false)}
        deliverable={deliverable}
        onReworkSuccess={handleReworkSuccess}
      />
    </div>,
    document.body
  );
}

export default SelfDeliverableViewModal;
