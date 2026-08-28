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
import { useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { FolderOpen, Upload, Link as LinkIcon, X } from "lucide-react";
import SortableTableWrapper, { DragHandle } from "./SortableTableWrapper";
import ConfirmModal from "./ConfirmModal";
import API_URL from "../config/api";
import { authToken } from "../utils/auth";
import { showSuccessMessage, notify } from "../utils/notify";

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
  const { t } = useTranslation();
  const [fileSearch, setFileSearch] = useState("");
  const [editItem, setEditItem] = useState(null);
  const [editName, setEditName] = useState("");
  const [editUrl, setEditUrl] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [linkInput, setLinkInput] = useState("");
  const [linkName, setLinkName] = useState("");
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [addingLink, setAddingLink] = useState(false);
  const fileInputRef = useRef(null);
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
        showSuccessMessage(t("File renamed successfully", { defaultValue: "File renamed successfully" }));
        setEditItem(null);
        if (onFilesChange) onFilesChange();
      } else {
        const data = await res.json().catch(() => ({}));
        notify.error(data.message || t("Failed to rename file", { defaultValue: "Failed to rename file" }));
      }
    } catch {
      notify.error(t("Failed to rename file", { defaultValue: "Failed to rename file" }));
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
        showSuccessMessage(t("File deleted successfully", { defaultValue: "File deleted successfully" }));
        setDeleteConfirmOpen(false);
        setPendingDelete(null);
        if (onFilesChange) onFilesChange();
      } else {
        const data = await res.json().catch(() => ({}));
        notify.error(data.message || t("Failed to delete file", { defaultValue: "Failed to delete file" }));
      }
    } catch {
      notify.error(t("Failed to delete file", { defaultValue: "Failed to delete file" }));
    }
    done?.();
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const token = authToken();
      const formData = new FormData();
      formData.append("file", file);
      formData.append("name", file.name);
      const res = await fetch(`${API_URL}/${baseEndpoint}/${entityId}/files`, {
        method: "POST",
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        if (data.file_skipped) {
          notify.warning(data.message || "File could not be uploaded due to storage limit. Please free up space or contact admin.");
        } else {
          showSuccessMessage("File uploaded successfully");
        }
        if (onFilesChange) onFilesChange();
      } else {
        notify.error(data.message || "Failed to upload file");
      }
    } catch {
      notify.error(t("Failed to upload file", { defaultValue: "Failed to upload file" }));
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleAddLink = async () => {
    if (!linkInput.trim()) return;
    let url = linkInput.trim();
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;
    setAddingLink(true);
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/${baseEndpoint}/${entityId}/links`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ url, name: linkName.trim() || null }),
      });
      if (res.ok) {
        showSuccessMessage(t("Link added successfully", { defaultValue: "Link added successfully" }));
        setLinkInput("");
        setLinkName("");
        setShowLinkForm(false);
        if (onFilesChange) onFilesChange();
      } else {
        const data = await res.json().catch(() => ({}));
        notify.error(data.message || t("Failed to add link", { defaultValue: "Failed to add link" }));
      }
    } catch {
      notify.error(t("Failed to add link", { defaultValue: "Failed to add link" }));
    }
    setAddingLink(false);
  };

  return (
    <div>
      <div className="td-section-header">
        <h2 className="td-section-title">{t("Platform files & links", { defaultValue: "Platform files & links" })}</h2>
        {files.length > 0 && (
          <div className="pd-files-search" style={{ margin: "0 0 0 auto" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
            <input
              type="text"
              placeholder={t("Search files & links...", { defaultValue: "Search files & links..." })}
              value={fileSearch}
              onChange={(e) => setFileSearch(e.target.value)}
            />
          </div>
        )}
      </div>

      {!readOnly && (
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <input type="file" ref={fileInputRef} onChange={handleFileUpload} style={{ display: "none" }} />
          <button
            className="td-btn-outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 14px", fontSize: 13, borderRadius: 8, border: "1px solid var(--border-color, #e2e8f0)", background: "#fff", cursor: uploading ? "not-allowed" : "pointer" }}
          >
            <Upload size={14} />
            {uploading ? t("Uploading...", { defaultValue: "Uploading..." }) : t("Upload File", { defaultValue: "Upload File" })}
          </button>
          <button
            className="td-btn-outline"
            onClick={() => setShowLinkForm(!showLinkForm)}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 14px", fontSize: 13, borderRadius: 8, border: "1px solid var(--border-color, #e2e8f0)", background: "#fff", cursor: "pointer" }}
          >
            <LinkIcon size={14} />
            {t("Add Link", { defaultValue: "Add Link" })}
          </button>
        </div>
      )}

      {showLinkForm && (
        <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
          <input
            type="text"
            placeholder="https://..."
            value={linkInput}
            onChange={(e) => setLinkInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleAddLink(); }}
            style={{ flex: 1, minWidth: 200, padding: "6px 10px", fontSize: 13, borderRadius: 8, border: "1px solid var(--border-color, #e2e8f0)" }}
          />
          <input
            type="text"
            placeholder={t("Link name (optional)", { defaultValue: "Link name (optional)" })}
            value={linkName}
            onChange={(e) => setLinkName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleAddLink(); }}
            style={{ width: 180, padding: "6px 10px", fontSize: 13, borderRadius: 8, border: "1px solid var(--border-color, #e2e8f0)" }}
          />
          <button
            className="td-btn-primary"
            onClick={handleAddLink}
            disabled={addingLink || !linkInput.trim()}
            style={{ padding: "6px 14px", fontSize: 13, borderRadius: 8 }}
          >
            {addingLink ? t("Adding...", { defaultValue: "Adding..." }) : t("Add", { defaultValue: "Add" })}
          </button>
          <button
            onClick={() => { setShowLinkForm(false); setLinkInput(""); setLinkName(""); }}
            style={{ padding: "6px 8px", fontSize: 13, borderRadius: 8, border: "1px solid var(--border-color, #e2e8f0)", background: "#fff", cursor: "pointer" }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {files.length === 0 ? (
        <p className="td-empty">{t("No files attached.", { defaultValue: "No files attached." })}</p>
      ) : filteredFiles.length === 0 ? (
        <p className="td-empty">{t("No files match your search.", { defaultValue: "No files match your search." })}</p>
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
                    {f.url ? (
                      <a href={fileUrl(f.url)} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none", color: "inherit" }}>
                        <span>{f.name}</span>
                      </a>
                    ) : (
                      <span>{f.name}</span>
                    )}
                  </div>
                </div>
                {!readOnly && (
                  <div style={{ display: "flex", gap: 6, marginLeft: "auto", flexShrink: 0 }}>
                    <button
                      className="action-icon-btn"
                      title={t("Rename", { defaultValue: "Rename" })}
                      onClick={() => openEdit(f)}
                      style={{ padding: "4px 6px", fontSize: 12 }}
                    >
                      ✏️
                    </button>
                    <button
                      className="action-icon-btn"
                      title={t("Delete", { defaultValue: "Delete" })}
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
            <h3 className="pd-edit-modal__title">{t("Rename File", { defaultValue: "Rename File" })}</h3>
            <div className="pd-edit-modal__field">
              <label className="pd-edit-modal__label">{t("Name", { defaultValue: "Name" })}</label>
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
                <label className="pd-edit-modal__label">{t("URL", { defaultValue: "URL" })}</label>
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
              <button className="pd-edit-modal__cancel" onClick={() => setEditItem(null)} disabled={editSaving}>{t("Cancel")}</button>
              <button className="pd-edit-modal__save" onClick={handleRename} disabled={editSaving || !editName.trim()}>
                {editSaving ? t("Saving...", { defaultValue: "Saving..." }) : t("Save", { defaultValue: "Save" })}
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
        title={t("Delete File", { defaultValue: "Delete File" })}
        message={t('Are you sure you want to delete "{{name}}"? This action cannot be undone.', { defaultValue: `Are you sure you want to delete "${pendingDelete?.name || ""}"? This action cannot be undone.`, name: pendingDelete?.name || "" })}
        confirmText={t("Delete", { defaultValue: "Delete" })}
        cancelText={t("Cancel")}
        danger
      />
    </div>
  );
}
