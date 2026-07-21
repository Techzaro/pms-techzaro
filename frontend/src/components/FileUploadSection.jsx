/**
 * FileUploadSection.jsx — Shared file upload & management component
 * Works with both Tasks and Deliverables (Subtasks).
 *
 * Props:
 *   entityType  - "task" | "deliverable"
 *   entityId    - ID of the parent entity
 *   files       - Array of file objects
 *   onReorder   - Callback when files are reordered
 *   onFilesChange - Callback when files are added/removed/renamed
 *   readOnly    - Boolean
 */
import { useState } from "react";
import { FolderOpen } from "lucide-react";
import SortableTableWrapper, { DragHandle } from "./SortableTableWrapper";
import ConfirmModal from "./ConfirmModal";
import API_URL from "../config/api";
import { authToken } from "../utils/auth";
import { showSuccessMessage } from "../utils/notify";

const API_BASE = API_URL.replace(/\/api\/?$/, "");

function fileUrl(url) {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  return API_BASE + url;
}

const boxColors = [
  "#eef2ff", "#f0fdf4", "#fefce8", "#fef2f2",
  "#f5f3ff", "#ecfeff", "#fff7ed", "#fce7f3",
];

export default function FileUploadSection({ entityType, entityId, files, onReorder, onFilesChange, readOnly }) {
  const [fileSearch, setFileSearch] = useState("");
  const [editItem, setEditItem] = useState(null);
  const [editName, setEditName] = useState("");
  const [editUrl, setEditUrl] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);

  const baseEndpoint = entityType === "task" ? "tasks" : "deliverables";

  const filteredFiles = files.filter((f) => {
    if (!fileSearch) return true;
    const q = fileSearch.toLowerCase();
    return (f.name || "").toLowerCase().includes(q) || (f.url || "").toLowerCase().includes(q);
  });

  const openEdit = (item) => {
    setEditItem(item);
    setEditName(item.name || "");
    setEditUrl(item.url || "");
  };

  const handleRename = async () => {
    if (!editItem || !editName.trim()) return;
    setEditSaving(true);
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/${baseEndpoint}/${entityId}/files/${editItem.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: editName.trim(), url: editUrl.trim() || null }),
      });
      if (res.ok) {
        showSuccessMessage("File renamed successfully");
        setEditItem(null);
        if (onFilesChange) onFilesChange();
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.message || "Failed to rename file");
      }
    } catch {
      alert("Failed to rename file");
    }
    setEditSaving(false);
  };

  const openDelete = (item) => {
    setPendingDelete(item);
    setDeleteConfirmOpen(true);
  };

  const handleDelete = async (done) => {
    if (!pendingDelete) { done?.(); return; }
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/${baseEndpoint}/${entityId}/files/${pendingDelete.id}`, {
        method: "DELETE",
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        showSuccessMessage("File deleted successfully");
        setDeleteConfirmOpen(false);
        setPendingDelete(null);
        if (onFilesChange) onFilesChange();
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.message || "Failed to delete file");
      }
    } catch {
      alert("Failed to delete file");
    }
    done?.();
  };

  return (
    <div>
      <div className="td-section-header">
        <h2 className="td-section-title">Platform files & links</h2>
        {files.length > 0 && (
          <div className="pd-files-search" style={{ margin: "0 0 0 auto" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
            <input
              type="text"
              placeholder="Search files & links..."
              value={fileSearch}
              onChange={(e) => setFileSearch(e.target.value)}
            />
          </div>
        )}
      </div>
      {files.length === 0 ? (
        <p className="td-empty">No files attached.</p>
      ) : filteredFiles.length === 0 ? (
        <p className="td-empty">No files match your search.</p>
      ) : (
        <SortableTableWrapper
          items={filteredFiles}
          onReorder={onReorder}
          as="div"
        >
          {(f, idx, dndProps) => {
            const bg = boxColors[idx % boxColors.length];
            return (
              <div key={f.id} className="pd-file-box" style={{ background: bg }}>
                <div className="pd-file-box__drag-handle">
                  <DragHandle listeners={dndProps?.listeners} attributes={dndProps?.attributes} />
                </div>
                <div className="pd-file-box__content">
                  <div className="pd-file-box__name">
                    <FolderOpen size={18} />
                    <span>{f.name}</span>
                  </div>
                  {f.url && (
                    <a
                      href={fileUrl(f.url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="pd-file-box__link"
                      style={{ color: "#6366f1" }}
                    >
                      {f.url}
                    </a>
                  )}
                </div>
                {!readOnly && (
                  <div style={{ display: "flex", gap: 6, marginLeft: "auto", flexShrink: 0 }}>
                    <button
                      className="action-icon-btn"
                      title="Rename"
                      onClick={() => openEdit(f)}
                      style={{ padding: "4px 6px", fontSize: 12 }}
                    >
                      ✏️
                    </button>
                    <button
                      className="action-icon-btn"
                      title="Delete"
                      onClick={() => openDelete(f)}
                      style={{ padding: "4px 6px", fontSize: 12 }}
                    >
                      🗑️
                    </button>
                  </div>
                )}
              </div>
            );
          }}
        </SortableTableWrapper>
      )}

      {/* Edit/Rename Popup */}
      {editItem && (
        <div className="pd-edit-overlay" onClick={() => setEditItem(null)}>
          <div className="pd-edit-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="pd-edit-modal__title">Rename File</h3>
            <div className="pd-edit-modal__field">
              <label className="pd-edit-modal__label">Name</label>
              <input
                className="pd-edit-modal__input"
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                autoFocus
                onKeyDown={(e) => { if (e.key === "Enter") handleRename(); }}
              />
            </div>
            {editItem.url && (
              <div className="pd-edit-modal__field">
                <label className="pd-edit-modal__label">URL</label>
                <input
                  className="pd-edit-modal__input"
                  type="text"
                  value={editUrl}
                  onChange={(e) => setEditUrl(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleRename(); }}
                />
              </div>
            )}
            <div className="pd-edit-modal__actions">
              <button className="pd-edit-modal__cancel" onClick={() => setEditItem(null)} disabled={editSaving}>Cancel</button>
              <button className="pd-edit-modal__save" onClick={handleRename} disabled={editSaving || !editName.trim()}>
                {editSaving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      <ConfirmModal
        isOpen={deleteConfirmOpen}
        onClose={() => { setDeleteConfirmOpen(false); setPendingDelete(null); }}
        onConfirm={handleDelete}
        title="Delete File"
        message={`Are you sure you want to delete "${pendingDelete?.name || ""}"? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        danger
      />
    </div>
  );
}
