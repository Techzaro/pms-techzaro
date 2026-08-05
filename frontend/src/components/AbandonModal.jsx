/**
 * AbandonModal.jsx
 * Modal dialog for requesting to abandon a task/subtask, or directly abandoning / declining abandon.
 */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useEscapeKey } from "../hooks/useEscapeKey";
import useConfirmOnClose from "../hooks/useConfirmOnClose";
import LoadingButton from "./LoadingButton";
import "./AbandonModal.css";

function AbandonModal({ isOpen, onClose, title, subtitle, actionLabel, onSubmit, loading }) {
  const { isDirty, setIsDirty, handleClose, ConfirmDialog } = useConfirmOnClose(onClose);
  useEscapeKey(isOpen, handleClose);

  const [reason, setReason] = useState("");

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      setReason("");
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  const handleSubmit = async () => {
    await onSubmit(reason);
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="abm-overlay">
      <div className="abm-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="abm-header">
          <h2 className="abm-title">{title || "Abandon Task"}</h2>
          {subtitle && <p className="abm-subtitle">{subtitle}</p>}
        </div>

        <div className="abm-body">
          <div className="abm-field">
            <label className="abm-label">Reason / Justification</label>
            <textarea
              className="abm-textarea"
              placeholder="Provide a reason for abandoning..."
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                setIsDirty(true);
              }}
              rows={4}
            />
          </div>
        </div>

        <div className="abm-footer">
          <button className="abm-cancel-btn" onClick={handleClose} disabled={loading}>
            Cancel
          </button>
          <LoadingButton className="abm-submit-btn" onClick={handleSubmit} loading={loading}>
            {actionLabel || "Confirm Abandon"}
          </LoadingButton>
        </div>
      </div>
      {ConfirmDialog}
    </div>,
    document.body
  );
}

export default AbandonModal;
