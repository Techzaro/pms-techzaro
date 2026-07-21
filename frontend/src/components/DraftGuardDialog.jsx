/**
 * DraftGuardDialog.jsx
 * Three-button confirmation dialog for unsaved changes with draft support.
 * Options: Save as Draft / Discard Changes / Continue Editing
 */

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useEscapeKey } from "../hooks/useEscapeKey";
import "./DraftGuardDialog.css";

function DraftGuardDialog({ isOpen, onClose, onSaveDraft, onDiscard }) {
  useEscapeKey(isOpen, onClose);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return createPortal(
    <div className="dgd-overlay" onClick={onClose}>
      <div
        className="dgd-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dgd-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dgd-icon">
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#f59e0b"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <h3 id="dgd-title">Unsaved Changes</h3>
        <p id="dgd-message">
          You have unsaved changes. What would you like to do?
        </p>
        <div className="dgd-actions">
          <button className="dgd-continue-btn" onClick={onClose}>
            Continue Editing
          </button>
          <div className="dgd-primary-actions">
            <button className="dgd-discard-btn" onClick={onDiscard}>
              Discard Changes
            </button>
            <button className="dgd-save-draft-btn" onClick={onSaveDraft}>
              Save as Draft
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default DraftGuardDialog;
