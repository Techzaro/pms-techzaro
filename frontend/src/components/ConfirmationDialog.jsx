/**
 * ConfirmationDialog.jsx
 * Generic confirmation dialog modal with customizable title, message, and confirm button.
 * Used for confirming destructive or important user actions.
 */

import { useEffect } from "react";
import { createPortal } from "react-dom";
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
    <div className="cd-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="cd-modal" role="dialog" aria-modal="true">
        <h3 className="cd-title">{title}</h3>
        <p className="cd-message">{message}</p>
        <div className="cd-actions">
          <button className="cd-cancel-btn" onClick={onClose}>Cancel</button>
          <button className="cd-confirm-btn" style={{ background: confirmColor }} onClick={onConfirm}>{confirmText}</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default ConfirmationDialog;
