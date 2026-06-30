/**
 * ConfirmModal.jsx
 * Generic confirmation modal with an info icon, customizable colors, and danger mode.
 * Similar to ConfirmationDialog but with an icon and more styling options.
 */

import { useEffect } from "react";
import { createPortal } from "react-dom";
import "./ConfirmModal.css";

/**
 * A reusable confirmation modal with an info icon and customizable appearance.
 * @param {boolean} isOpen - Whether the modal is visible
 * @param {Function} onClose - Callback to close the modal
 * @param {Function} onConfirm - Callback when the user confirms
 * @param {string} title - Modal title text
 * @param {string} message - Modal body message
 * @param {string} [confirmText="Confirm"] - Text for the confirm button
 * @param {string} [cancelText="Cancel"] - Text for the cancel button
 * @param {string} [confirmColor] - Custom confirm button color (overrides danger default)
 * @param {boolean} [danger=false] - If true, uses red color scheme for destructive actions
 */
function ConfirmModal({ isOpen, onClose, onConfirm, title, message, confirmText = "Confirm", cancelText = "Cancel", confirmColor, danger = false }) {
  // Resolve the confirm button color: explicit color > danger red > default blue
  const resolvedColor = confirmColor || (danger ? "#ef4444" : "#3b82f6");

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
    <div className="cm-overlay">
      <div className="cm-modal" role="dialog" aria-modal="true" aria-labelledby="cm-title" aria-describedby="cm-message">
        <div className="cm-icon" style={{ background: resolvedColor + "15" }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={resolvedColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
        </div>
        <h3 id="cm-title">{title}</h3>
        <p id="cm-message">{message}</p>
        <div className="cm-actions">
          <button className="cm-cancel-btn" onClick={onClose}>{cancelText}</button>
          <button className={`cm-confirm-btn ${danger ? "cm-confirm-btn--danger" : ""}`} style={{ background: resolvedColor }} onClick={onConfirm}>{confirmText}</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default ConfirmModal;
