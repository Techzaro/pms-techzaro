/**
 * ConfirmationDialog.jsx
 * Generic confirmation dialog modal with customizable title, message, and confirm button.
 * Used for confirming destructive or important user actions.
 */

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useEscapeKey } from "../hooks/useEscapeKey";
import "./ConfirmationDialog.css";

/**
 * A reusable confirmation dialog with cancel and confirm buttons.
 * @param {boolean} isOpen - Whether the dialog is visible
 * @param {Function} onClose - Callback to close the dialog without confirming
 * @param {Function} onConfirm - Callback when the user clicks Confirm
 * @param {string} title - Dialog title text
 * @param {string} message - Dialog body message
 * @param {string} [confirmText="Confirm"] - Text for the confirm button
 * @param {string} [confirmColor="#4F46E5"] - Background color for the confirm button
 */
function ConfirmationDialog({ isOpen, onClose, onConfirm, title, message, confirmText = "Confirm", confirmColor = "#4F46E5" }) {
  const { t } = useTranslation();
  useEscapeKey(isOpen, onClose);

  // Toggle body scroll lock when dialog opens/closes
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  if (!isOpen) return null;

  return createPortal(
    <div className="cd-overlay">
      <div className="cd-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h3 className="cd-title">{t(title)}</h3>
        <p className="cd-message">{t(message)}</p>
        <div className="cd-actions">
          <button className="cd-cancel-btn" onClick={onClose}>{t("Cancel")}</button>
          <button className="cd-confirm-btn" style={{ background: confirmColor }} onClick={onConfirm}>{t(confirmText)}</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default ConfirmationDialog;
