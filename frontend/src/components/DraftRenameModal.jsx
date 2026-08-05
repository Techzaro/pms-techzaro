/**
 * DraftRenameModal.jsx
 * Simple modal for renaming a draft title.
 */

import { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { useEscapeKey } from "../hooks/useEscapeKey";
import useUnsavedChanges from "../hooks/useUnsavedChanges";
import { MdClose } from "react-icons/md";
import "./DraftRenameModal.css";

function DraftRenameModal({ draft, onClose, onSave }) {
  const [title, setTitle] = useState(draft?.title || "");

  const initialValues = useMemo(() => ({ title: draft?.title || "" }), [draft?.title]);
  const currentValues = useMemo(() => ({ title }), [title]);
  const { isDirty, handleClose, markSaved, ConfirmDialog } = useUnsavedChanges(initialValues, currentValues, onClose);

  useEscapeKey(true, handleClose);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (title.trim()) {
      markSaved();
      onSave(title.trim());
    }
  };

  return createPortal(
    <>
    <div className="drm-overlay" onClick={handleClose}>
      <div className="drm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="drm-header">
          <h3>Rename Draft</h3>
          <button className="drm-close-btn" onClick={handleClose}>
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
            <button type="button" className="drm-cancel-btn" onClick={handleClose}>
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
    </div>
    {ConfirmDialog}
    </>,
    document.body
  );
}

export default DraftRenameModal;
