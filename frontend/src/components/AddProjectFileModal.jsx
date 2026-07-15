import { useState, useRef } from "react";
import { X, Upload, Link, FileUp } from "lucide-react";
import API_URL from "../config/api";
import { authToken } from "../utils/auth";
import ConfirmModal from "./ConfirmModal";
import useConfirmOnClose from "../hooks/useConfirmOnClose";
import { useEscapeKey } from "../hooks/useEscapeKey";

export default function AddProjectFileModal({ isOpen, onClose, projectId, onSuccess }) {
  const { isDirty, setIsDirty, handleClose, ConfirmDialog } = useConfirmOnClose(onClose);
  useEscapeKey(isOpen, handleClose);
  const [files, setFiles] = useState([]);
  const [links, setLinks] = useState([]);
  const [linkInput, setLinkInput] = useState("");
  const [linkTitleInput, setLinkTitleInput] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);
  const [pendingRemoveItem, setPendingRemoveItem] = useState({ type: "", index: -1 });

  if (!isOpen) return null;

  const handleFileSelect = (e) => {
    const selected = Array.from(e.target.files);
    setFiles((prev) => [...prev, ...selected.map((f) => ({ file: f, customName: f.name.replace(/\.[^.]+$/, ""), renaming: false }))]);
    setIsDirty(true);
    e.target.value = "";
  };

  const handleRemoveFile = (index) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setIsDirty(true);
  };

  const handleAddLink = () => {
    if (!linkInput.trim()) return;
    let url = linkInput.trim();
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;
    const name = linkTitleInput.trim() || url;
    setLinks((prev) => [...prev, { url, name, renaming: false }]);
    setLinkInput("");
    setLinkTitleInput("");
    setIsDirty(true);
  };

  const handleRemoveLink = (index) => {
    setLinks((prev) => prev.filter((_, i) => i !== index));
    setIsDirty(true);
  };

  const handleLinkKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddLink();
    }
  };

  const handleSubmit = async () => {
    if (files.length === 0 && links.length === 0) return;
    setUploading(true);
    try {
      const token = authToken();
      await Promise.all([
        ...files.map((item) => {
          const fd = new FormData();
          fd.append("file", item.file);
          fd.append("name", item.customName || item.file.name);
          return fetch(`${API_URL}/projects/${projectId}/files`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
            body: fd,
            _notifHandled: true,
          }).catch(() => {});
        }),
        ...links.map((link) => {
          return fetch(`${API_URL}/projects/${projectId}/links`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ url: link.url, name: link.customName || link.name }),
            _notifHandled: true,
          }).catch(() => {});
        }),
      ]);
      setFiles([]);
      setLinks([]);
      setLinkInput("");
      setLinkTitleInput("");
      onSuccess?.();
      onClose();
    } catch {
    } finally {
      setUploading(false);
    }
  };

  const canSubmit = files.length > 0 || links.length > 0;

  return (
    <>
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-box" style={{ maxWidth: "520px", width: "95%" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <h3 style={{ margin: 0, fontSize: "18px", fontWeight: 700, color: "#111827" }}>Add Files & Links</h3>
          <button onClick={handleClose} style={{ background: "none", border: "none", cursor: "pointer", padding: "4px", color: "#6b7280" }}>
            <X size={20} />
          </button>
        </div>

        {/* File Upload Section */}
        <div style={{ marginBottom: "20px" }}>
          <label style={{ display: "block", fontSize: "14px", fontWeight: 600, color: "#374151", marginBottom: "8px" }}>
            <Upload size={14} style={{ verticalAlign: "middle", marginRight: "6px" }} />
            Upload Files
          </label>
          <div
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: "2px dashed #d1d5db", borderRadius: "10px", padding: "24px", textAlign: "center",
              cursor: "pointer", transition: "border-color 0.2s", background: "#f9fafb",
            }}
            onMouseEnter={(e) => e.currentTarget.style.borderColor = "#6366f1"}
            onMouseLeave={(e) => e.currentTarget.style.borderColor = "#d1d5db"}
          >
            <FileUp size={28} style={{ color: "#9ca3af", marginBottom: "8px" }} />
            <p style={{ margin: 0, fontSize: "13px", color: "#6b7280" }}>Click to browse files</p>
          </div>
          <input ref={fileInputRef} type="file" multiple style={{ display: "none" }} onChange={handleFileSelect} />

          {files.length > 0 && (
            <div style={{ marginTop: "10px", display: "flex", flexDirection: "column", gap: "6px" }}>
              {files.map((item, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: "#f3f4f6", borderRadius: "8px", fontSize: "13px" }}>
                  {item.renaming ? (
                    <>
                      <input
                        autoFocus
                        type="text"
                        value={item.customName || ""}
                        onChange={(e) => {
                          setFiles((p) => {
                            const updated = [...p];
                            updated[i] = { ...updated[i], customName: e.target.value };
                            return updated;
                          });
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            setFiles((p) => {
                              const updated = [...p];
                              updated[i] = { ...updated[i], renaming: false };
                              return updated;
                            });
                          }
                        }}
                        style={{ flex: 1, border: "1px solid #93c5fd", borderRadius: 4, padding: "2px 6px", fontSize: 13, outline: "none" }}
                      />
                      <button type="button" onClick={() => {
                        setFiles((p) => {
                          const updated = [...p];
                          updated[i] = { ...updated[i], renaming: false };
                          return updated;
                        });
                      }} style={{ background: "#16a34a", border: "none", color: "#fff", cursor: "pointer", fontSize: 14, fontWeight: 700, borderRadius: 4, width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }} title="Save name">&#10003;</button>
                    </>
                  ) : (
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{item.customName || item.file.name}</span>
                  )}
                  {!item.renaming && (
                    <div style={{ display: "flex", gap: 10, flexShrink: 0, marginLeft: 8, alignItems: "center" }}>
                      <button type="button" onClick={() => {
                        setFiles((p) => {
                          const updated = [...p];
                          updated[i] = { ...updated[i], renaming: true, customName: item.customName || item.file.name.replace(/\.[^.]+$/, "") };
                          return updated;
                        });
                      }} style={{ background: "none", border: "none", color: "#2563eb", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>Rename</button>
                      <button type="button" onClick={() => { setPendingRemoveItem({ type: "file", index: i }); setRemoveConfirmOpen(true); }} style={{ background: "none", border: "none", color: "#dc2626", cursor: "pointer", fontSize: 16, fontWeight: 700, lineHeight: 1 }} title="Remove">&#10005;</button>
                    </div>
                  )}
                  {item.renaming && (
                    <button type="button" onClick={() => { setPendingRemoveItem({ type: "file", index: i }); setRemoveConfirmOpen(true); }} style={{ background: "none", border: "none", color: "#dc2626", cursor: "pointer", fontSize: 16, fontWeight: 700, lineHeight: 1, flexShrink: 0, marginLeft: 6 }} title="Remove">&#10005;</button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Link Input Section */}
        <div style={{ marginBottom: "20px" }}>
          <label style={{ display: "block", fontSize: "14px", fontWeight: 600, color: "#374151", marginBottom: "8px" }}>
            <Link size={14} style={{ verticalAlign: "middle", marginRight: "6px" }} />
            Add Links
          </label>
          <input
            type="text"
            placeholder="Link title (optional)"
            value={linkTitleInput}
            onChange={(e) => setLinkTitleInput(e.target.value)}
            style={{
              width: "100%", padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: "8px",
              fontSize: "13px", marginBottom: "8px", boxSizing: "border-box",
            }}
          />
          <div style={{ display: "flex", gap: "8px" }}>
            <input
              type="text"
              placeholder="https://example.com"
              value={linkInput}
              onChange={(e) => setLinkInput(e.target.value)}
              onKeyDown={handleLinkKeyDown}
              style={{
                flex: 1, padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: "8px", fontSize: "13px",
              }}
            />
            <button
              onClick={handleAddLink}
              disabled={!linkInput.trim()}
              style={{
                padding: "10px 16px", borderRadius: "8px", border: "none", fontWeight: 600, fontSize: "13px",
                cursor: linkInput.trim() ? "pointer" : "not-allowed",
                background: linkInput.trim() ? "#6366f1" : "#e5e7eb",
                color: linkInput.trim() ? "#fff" : "#9ca3af",
              }}
            >
              Add
            </button>
          </div>

          {links.length > 0 && (
            <div style={{ marginTop: "10px", display: "flex", flexDirection: "column", gap: "6px" }}>
              {links.map((l, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 6, padding: "6px 10px", fontSize: 13 }}>
                  <span style={{ color: "#6366f1", marginRight: 6, flexShrink: 0 }}>&#x1f517;</span>
                  {l.renaming ? (
                    <>
                      <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
                        <input
                          autoFocus
                          type="text"
                          value={l.customName || ""}
                          onChange={(e) => {
                            setLinks((p) => {
                              const updated = [...p];
                              updated[i] = { ...updated[i], customName: e.target.value };
                              return updated;
                            });
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              setLinks((p) => {
                                const updated = [...p];
                                updated[i] = { ...updated[i], renaming: false };
                                return updated;
                              });
                            }
                          }}
                          style={{ flex: 1, border: "1px solid #93c5fd", borderRadius: 4, padding: "2px 6px", fontSize: 13, outline: "none" }}
                        />
                        <a href={l.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: "12px", color: "#6366f1", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 2 }}>
                          {l.url.length > 45 ? l.url.substring(0, 45) + "..." : l.url}
                        </a>
                      </div>
                      <button type="button" onClick={() => {
                        setLinks((p) => {
                          const updated = [...p];
                          updated[i] = { ...updated[i], renaming: false };
                          return updated;
                        });
                      }} style={{ background: "#16a34a", border: "none", color: "#fff", cursor: "pointer", fontSize: 14, fontWeight: 700, borderRadius: 4, width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginLeft: 6 }} title="Save name">&#10003;</button>
                    </>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
                      <span style={{ fontWeight: 600, fontSize: "13px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.customName || l.name}</span>
                      <a href={l.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: "12px", color: "#6366f1", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {l.url.length > 45 ? l.url.substring(0, 45) + "..." : l.url}
                      </a>
                    </div>
                  )}
                  {!l.renaming && (
                    <div style={{ display: "flex", gap: 10, flexShrink: 0, marginLeft: 8, alignItems: "center" }}>
                      <button type="button" onClick={() => {
                        setLinks((p) => {
                          const updated = [...p];
                          updated[i] = { ...updated[i], renaming: true, customName: l.customName || l.name };
                          return updated;
                        });
                      }} style={{ background: "none", border: "none", color: "#2563eb", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>Rename</button>
                      <button type="button" onClick={() => { setPendingRemoveItem({ type: "link", index: i }); setRemoveConfirmOpen(true); }} style={{ background: "none", border: "none", color: "#dc2626", cursor: "pointer", fontSize: 16, fontWeight: 700, lineHeight: 1 }} title="Remove">&#10005;</button>
                    </div>
                  )}
                  {l.renaming && (
                    <button type="button" onClick={() => { setPendingRemoveItem({ type: "link", index: i }); setRemoveConfirmOpen(true); }} style={{ background: "none", border: "none", color: "#dc2626", cursor: "pointer", fontSize: 16, fontWeight: 700, lineHeight: 1, flexShrink: 0, marginLeft: 6 }} title="Remove">&#10005;</button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", paddingTop: "16px", borderTop: "1px solid #e5e7eb" }}>
          <button
            onClick={handleClose}
            style={{
              padding: "10px 20px", borderRadius: "8px", border: "1px solid #d1d5db", background: "#fff",
              fontWeight: 600, fontSize: "13px", cursor: "pointer", color: "#374151",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || uploading}
            style={{
              padding: "10px 20px", borderRadius: "8px", border: "none", fontWeight: 600, fontSize: "13px",
              cursor: canSubmit && !uploading ? "pointer" : "not-allowed",
              background: canSubmit && !uploading ? "#6366f1" : "#e5e7eb",
              color: canSubmit && !uploading ? "#fff" : "#9ca3af",
            }}
          >
            {uploading ? "Uploading..." : "Save"}
          </button>
        </div>
      </div>
    </div>
    <ConfirmModal
      isOpen={removeConfirmOpen}
      onClose={() => { setRemoveConfirmOpen(false); setPendingRemoveItem({ type: "", index: -1 }); }}
      onConfirm={() => {
        if (pendingRemoveItem.type === "file") handleRemoveFile(pendingRemoveItem.index);
        else if (pendingRemoveItem.type === "link") handleRemoveLink(pendingRemoveItem.index);
        setRemoveConfirmOpen(false);
        setPendingRemoveItem({ type: "", index: -1 });
      }}
      title="Remove Item"
      message="Are you sure you want to remove this item?"
      confirmText="Remove"
      cancelText="Cancel"
      danger
    />
    {ConfirmDialog}
    </>
  );
}
