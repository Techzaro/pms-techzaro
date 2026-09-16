/**
 * DeclineModal.jsx
 * Modal dialog for declining a task or subtask with a mandatory comment/reason.
 */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useEscapeKey } from "../hooks/useEscapeKey";
import useConfirmOnClose from "../hooks/useConfirmOnClose";
import LoadingButton from "./LoadingButton";
import "./DeclineModal.css";

function DeclineModal({
  isOpen,
  onClose,
  title,
  subtitle,
  actionLabel,
  onSubmit,
  loading,
  placeholder,
}) {
  const { t } = useTranslation();
  const { isDirty, setIsDirty, handleClose, ConfirmDialog } = useConfirmOnClose(onClose);
  useEscapeKey(isOpen, handleClose);

  const [comment, setComment] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      setComment("");
      setError("");
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  const handleSubmit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    const trimmed = comment.trim();
    if (!trimmed) {
      setError(t("Please provide a reason for declining.", { defaultValue: "Please provide a reason for declining." }));
      return;
    }
    setError("");
    await onSubmit(trimmed);
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="dcl-overlay" onClick={handleClose}>
      <div className="dcl-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="dcl-header">
          <h2 className="dcl-title">{title || t("Decline Task", { defaultValue: "Decline Task" })}</h2>
          {subtitle && <p className="dcl-subtitle">{subtitle}</p>}
        </div>

        <form onSubmit={handleSubmit}>
          <div className="dcl-body">
            <div className="dcl-field">
              <label className="dcl-label">
                {t("Decline Reason / Comment", { defaultValue: "Decline Reason / Comment" })}
                <span className="dcl-required">*</span>
              </label>
              <textarea
                className={`dcl-textarea ${error ? "dcl-textarea--error" : ""}`}
                placeholder={placeholder || t("Please enter a reason for declining this task...", { defaultValue: "Please enter a reason for declining this task..." })}
                value={comment}
                onChange={(e) => {
                  setComment(e.target.value);
                  setIsDirty(true);
                  if (error) setError("");
                }}
                maxLength={2000}
                rows={4}
                autoFocus
              />
              <div className="dcl-field-footer">
                {error ? (
                  <span className="dcl-error-text">{error}</span>
                ) : (
                  <span />
                )}
                <span className="dcl-char-count">{comment.length}/2000</span>
              </div>
            </div>
          </div>

          <div className="dcl-footer">
            <button type="button" className="dcl-cancel-btn" onClick={handleClose} disabled={loading}>
              {t("Cancel")}
            </button>
            <LoadingButton type="submit" className="dcl-submit-btn" loading={loading}>
              {actionLabel || t("Decline", { defaultValue: "Decline" })}
            </LoadingButton>
          </div>
        </form>
      </div>
      {ConfirmDialog}
    </div>,
    document.body
  );
}

export default DeclineModal;
