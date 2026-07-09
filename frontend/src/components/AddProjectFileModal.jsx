import { useState, useRef } from "react";
import { X, Upload, Link, FileUp, Trash2 } from "lucide-react";
import API_URL from "../config/api";
import { authToken } from "../utils/auth";

export default function AddProjectFileModal({ isOpen, onClose, projectId, onSuccess }) {
  const [files, setFiles] = useState([]);
  const [links, setLinks] = useState([]);
  const [linkInput, setLinkInput] = useState("");
  const [linkTitleInput, setLinkTitleInput] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  if (!isOpen) return null;

  const handleFileSelect = (e) => {
    const selected = Array.from(e.target.files);
    setFiles((prev) => [...prev, ...selected]);
    e.target.value = "";
  };

  const handleRemoveFile = (index) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAddLink = () => {
    if (!linkInput.trim()) return;
    let url = linkInput.trim();
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;
    const name = linkTitleInput.trim() || url;
    setLinks((prev) => [...prev, { url, name }]);
    setLinkInput("");
    setLinkTitleInput("");
  };

  const handleRemoveLink = (index) => {
    setLinks((prev) => prev.filter((_, i) => i !== index));
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
        ...files.map((file) => {
          const fd = new FormData();
          fd.append("file", file);
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
            body: JSON.stringify(link),
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
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: "520px", width: "95%" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <h3 style={{ margin: 0, fontSize: "18px", fontWeight: 700, color: "#111827" }}>Add Files & Links</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: "4px", color: "#6b7280" }}>
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
              {files.map((f, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: "#f3f4f6", borderRadius: "8px", fontSize: "13px" }}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{f.name}</span>
                  <button onClick={() => handleRemoveFile(i)} style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", padding: "2px", marginLeft: "8px" }}>
                    <Trash2 size={14} />
                  </button>
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
                <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: "#f3f4f6", borderRadius: "8px", fontSize: "13px" }}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, color: "#6366f1" }}>{l.name}</span>
                  <button onClick={() => handleRemoveLink(i)} style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", padding: "2px", marginLeft: "8px" }}>
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", paddingTop: "16px", borderTop: "1px solid #e5e7eb" }}>
          <button
            onClick={onClose}
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
  );
}
