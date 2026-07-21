/**
 * DraftRenameModal.jsx
 * Simple modal for renaming a draft title.
 */

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useEscapeKey } from "../hooks/useEscapeKey";
import { MdClose } from "react-icons/md";
import "./DraftRenameModal.css";

function DraftRenameModal({ draft, onClose, onSave }) {
  useEscapeKey(true, onClose);
  const [title, setTitle] = useState(draft?.title || "");

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (title.trim()) {
      onSave(title.trim());
    }
  };

  return createPortal(
    <div className="drm-overlay" onClick={onClose}>
      <div className="drm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="drm-header">
          <h3>Rename Draft</h3>
          <button className="drm-close-btn" onClick={onClose}>
            <MdClose size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="drm-body">
            <label className="drm-label">Draft Title</label>
            <input
              type="text"
              className="drm-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter draft title..."
              autoFocus
            />
            <span className="drm-code">{draft?.draft_code}</span>
          </div>
          <div className="drm-footer">
            <button type="button" className="drm-cancel-btn" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="drm-save-btn"
              disabled={!title.trim() || title.trim() === draft?.title}
            >
              Rename
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

export default DraftRenameModal;
