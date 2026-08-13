/**
 * TaskNotesPopover.jsx
 * Note icon next to task name. On hover shows notes popover.
 * Each note has edit button on hover for inline editing.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { StickyNote, Pencil, Trash2, Check, X } from "lucide-react";

  const handleDeleteNote = async (noteId) => {
    if (!window.confirm("Are you sure you want to delete this note?")) return;
    const token = authToken();
    try {
      const res = await fetch(`${endpoint}/${noteId}`, {
        method: "DELETE",
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setNotes(data.notes || []);
      }
    } catch {}
  };
import API_URL from "../config/api";
import { authToken } from "../utils/auth";
import "./TaskNotesPopover.css";

const TaskNotesPopover = ({ taskId, itemType = "task" }) => {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState("");
  const [saving, setSaving] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const wrapRef = useRef(null);
  const popoverRef = useRef(null);
  const timeoutRef = useRef(null);
  const editInputRef = useRef(null);

  const endpoint = itemType === "task"
    ? `${API_URL}/tasks/${taskId}/my-note`
    : `${API_URL}/deliverables/${taskId}/my-note`;

  const fetchNotes = useCallback(async () => {
    setLoading(true);
    const token = authToken();
    try {
      const res = await fetch(endpoint, {
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setNotes(data.notes || []);
      }
    } catch {}
    setLoading(false);
  }, [endpoint]);

  const calcPosition = useCallback(() => {
    if (!wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    const popoverEl = popoverRef.current;
    const popoverWidth = popoverEl ? popoverEl.offsetWidth : 250;
    const popoverHeight = popoverEl ? popoverEl.offsetHeight : 150;

    let top = rect.bottom + 8;
    let left = rect.left;

    if (left + popoverWidth > window.innerWidth) {
      left = window.innerWidth - popoverWidth - 8;
    }
    if (top + popoverHeight > window.innerHeight) {
      top = rect.top - popoverHeight - 8;
    }
    if (top < 0) top = 4;

    setPos({ top, left });
  }, []);

  const handleMouseEnter = () => {
    clearTimeout(timeoutRef.current);
    setOpen(true);
  };

  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(() => {
      if (!editingId) setOpen(false);
    }, 200);
  };

  const handleNoteMouseEnter = () => {
    clearTimeout(timeoutRef.current);
  };

  useEffect(() => {
    return () => clearTimeout(timeoutRef.current);
  }, []);

  useEffect(() => {
    const loadInitial = async () => {
      const token = authToken();
      try {
        const res = await fetch(endpoint, {
          headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setNotes(data.notes || []);
        }
      } catch {}
    };
    loadInitial();
  }, [endpoint]);

  useEffect(() => {
    if (open) {
      fetchNotes();
      requestAnimationFrame(() => calcPosition());
    }
  }, [open, fetchNotes, calcPosition]);

  useEffect(() => {
    if (!open) return;
    const onScroll = () => calcPosition();
    window.addEventListener("scroll", onScroll, true);
    return () => window.removeEventListener("scroll", onScroll, true);
  }, [open, calcPosition]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (
        wrapRef.current && !wrapRef.current.contains(e.target) &&
        popoverRef.current && !popoverRef.current.contains(e.target)
      ) {
        setOpen(false);
        setEditingId(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);

  const handleEditStart = (note) => {
    setEditingId(note.id);
    setEditText(note.note);
  };

  const handleEditCancel = () => {
    setEditingId(null);
    setEditText("");
  };

  const handleEditSave = async (noteId) => {
    if (!editText.trim()) return;
    setSaving(true);
    const token = authToken();
    try {
      const res = await fetch(`${endpoint}/${noteId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ note: editText }),
      });
      if (res.ok) {
        const data = await res.json();
        setNotes(data.notes || []);
        setEditingId(null);
        setEditText("");
      }
    } catch {}
    setSaving(false);
  };

  const hasNotes = notes.length > 0;

  if (!hasNotes) return null;

  return (
    <div
      className="tnp-wrap"
      ref={wrapRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className="tnp-icon tnp-has-notes">
        <StickyNote size={14} />
      </div>
      {open &&
        createPortal(
          <div
            className="tnp-popover"
            ref={popoverRef}
            style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 99999 }}
            onMouseEnter={handleNoteMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            <div className="tnp-popover-header">
              <StickyNote size={14} />
              <span>Notes ({notes.length})</span>
            </div>
            <div className="tnp-popover-body">
              {loading ? (
                <div className="tnp-loading">Loading...</div>
              ) : notes.length === 0 ? (
                <div className="tnp-empty">No notes yet</div>
              ) : (
                notes.map((n) => (
                  <div key={n.id} className="tnp-note">
                    {editingId === n.id ? (
                      <div className="tnp-note-edit">
                        <textarea
                          ref={editInputRef}
                          className="tnp-edit-input"
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          rows={2}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault();
                              handleEditSave(n.id);
                            }
                            if (e.key === "Escape") handleEditCancel();
                          }}
                        />
                        <div className="tnp-edit-actions">
                          <button className="tnp-edit-btn tnp-edit-save" onClick={() => handleEditSave(n.id)} disabled={saving}>
                            <Check size={12} />
                          </button>
                          <button className="tnp-edit-btn tnp-edit-cancel" onClick={handleEditCancel}>
                            <X size={12} />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="tnp-note-text">{n.note}</p>
                        <div style={{ display: "flex", alignItems: "center", gap: "4px", marginLeft: "auto" }}>
                          <button className="tnp-edit-icon" title="Edit note" onClick={() => handleEditStart(n)}>
                            <Pencil size={12} />
                          </button>
                          <button className="tnp-edit-icon" title="Delete note" onClick={() => handleDeleteNote(n.id)} style={{ color: "#ef4444" }}>
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};

export default TaskNotesPopover;
