/**
 * ConfirmModal.jsx
 * Generic confirmation modal with an info icon, customizable colors, and danger mode.
 * Includes built-in double-click prevention: onConfirm is disabled while processing.
 */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useEscapeKey } from "../hooks/useEscapeKey";
import "./ConfirmModal.css";

/**
 * A reusable confirmation modal with an info icon and customizable appearance.
 * @param {boolean} isOpen - Whether the modal is visible
 * @param {Function} onClose - Callback to close the modal
 * @param {Function} onConfirm - Callback when the user confirms (receives a done() callback to reset state)
 * @param {string} title - Modal title text
 * @param {string} message - Modal body message
 * @param {string} [confirmText="Confirm"] - Text for the confirm button
 * @param {string} [cancelText="Cancel"] - Text for the cancel button
 * @param {string} [confirmColor] - Custom confirm button color (overrides danger default)
 * @param {boolean} [danger=false] - If true, uses red color scheme for destructive actions
 */
function ConfirmModal({
  isOpen,
  onClose,
  onCancel,
  onConfirm,
  title,
  message,
  confirmText,
  confirmLabel,
  cancelText,
  cancelLabel,
  confirmColor,
  danger = false,
  isDestructive = false,
  isLoading = false,
}) {
  const { t } = useTranslation();
  const handleCloseCallback = onClose || onCancel || (() => {});
  useEscapeKey(isOpen, handleCloseCallback);

  const isDanger = danger || isDestructive;
  const resolvedColor = confirmColor || (isDanger ? "#ef4444" : "#3b82f6");
  const [processing, setProcessing] = useState(false);

  const resolvedConfirmText = confirmText || confirmLabel || "Confirm";
  const resolvedCancelText = cancelText || cancelLabel || "Cancel";
  const isCurrentlyProcessing = processing || isLoading;

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      setProcessing(false);
    } else {
      document.body.style.overflow = "";
      setProcessing(false);
    }
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    if (isCurrentlyProcessing || !onConfirm) return;
    setProcessing(true);
    try {
      if (onConfirm.length > 0) {
        await new Promise((resolve) => {
          onConfirm(() => { setProcessing(false); resolve(); });
        });
      } else {
        await onConfirm();
      }
    } catch {
      setProcessing(false);
    }
  };

  const handleClose = () => {
    if (isCurrentlyProcessing) return;
    handleCloseCallback();
  };

  return createPortal(
    <div className="cm-overlay">
      <div className="cm-modal" role="dialog" aria-modal="true" aria-labelledby="cm-title" aria-describedby="cm-message" onClick={(e) => e.stopPropagation()}>
        <div className="cm-icon" style={{ background: resolvedColor + "15" }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={resolvedColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
        </div>
        <h3 id="cm-title">{t(title)}</h3>
        <p id="cm-message">{t(message)}</p>
        <div className="cm-actions">
          <button className="cm-cancel-btn" onClick={handleClose} disabled={isCurrentlyProcessing}>{t(resolvedCancelText)}</button>
          <button
            className={`cm-confirm-btn ${isDanger ? "cm-confirm-btn--danger" : ""} ${isCurrentlyProcessing ? "cm-confirm-btn--processing" : ""}`}
            style={{ background: resolvedColor }}
            onClick={handleConfirm}
            disabled={isCurrentlyProcessing}
          >
            {isCurrentlyProcessing ? t("Processing...") : t(resolvedConfirmText)}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default ConfirmModal;
