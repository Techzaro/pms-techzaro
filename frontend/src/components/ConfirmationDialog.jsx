import { useEffect } from "react";
import { createPortal } from "react-dom";
import "./ConfirmationDialog.css";

function ConfirmationDialog({ isOpen, onClose, onConfirm, title, message, confirmText = "Confirm", confirmColor = "#4F46E5" }) {
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
