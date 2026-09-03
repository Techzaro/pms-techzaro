import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { StickyNote, Plus, Trash2, Clock, Check, Save } from "lucide-react";
import API_URL from "../config/api";
import { authToken } from "../utils/auth";

export default function TaskPersonalNotes({ taskId, initialNotes = [] }) {
  const { t } = useTranslation();
  const [notes, setNotes] = useState(initialNotes);
  const [newNote, setNewNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    if (initialNotes && initialNotes.length > 0) {
      setNotes(initialNotes);
    } else if (taskId) {
      fetchNotes();
    }
  }, [taskId, initialNotes]);

  const fetchNotes = async () => {
    setLoading(true);
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/tasks/${taskId}/personal-notes`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      });
      if (res.ok) {
        const data = await res.json();
        setNotes(data.notes || []);
      }
    } catch (err) {
      console.error("Failed to load personal notes", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e) => {
    e?.preventDefault();
    if (!newNote.trim() || saving) return;
    setSaving(true);
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/tasks/${taskId}/personal-notes`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ note: newNote.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        setNotes(data.notes || []);
        setNewNote("");
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      }
    } catch (err) {
      console.error("Failed to save note", err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (noteId) => {
    if (!window.confirm(t("Are you sure you want to delete this personal note?", { defaultValue: "Are you sure you want to delete this personal note?" }))) return;
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/tasks/${taskId}/personal-notes/${noteId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      });
      if (res.ok) {
        setNotes((prev) => prev.filter((n) => n.id !== noteId));
      }
    } catch (err) {
      console.error("Failed to delete note", err);
    }
  };

  return (
    <div className="td-overview" style={{ padding: "20px" }}>
      <div className="td-section-header" style={{ marginBottom: "16px" }}>
        <h2 className="td-section-title" style={{ display: "flex", alignItems: "center", gap: "8px", margin: 0 }}>
          <StickyNote size={18} />
          {t("Personal Notes", { defaultValue: "Personal Notes" })}
          <span className="td-section-count">({notes.length})</span>
        </h2>
        <span style={{ fontSize: "12px", color: "var(--text-muted, #6b7280)" }}>
          {t("Private to you — invisible to assigners and team members.", { defaultValue: "Private to you — invisible to assigners and team members." })}
        </span>
      </div>

      {/* Note Creator Form */}
      <form onSubmit={handleSave} style={{ marginBottom: "24px" }}>
        <div style={{ background: "var(--bg-card, #ffffff)", border: "1px solid var(--border-color, #e5e7eb)", borderRadius: "8px", padding: "12px" }}>
          <textarea
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            placeholder={t("Write a private note or reminder for yourself about this task...", { defaultValue: "Write a private note or reminder for yourself about this task..." })}
            rows={3}
            style={{
              width: "100%",
              border: "none",
              outline: "none",
              resize: "vertical",
              fontSize: "13px",
              fontFamily: "inherit",
              background: "transparent",
              color: "var(--text-primary, #111827)",
            }}
          />
          <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: "10px", marginTop: "8px", borderTop: "1px solid var(--border-color, #f3f4f6)", paddingTop: "8px" }}>
            {saveSuccess && (
              <span style={{ fontSize: "12px", color: "#16a34a", display: "flex", alignItems: "center", gap: "4px" }}>
                <Check size={14} /> {t("Saved!", { defaultValue: "Saved!" })}
              </span>
            )}
            <button
              type="submit"
              disabled={saving || !newNote.trim()}
              className="td-btn-primary"
              style={{
                fontSize: "12px",
                padding: "6px 14px",
                opacity: saving || !newNote.trim() ? 0.6 : 1,
                cursor: saving || !newNote.trim() ? "not-allowed" : "pointer",
              }}
            >
              <Save size={13} />
              {saving ? t("Saving...", { defaultValue: "Saving..." }) : t("Save Note", { defaultValue: "Save Note" })}
            </button>
          </div>
        </div>
      </form>

      {/* Notes List */}
      {loading ? (
        <p className="td-muted">{t("Loading personal notes...", { defaultValue: "Loading personal notes..." })}</p>
      ) : notes.length === 0 ? (
        <div style={{ padding: "32px 16px", textAlign: "center", background: "var(--bg-card-alt, #f9fafb)", borderRadius: "8px", border: "1px dashed var(--border-color, #e5e7eb)" }}>
          <StickyNote size={32} style={{ color: "#9ca3af", marginBottom: "8px" }} />
          <p style={{ margin: 0, color: "var(--text-muted, #6b7280)", fontSize: "14px" }}>
            {t("No personal notes yet. Add one above to keep private scratchpad notes for this task.", { defaultValue: "No personal notes yet. Add one above to keep private scratchpad notes for this task." })}
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {notes.map((n) => (
            <div
              key={n.id}
              style={{
                background: "#FEF9C3",
                border: "1px solid #FDE047",
                borderRadius: "8px",
                padding: "14px",
                color: "#713F12",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "10px", marginBottom: "6px" }}>
                <span style={{ fontSize: "11px", color: "#854D0E", display: "flex", alignItems: "center", gap: "4px" }}>
                  <Clock size={12} />
                  {new Date(n.created_at).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
                </span>
                <button
                  onClick={() => handleDelete(n.id)}
                  title={t("Delete Note", { defaultValue: "Delete Note" })}
                  style={{ background: "none", border: "none", color: "#A16207", cursor: "pointer", padding: "2px" }}
                >
                  <Trash2 size={13} />
                </button>
              </div>
              <div style={{ fontSize: "13px", lineHeight: "1.5", whiteSpace: "pre-wrap" }}>
                {n.note}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
