import { useEffect, useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { useEscapeKey } from "../hooks/useEscapeKey";
import useUnsavedChanges from "../hooks/useUnsavedChanges";

const PAUSE_REASONS = [
  { value: "waiting_client", label: "Waiting for Client" },
  { value: "waiting_approval", label: "Waiting for Manager Approval" },
  { value: "waiting_dependency", label: "Waiting for Dependency" },
  { value: "technical_issue", label: "Technical Issue" },
  { value: "personal_break", label: "Personal Break" },
  { value: "meeting", label: "Meeting" },
  { value: "internet_issue", label: "Internet or System Issue" },
  { value: "other", label: "Other" },
];

function PauseReasonModal({ isOpen, onClose, onConfirm, isAssigner = false }) {
  const [reason, setReason] = useState("");
  const [reasonDetail, setReasonDetail] = useState("");
  const [processing, setProcessing] = useState(false);

  const initialValues = useMemo(() => ({ reason: '', reasonDetail: '' }), []);
  const currentValues = useMemo(() => ({ reason, reasonDetail }), [reason, reasonDetail]);
  const { isDirty, handleClose, markSaved, ConfirmDialog } = useUnsavedChanges(initialValues, currentValues, onClose);
  useEscapeKey(isOpen, handleClose);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      setReason("");
      setReasonDetail("");
      setProcessing(false);
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    if (!reason || processing) return;
    setProcessing(true);
    try {
      await onConfirm({ reason, reason_detail: reasonDetail || null });
      markSaved();
    } catch {
      setProcessing(false);
    }
  };

  return createPortal(
    <div className="cm-overlay" onClick={handleClose}>
      <div className="cm-modal" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
        <div className="cm-icon" style={{ background: "var(--color-warning-bg, #f59e0b15)" }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--color-warning)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
        </div>
        <h3 id="cm-title">{isAssigner ? "Place on Hold" : "Pause Task"}</h3>
        <p id="cm-message" style={{ marginBottom: "16px" }}>
          {isAssigner ? "Select a reason for placing this task on hold:" : "Select a reason for pausing:"}
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "12px" }}>
          {PAUSE_REASONS.map(r => (
            <label key={r.value} style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", padding: "6px 8px", borderRadius: "6px", background: reason === r.value ? "var(--color-warning-bg, #f59e0b12)" : "transparent", border: `1px solid ${reason === r.value ? "var(--color-warning)" : "var(--border-color)"}`, transition: "all 0.15s" }}>
              <input
                type="radio"
                name="pause-reason"
                value={r.value}
                checked={reason === r.value}
                onChange={() => setReason(r.value)}
                disabled={processing}
                style={{ accentColor: "var(--color-warning)" }}
              />
              <span style={{ fontSize: "13px", color: "var(--text-dark)" }}>{r.label}</span>
            </label>
          ))}
        </div>

        <textarea
          placeholder={reason === "other" ? "Please specify (required)" : "Optional detail (max 500 characters)"}
          value={reasonDetail}
          onChange={e => setReasonDetail(e.target.value.slice(0, 500))}
          disabled={processing || !reason}
          rows={2}
          style={{ width: "100%", padding: "8px 10px", border: `1px solid ${reason === "other" && !reasonDetail.trim() ? "#ef4444" : "#d1d5db"}`, borderRadius: "6px", fontSize: "13px", resize: "vertical", boxSizing: "border-box", opacity: reason ? 1 : 0.5 }}
        />

        <div className="cm-actions">
          <button className="cm-cancel-btn" onClick={handleClose} disabled={processing}>Cancel</button>
          <button
            className="cm-confirm-btn"
            style={{ background: "var(--color-warning)" }}
            onClick={handleConfirm}
            disabled={!reason || processing || (reason === "other" && !reasonDetail.trim())}
          >
            {processing ? "Processing..." : isAssigner ? "Place on Hold" : "Pause"}
          </button>
        </div>
      </div>
      {ConfirmDialog}
    </div>,
    document.body
  );
}

export default PauseReasonModal;
