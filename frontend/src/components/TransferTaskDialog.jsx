/**
 * TransferTaskDialog.jsx
 * Modal dialog for transferring a task to another user.
 * Allows selecting a user, specifying reason, return preference, and optional notes.
 */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import API_URL from "../config/api";
import { authToken, getUser } from "../utils/auth";
import { useEscapeKey } from "../hooks/useEscapeKey";
import useConfirmOnClose from "../hooks/useConfirmOnClose";
import { notify } from "../utils/notify";
import { useSubmit } from "../hooks/useSubmit";
import "./TransferTaskDialog.css";

const TRANSFER_REASONS = [
  "Wrong Assignment",
  "Department Change",
  "Technical Expertise Required",
  "Workload Distribution",
  "Leave / Unavailable",
  "Better Suited For This Person",
  "Manager Directive",
  "Other",
];

function TransferTaskDialog({ isOpen, onClose, task, entityType, onTransferSuccess }) {
  const { t } = useTranslation();
  const { isDirty, setIsDirty, handleClose, ConfirmDialog } = useConfirmOnClose(onClose);
  useEscapeKey(isOpen, handleClose);

  const currentUser = getUser();
  const [reason, setReason] = useState("");
  const [reasonDetail, setReasonDetail] = useState("");
  const [notes, setNotes] = useState("");
  const [delegatedTo, setDelegatedTo] = useState("");
  const [returnToTransferor, setReturnToTransferor] = useState(true);
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const { submitting, run } = useSubmit();

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      setReason("");
      setReasonDetail("");
      setNotes("");
      setDelegatedTo("");
      setReturnToTransferor(true);
      fetchUsers();
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  const fetchUsers = async () => {
    setLoadingUsers(true);
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/team-users`, {
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const allUsers = data.users || data.data || data || [];
        setUsers(allUsers.filter((u) => u.id !== currentUser?.id));
      }
    } catch {
      // silently fail
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleSubmit = async () => {
    if (!delegatedTo) {
      notify.error(t("Please select a user to transfer to.", { defaultValue: "Please select a user to transfer to." }));
      return;
    }
    if (!reason) {
      notify.error(t("Please select a reason for transfer.", { defaultValue: "Please select a reason for transfer." }));
      return;
    }
    if (reason === "Other" && !reasonDetail.trim()) {
      notify.error(t("Please provide details for the 'Other' reason.", { defaultValue: "Please provide details for the 'Other' reason." }));
      return;
    }
    await run(async () => {
      try {
        const token = authToken();
        const body = {
          delegated_to: parseInt(delegatedTo),
          reason,
          reason_detail: reasonDetail.trim() || null,
          notes: notes.trim() || null,
          return_to_transferor: returnToTransferor,
        };

        const isDeliverable = entityType === "deliverable" || (!task.task_number && task.task_id);
        const endpoint = isDeliverable
          ? `${API_URL}/deliverables/${task.id}/delegate`
          : `${API_URL}/tasks/${task.id}/delegate`;

        const res = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(body),
          _notifHandled: true,
        });

        const data = await res.json();
        if (res.ok && data.success) {
          setIsDirty(false);
          onTransferSuccess?.(data.task || data.deliverable, { isTransfer: true });
          onClose();
        } else {
          notify.error(data.message || t("Failed to transfer task", { defaultValue: "Failed to transfer task" }));
        }
      } catch {
        notify.error(t("An error occurred while transferring", { defaultValue: "An error occurred while transferring" }));
      }
    });
  };

  if (!isOpen) return null;

  return createPortal(
    <>
      <div className="tt-overlay" onClick={handleClose}>
        <div className="tt-modal" role="dialog" onClick={(e) => e.stopPropagation()}>
          <div className="tt-header">
            <h2 className="tt-title">
              {entityType === "deliverable" ? t("Transfer Subtask", { defaultValue: "Transfer Subtask" }) : t("Transfer Task", { defaultValue: "Transfer Task" })}
              <button className="tt-title-close" onClick={handleClose}>&times;</button>
            </h2>
          </div>

          <div className="tt-body">
            <div className="tt-field">
              <label className="tt-label">{t("Transfer To", { defaultValue: "Transfer To" })} <span>*</span></label>
              {loadingUsers ? (
                <span className="tt-loading-text">{t("Loading users...", { defaultValue: "Loading users..." })}</span>
              ) : (
                <select
                  className="tt-input"
                  value={delegatedTo}
                  onChange={(e) => { setDelegatedTo(e.target.value); setIsDirty(true); }}
                >
                  <option value="">{t("Select a user...", { defaultValue: "Select a user..." })}</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>{u.name} ({u.role ? t(u.role) : ""})</option>
                  ))}
                </select>
              )}
            </div>

            <div className="tt-field">
              <label className="tt-label">{t("Reason", { defaultValue: "Reason" })} <span>*</span></label>
              <select
                className="tt-input"
                value={reason}
                onChange={(e) => { setReason(e.target.value); setIsDirty(true); }}
              >
                <option value="">{t("Select a reason...", { defaultValue: "Select a reason..." })}</option>
                {TRANSFER_REASONS.map((r) => (
                  <option key={r} value={r}>{t(r)}</option>
                ))}
              </select>
              <div className="tt-reason-tags">
                {TRANSFER_REASONS.map((r) => (
                  <button
                    type="button"
                    key={r}
                    className={`tt-tag-chip ${reason === r ? "tt-tag-chip--selected" : ""}`}
                    onClick={() => { setReason(r); setIsDirty(true); }}
                  >
                    {t(r)}
                  </button>
                ))}
              </div>
            </div>

            {(reason === "Other" || reasonDetail.trim()) && (
              <div className="tt-field">
                <label className="tt-label">
                  {t("Reason Details", { defaultValue: "Reason Details" })} {reason === "Other" && <span>*</span>}
                </label>
                <textarea
                  className="tt-textarea"
                  value={reasonDetail}
                  onChange={(e) => { setReasonDetail(e.target.value); setIsDirty(true); }}
                  placeholder={t("Provide additional details...", { defaultValue: "Provide additional details..." })}
                  rows={3}
                />
              </div>
            )}

            <div className="tt-field">
              <label className="tt-label">{t("After Completion", { defaultValue: "After Completion" })}</label>
              <div className="tt-radio-group">
                <label className="tt-radio">
                  <input
                    type="radio"
                    name="returnPreference"
                    checked={returnToTransferor === true}
                    onChange={() => { setReturnToTransferor(true); setIsDirty(true); }}
                  />
                  <span className="tt-radio-label">
                    <strong>{t("Submit back to me first", { defaultValue: "Submit back to me first" })}</strong>
                    <small>{t("New owner submits to you, then you approve and forward to the original assigner", { defaultValue: "New owner submits to you, then you approve and forward to the original assigner" })}</small>
                  </span>
                </label>
                <label className="tt-radio">
                  <input
                    type="radio"
                    name="returnPreference"
                    checked={returnToTransferor === false}
                    onChange={() => { setReturnToTransferor(false); setIsDirty(true); }}
                  />
                  <span className="tt-radio-label">
                    <strong>{t("Submit directly to original assigner", { defaultValue: "Submit directly to original assigner" })}</strong>
                    <small>{t("New owner submits directly to the person who originally assigned the task", { defaultValue: "New owner submits directly to the person who originally assigned the task" })}</small>
                  </span>
                </label>
              </div>
            </div>

            <div className="tt-field">
              <label className="tt-label">{t("Notes (Optional)", { defaultValue: "Notes (Optional)" })}</label>
              <textarea
                className="tt-textarea"
                value={notes}
                onChange={(e) => { setNotes(e.target.value); setIsDirty(true); }}
                placeholder={t("Any additional notes for the new owner...", { defaultValue: "Any additional notes for the new owner..." })}
                rows={2}
              />
            </div>

            <div className="tt-info">
              <strong>{t("How transfer works:", { defaultValue: "How transfer works:" })}</strong>
              <ul>
                <li>{t("The new owner will be notified and must accept the transfer", { defaultValue: "The new owner will be notified and must accept the transfer" })}</li>
                <li>{entityType === "deliverable" ? t("Once accepted, the subtask ownership transfers to the new owner", { defaultValue: "Once accepted, the subtask ownership transfers to the new owner" }) : t("Once accepted, the task ownership transfers to the new owner", { defaultValue: "Once accepted, the task ownership transfers to the new owner" })}</li>
                <li>{t('Approval route depends on your "After Completion" choice above', { defaultValue: 'Approval route depends on your "After Completion" choice above' })}</li>
                <li>{t("You can revoke the transfer at any time before approval", { defaultValue: "You can revoke the transfer at any time before approval" })}</li>
              </ul>
            </div>
          </div>

          <div className="tt-footer">
            <button className="tt-cancel-btn" onClick={handleClose} disabled={submitting}>{t("Cancel")}</button>
            <button
              className="tt-submit-btn"
              onClick={handleSubmit}
              disabled={submitting || !delegatedTo || !reason}
            >
              {submitting ? t("Transferring...", { defaultValue: "Transferring..." }) : entityType === "deliverable" ? t("Transfer Subtask", { defaultValue: "Transfer Subtask" }) : t("Transfer Task", { defaultValue: "Transfer Task" })}
            </button>
          </div>
        </div>
      </div>
      {ConfirmDialog}
    </>,
    document.body
  );
}

export default TransferTaskDialog;
