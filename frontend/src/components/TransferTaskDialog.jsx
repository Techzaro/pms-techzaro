/**
 * TransferTaskDialog.jsx
 * Modal dialog for transferring a task to another user.
 * Allows selecting a user, specifying reason, return preference, and optional notes.
 */

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import API_URL from "../config/api";
import { authToken, getUser } from "../utils/auth";
import { useEscapeKey } from "../hooks/useEscapeKey";
import useUnsavedChanges from "../hooks/useUnsavedChanges";
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
  const initialValues = useMemo(() => ({
    delegatedTo: '',
    reason: '',
    reasonDetail: '',
    returnToTransferor: true,
    notes: '',
  }), []);

  const [reason, setReason] = useState("");
  const [reasonDetail, setReasonDetail] = useState("");
  const [notes, setNotes] = useState("");
  const [delegatedTo, setDelegatedTo] = useState("");
  const [returnToTransferor, setReturnToTransferor] = useState(true);
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  const currentValues = useMemo(() => ({
    delegatedTo,
    reason,
    reasonDetail,
    returnToTransferor,
    notes,
  }), [delegatedTo, reason, reasonDetail, returnToTransferor, notes]);

  const { isDirty, handleClose, markSaved, resetBaseline, ConfirmDialog } = useUnsavedChanges(initialValues, currentValues, onClose);
  useEscapeKey(isOpen, handleClose);

  const currentUser = getUser();
  const { submitting, run } = useSubmit();

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      resetBaseline(initialValues);
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
      notify.error("Please select a user to transfer to.");
      return;
    }
    if (!reason) {
      notify.error("Please select a reason for transfer.");
      return;
    }
    if (reason === "Other" && !reasonDetail.trim()) {
      notify.error("Please provide details for the 'Other' reason.");
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
          markSaved();
          onTransferSuccess?.(data.task || data.deliverable, { isTransfer: true });
          onClose();
        } else {
          notify.error(data.message || "Failed to transfer task");
        }
      } catch {
        notify.error("An error occurred while transferring");
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
              {entityType === "deliverable" ? "Transfer Subtask" : "Transfer Task"}
              <button className="tt-title-close" onClick={handleClose}>&times;</button>
            </h2>
          </div>

          <div className="tt-body">
            <div className="tt-field">
              <label className="tt-label">Transfer To <span>*</span></label>
              {loadingUsers ? (
                <span className="tt-loading-text">Loading users...</span>
              ) : (
                <select
                  className="tt-input"
                  value={delegatedTo}
                  onChange={(e) => { setDelegatedTo(e.target.value); }}
                >
                  <option value="">Select a user...</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
                  ))}
                </select>
              )}
            </div>

            <div className="tt-field">
              <label className="tt-label">Reason <span>*</span></label>
              <select
                className="tt-input"
                value={reason}
                onChange={(e) => { setReason(e.target.value); }}
              >
                <option value="">Select a reason...</option>
                {TRANSFER_REASONS.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>

            {(reason === "Other" || reasonDetail.trim()) && (
              <div className="tt-field">
                <label className="tt-label">
                  Reason Details {reason === "Other" && <span>*</span>}
                </label>
                <textarea
                  className="tt-textarea"
                  value={reasonDetail}
                  onChange={(e) => { setReasonDetail(e.target.value); }}
                  placeholder="Provide additional details..."
                  rows={3}
                />
              </div>
            )}

            <div className="tt-field">
              <label className="tt-label">After Completion</label>
              <div className="tt-radio-group">
                <label className="tt-radio">
                  <input
                    type="radio"
                    name="returnPreference"
                    checked={returnToTransferor === true}
                    onChange={() => { setReturnToTransferor(true); }}
                  />
                  <span className="tt-radio-label">
                    <strong>Submit back to me first</strong>
                    <small>New owner submits to you, then you approve and forward to the original assigner</small>
                  </span>
                </label>
                <label className="tt-radio">
                  <input
                    type="radio"
                    name="returnPreference"
                    checked={returnToTransferor === false}
                    onChange={() => { setReturnToTransferor(false); }}
                  />
                  <span className="tt-radio-label">
                    <strong>Submit directly to original assigner</strong>
                    <small>New owner submits directly to the person who originally assigned the task</small>
                  </span>
                </label>
              </div>
            </div>

            <div className="tt-field">
              <label className="tt-label">Notes (Optional)</label>
              <textarea
                className="tt-textarea"
                value={notes}
                onChange={(e) => { setNotes(e.target.value); }}
                placeholder="Any additional notes for the new owner..."
                rows={2}
              />
            </div>

            <div className="tt-info">
              <strong>How transfer works:</strong>
              <ul>
                <li>The new owner will be notified and must accept the transfer</li>
                <li>Once accepted, the {entityType === "deliverable" ? "subtask" : "task"} ownership transfers to the new owner</li>
                <li>Approval route depends on your "After Completion" choice above</li>
                <li>You can revoke the transfer at any time before approval</li>
              </ul>
            </div>
          </div>

          <div className="tt-footer">
            <button className="tt-cancel-btn" onClick={handleClose} disabled={submitting}>Cancel</button>
            <button
              className="tt-submit-btn"
              onClick={handleSubmit}
              disabled={submitting || !delegatedTo || !reason}
            >
              {submitting ? "Transferring..." : entityType === "deliverable" ? "Transfer Subtask" : "Transfer Task"}
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
