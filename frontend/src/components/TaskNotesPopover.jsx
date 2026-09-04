/**
 * TaskNotesPopover.jsx
 * Personal Notes column badge & popover.
 * Shows personal/private notes for the authenticated user on hover/click.
 * Supports viewing, inline adding, editing, and deleting notes.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { StickyNote, Pencil, Trash2, Check, X, Plus, Send } from "lucide-react";
import API_URL from "../config/api";
import { authToken } from "../utils/auth";
import "./TaskNotesPopover.css";

const TaskNotesPopover = ({ taskId, itemType = "task" }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState("");
  const [newNoteText, setNewNoteText] = useState("");
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const wrapRef = useRef(null);
  const popoverRef = useRef(null);
  const timeoutRef = useRef(null);
  const editInputRef = useRef(null);
  const newNoteInputRef = useRef(null);

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
        setNotes(data.notes || (data.note ? [data.note] : []));
      }
    } catch {}
    setLoading(false);
  }, [endpoint]);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  const handleDeleteNote = async (e, noteId) => {
    if (e && e.stopPropagation) {
      e.stopPropagation();
      e.preventDefault();
    }
    const token = authToken();
    setNotes((prev) => prev.filter((n) => n.id !== noteId));
    try {
      const res = await fetch(`${endpoint}/${noteId}`, {
        method: "DELETE",
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data && data.notes) {
          setNotes(data.notes);
        }
      } else {
        fetchNotes();
      }
    } catch {
      fetchNotes();
    }
  };

  const handleAddNote = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (e && e.stopPropagation) e.stopPropagation();
    if (!newNoteText.trim() || adding) return;

    setAdding(true);
    const token = authToken();
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ note: newNoteText.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.notes) {
          setNotes(data.notes);
        } else if (data.note) {
          setNotes((prev) => [data.note, ...prev.filter((n) => n.id !== data.note.id)]);
        } else {
          fetchNotes();
        }
        setNewNoteText("");
      }
    } catch {
      fetchNotes();
    }
    setAdding(false);
  };

  const calcPosition = useCallback(() => {
    if (!wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    const popoverEl = popoverRef.current;
    const popoverWidth = popoverEl ? popoverEl.offsetWidth : 280;
    const popoverHeight = popoverEl ? popoverEl.offsetHeight : 220;

    let top = rect.bottom + 6;
    let left = rect.left;

    if (left + popoverWidth > window.innerWidth - 12) {
      left = window.innerWidth - popoverWidth - 12;
    }
    if (left < 12) left = 12;

    if (top + popoverHeight > window.innerHeight - 12) {
      top = rect.top - popoverHeight - 6;
    }
    if (top < 12) top = 12;

    setPos({ top, left });
  }, []);

  const handleMouseEnter = () => {
    clearTimeout(timeoutRef.current);
    setOpen(true);
  };

  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(() => {
      if (!editingId && !newNoteText.trim()) setOpen(false);
    }, 250);
  };

  const handlePopoverMouseEnter = () => {
    clearTimeout(timeoutRef.current);
  };

  useEffect(() => {
    return () => clearTimeout(timeoutRef.current);
  }, []);

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => calcPosition());
    }
  }, [open, calcPosition, notes.length]);

  useEffect(() => {
    if (!open) return;
    const onScroll = () => calcPosition();
    const onResize = () => calcPosition();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
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
        body: JSON.stringify({ note: editText.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.notes) {
          setNotes(data.notes);
        } else {
          setNotes((prev) =>
            prev.map((n) => (n.id === noteId ? { ...n, note: editText.trim() } : n))
          );
        }
        setEditingId(null);
        setEditText("");
      }
    } catch {}
    setSaving(false);
  };

  const hasNotes = notes && notes.length > 0;
  const firstNoteSnippet = hasNotes && notes[0]?.note ? notes[0].note.trim() : "";

  return (
    <div
      className="tnp-wrap"
      ref={wrapRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={(e) => {
        e.stopPropagation();
        setOpen((prev) => !prev);
      }}
    >
      {hasNotes ? (
        <div className="tnp-pill tnp-pill-active" title={firstNoteSnippet}>
          <StickyNote size={13} className="tnp-pill-icon" />
          <span className="tnp-pill-text">
            {firstNoteSnippet.length > 18 ? `${firstNoteSnippet.slice(0, 18)}...` : firstNoteSnippet}
          </span>
          {notes.length > 1 && (
            <span className="tnp-pill-count">+{notes.length - 1}</span>
          )}
        </div>
      ) : (
        <div className="tnp-pill tnp-pill-empty" title={t("Add private note", { defaultValue: "Add private note" })}>
          <StickyNote size={13} className="tnp-pill-icon" />
          <span className="tnp-pill-text">{t("Add Note", { defaultValue: "Add Note" })}</span>
        </div>
      )}

      {open &&
        createPortal(
          <div
            className="tnp-popover"
            ref={popoverRef}
            style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 99999 }}
            onMouseEnter={handlePopoverMouseEnter}
            onMouseLeave={handleMouseLeave}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="tnp-popover-header">
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <StickyNote size={14} style={{ color: "#F59E0B" }} />
                <span style={{ fontWeight: 600 }}>{t("Personal Notes", { defaultValue: "Personal Notes" })}</span>
                {hasNotes && <span className="tnp-header-badge">{notes.length}</span>}
              </div>
              <button
                type="button"
                className="tnp-close-btn"
                onClick={() => setOpen(false)}
                title={t("Close", { defaultValue: "Close" })}
              >
                <X size={13} />
              </button>
            </div>

            <div className="tnp-popover-body">
              {loading && notes.length === 0 ? (
                <div className="tnp-loading">{t("Loading notes...", { defaultValue: "Loading notes..." })}</div>
              ) : notes.length === 0 ? (
                <div className="tnp-empty">
                  <StickyNote size={20} style={{ opacity: 0.4, marginBottom: 4 }} />
                  <div>{t("No personal notes yet", { defaultValue: "No personal notes yet" })}</div>
                  <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>
                    {t("Private to you only", { defaultValue: "Private to you only" })}
                  </div>
                </div>
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
                          <button
                            type="button"
                            className="tnp-edit-btn tnp-edit-save"
                            onClick={() => handleEditSave(n.id)}
                            disabled={saving || !editText.trim()}
                            title={t("Save note", { defaultValue: "Save note" })}
                          >
                            <Check size={12} />
                          </button>
                          <button
                            type="button"
                            className="tnp-edit-btn tnp-edit-cancel"
                            onClick={handleEditCancel}
                            title={t("Cancel", { defaultValue: "Cancel" })}
                          >
                            <X size={12} />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="tnp-note-content">
                          <p className="tnp-note-text">{n.note}</p>
                          {n.created_at && (
                            <span className="tnp-note-time">
                              {new Date(n.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                            </span>
                          )}
                        </div>
                        <div className="tnp-note-actions">
                          <button
                            type="button"
                            className="tnp-action-btn"
                            title={t("Edit note", { defaultValue: "Edit note" })}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEditStart(n);
                            }}
                          >
                            <Pencil size={11} />
                          </button>
                          <button
                            type="button"
                            className="tnp-action-btn tnp-delete-btn"
                            title={t("Delete note", { defaultValue: "Delete note" })}
                            onClick={(e) => handleDeleteNote(e, n.id)}
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Quick Add Note Footer */}
            <div className="tnp-popover-footer">
              <form onSubmit={handleAddNote} className="tnp-add-form">
                <input
                  ref={newNoteInputRef}
                  type="text"
                  className="tnp-add-input"
                  placeholder={t("Add a private note...", { defaultValue: "Add a private note..." })}
                  value={newNoteText}
                  onChange={(e) => setNewNoteText(e.target.value)}
                  disabled={adding}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleAddNote(e);
                    }
                  }}
                />
                <button
                  type="submit"
                  className="tnp-add-btn"
                  disabled={adding || !newNoteText.trim()}
                  title={t("Add note", { defaultValue: "Add note" })}
                >
                  <Send size={12} />
                </button>
              </form>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};

export default TaskNotesPopover;
