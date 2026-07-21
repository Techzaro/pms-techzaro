/**
 * AddNoteModal.jsx
 * Simple popup modal for adding notes to tasks/deliverables.
 */

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useEscapeKey } from "../hooks/useEscapeKey";
import API_URL from "../config/api";
import { authToken } from "../utils/auth";
import "./AddNoteModal.css";

const AddNoteModal = ({ isOpen, onClose, itemType, itemId, onSaved }) => {
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  useEscapeKey(isOpen, onClose);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      setNote("");
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  if (!isOpen) return null;

  const endpoint = itemType === "task"
    ? `${API_URL}/tasks/${itemId}/my-note`
    : `${API_URL}/deliverables/${itemId}/my-note`;

  const handleSave = async () => {
    if (!note.trim()) return;
    setSaving(true);
    const token = authToken();
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ note }),
        _notifHandled: true,
      });
      if (res.ok) {
        onSaved?.();
        onClose();
      }
    } catch {
    }
    setSaving(false);
  };

  return createPortal(
    <div className="anm-overlay" onClick={onClose}>
      <div className="anm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="anm-header">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20h9"/>
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
          </svg>
          <h3>Add Note</h3>
        </div>
        <textarea
          className="anm-textarea"
          placeholder="Write your note here..."
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={4}
          autoFocus
        />
        <div className="anm-actions">
          <button className="anm-cancel" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="anm-save" onClick={handleSave} disabled={saving || !note.trim()}>
            {saving ? "Saving..." : "Save Note"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default AddNoteModal;
