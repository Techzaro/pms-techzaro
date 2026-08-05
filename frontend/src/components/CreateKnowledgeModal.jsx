import React, { useState, useEffect } from "react";
import API_URL from "../config/api";
import { authToken } from "../utils/auth";
import { useNotification } from "../context/NotificationContext";
import CustomSelect from "./CustomSelect";
import { X, Edit, Trash2, Paperclip } from "lucide-react";

export default function CreateKnowledgeModal({ isOpen, onClose, onSuccess, initialItem }) {
  const notify = useNotification();
  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState([]);
  const [file, setFile] = useState(null);
  const [deleteExistingFile, setDeleteExistingFile] = useState(false);
  const [customCategory, setCustomCategory] = useState("");

  const [form, setForm] = useState({
    title: "",
    content: "",
    category: "General",
    visibility_level: "organization",
    project_id: "",
  });

  useEffect(() => {
    if (initialItem) {
      const knownCategories = ["General", "Best Practices", "Technical Documentation", "Onboarding", "Guidelines", "Process & SOPs"];
      const isKnown = knownCategories.includes(initialItem.category);

      setForm({
        title: initialItem.title || "",
        content: initialItem.content || "",
        category: isKnown ? (initialItem.category || "General") : "custom",
        visibility_level: initialItem.visibility_level || "organization",
        project_id: initialItem.project_id || "",
      });

      if (!isKnown && initialItem.category) {
        setCustomCategory(initialItem.category);
      }
      setDeleteExistingFile(false);
      setFile(null);
    }
  }, [initialItem]);

  useEffect(() => {
    const token = authToken();
    if (!token) return;

    fetch(`${API_URL}/projects`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      skipLoader: true,
    })
      .then((r) => r.json())
      .then((d) => setProjects(Array.isArray(d) ? d : d.data || []))
      .catch(() => {});
  }, []);

  if (!isOpen) return null;

  const visibilityOptions = [
    { value: "organization", label: "Organization (Only for members within my organization)" },
    { value: "department_team", label: "Department Team (Only for members within my department)" },
    { value: "project_team", label: "Project Team (Only for members working on a specific project)" },
    { value: "private", label: "Private (Only for me)" },
  ];

  const categoryOptions = [
    { value: "General", label: "General" },
    { value: "Best Practices", label: "Best Practices" },
    { value: "Technical Documentation", label: "Technical Documentation" },
    { value: "Onboarding", label: "Onboarding" },
    { value: "Guidelines", label: "Guidelines" },
    { value: "Process & SOPs", label: "Process & SOPs" },
    { value: "custom", label: "+ Add Custom / New Category..." },
  ];

  const projectOptions = [
    { value: "", label: "Select Target Project..." },
    ...projects.map((p) => ({ value: String(p.id), label: p.title })),
  ];

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) {
      notify.error("Article title is required.");
      return;
    }

    const finalCategory = form.category === "custom" ? customCategory.trim() : form.category;
    if (!finalCategory) {
      notify.error("Please enter a custom category name.");
      return;
    }

    if (form.visibility_level === "project_team" && !form.project_id) {
      notify.error("Please select a target project for Project Team visibility.");
      return;
    }

    setLoading(true);
    try {
      const token = authToken();
      const fd = new FormData();
      fd.append("title", form.title.trim());
      fd.append("content", form.content || "");
      fd.append("category", finalCategory);
      fd.append("visibility_level", form.visibility_level);
      if (form.project_id) fd.append("project_id", form.project_id);
      if (deleteExistingFile) fd.append("delete_file", "1");

      if (file) {
        fd.append("file", file);
      }

      const url = initialItem ? `${API_URL}/knowledge-base/${initialItem.id}` : `${API_URL}/knowledge-base`;
      if (initialItem) {
        fd.append("_method", "PUT");
      }

      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
        body: fd,
      });

      const data = await res.json();
      if (res.ok && data.success) {
        notify.success(initialItem ? "Knowledge article updated successfully!" : "Knowledge article created successfully!");
        onSuccess && onSuccess();
        onClose();
      } else {
        notify.error(data.message || "Failed to save article.");
      }
    } catch (err) {
      notify.error("An error occurred while saving knowledge article.");
    } finally {
      setLoading(false);
    }
  };

  const hasAttachedFile = file || (initialItem?.file_path && !deleteExistingFile);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
      <div style={{ background: "var(--bg-card)", borderRadius: "12px", width: "100%", maxWidth: "680px", maxHeight: "90vh", overflowY: "auto", border: "1px solid var(--border-color)", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)" }}>
        {/* HEADER */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid var(--border-color)" }}>
          <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 600 }}>{initialItem ? "Edit Knowledge Article" : "Create Knowledge Article"}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)" }}>
            <X size={20} />
          </button>
        </div>

        {/* BODY */}
        <form onSubmit={handleSubmit} style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Article Title */}
          <div>
            <label style={{ fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "4px" }}>
              Article Title <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Deployment Guidelines & Code Quality Standards"
              value={form.title}
              onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
              style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid var(--border-color)", background: "var(--bg-card)", color: "var(--text-primary)", fontSize: "13px" }}
              required
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            {/* Category */}
            <div>
              <label style={{ fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "4px" }}>Category</label>
              <CustomSelect
                name="category"
                value={form.category}
                onChange={(val) => setForm((p) => ({ ...p, category: val }))}
                options={categoryOptions}
              />
              {form.category === "custom" && (
                <input
                  type="text"
                  placeholder="Enter custom category name..."
                  value={customCategory}
                  onChange={(e) => setCustomCategory(e.target.value)}
                  style={{ width: "100%", marginTop: "6px", padding: "6px 10px", borderRadius: "6px", border: "1px solid var(--border-color)", background: "var(--bg-card)", fontSize: "12px" }}
                  required
                />
              )}
            </div>

            {/* Visibility Level */}
            <div>
              <label style={{ fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                Visibility Level <span style={{ color: "#ef4444" }}>*</span>
              </label>
              <CustomSelect
                name="visibility_level"
                value={form.visibility_level}
                onChange={(val) => setForm((p) => ({ ...p, visibility_level: val }))}
                options={visibilityOptions}
              />
            </div>
          </div>

          {/* DYNAMIC SECONDARY DROPDOWN: Target Project */}
          {form.visibility_level === "project_team" && (
            <div>
              <label style={{ fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                Target Project <span style={{ color: "#ef4444" }}>*</span>
              </label>
              <CustomSelect
                name="project_id"
                value={form.project_id}
                onChange={(val) => setForm((p) => ({ ...p, project_id: val }))}
                options={projectOptions}
              />
            </div>
          )}

          {/* Content / Article Body */}
          <div>
            <label style={{ fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "4px" }}>Article Content / Documentation</label>
            <textarea
              placeholder="Write the full documentation, article body, or instructions here..."
              value={form.content}
              onChange={(e) => setForm((p) => ({ ...p, content: e.target.value }))}
              rows={8}
              style={{ width: "100%", padding: "10px 12px", borderRadius: "6px", border: "1px solid var(--border-color)", background: "var(--bg-card)", color: "var(--text-primary)", fontSize: "13px", lineHeight: "1.5" }}
            />
          </div>

          {/* Attached File with Edit & Delete Action Icon Buttons */}
          <div>
            <label style={{ fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "6px" }}>
              Attach Document / Resource File (Optional)
            </label>

            {hasAttachedFile ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: "var(--bg-hover)", borderRadius: "8px", border: "1px solid var(--border-color)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "13px" }}>
                  <Paperclip size={16} color="#2563eb" />
                  <span style={{ fontWeight: 600 }}>
                    {file ? file.name : (initialItem.file_name || initialItem.file_path.split("/").pop())}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  {/* EDIT ICON BUTTON */}
                  <button
                    type="button"
                    onClick={() => {
                      const input = document.createElement("input");
                      input.type = "file";
                      input.onchange = (e) => {
                        if (e.target.files[0]) setFile(e.target.files[0]);
                      };
                      input.click();
                    }}
                    style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "5px 10px", borderRadius: "6px", border: "1px solid #bfdbfe", background: "#eff6ff", color: "#1d4ed8", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}
                    title="Edit / Replace File"
                  >
                    <Edit size={14} /> Edit
                  </button>

                  {/* DELETE ICON BUTTON */}
                  <button
                    type="button"
                    onClick={() => {
                      setFile(null);
                      if (initialItem?.file_path) {
                        setDeleteExistingFile(true);
                      }
                    }}
                    style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "5px 10px", borderRadius: "6px", border: "1px solid #fecaca", background: "#fef2f2", color: "#dc2626", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}
                    title="Delete File"
                  >
                    <Trash2 size={14} /> Delete
                  </button>
                </div>
              </div>
            ) : (
              <input
                type="file"
                onChange={(e) => {
                  if (e.target.files[0]) setFile(e.target.files[0]);
                }}
                style={{ fontSize: "12px" }}
              />
            )}
          </div>

          {/* FOOTER */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "12px", paddingTop: "12px", borderTop: "1px solid var(--border-color)" }}>
            <button type="button" onClick={onClose} style={{ padding: "8px 16px", borderRadius: "6px", border: "1px solid var(--border-color)", background: "var(--bg-hover)", color: "var(--text-primary)", fontSize: "13px", cursor: "pointer" }}>
              Cancel
            </button>
            <button type="submit" disabled={loading} style={{ padding: "8px 20px", borderRadius: "6px", border: "none", background: "#2563eb", color: "#ffffff", fontSize: "13px", fontWeight: 600, cursor: loading ? "not-allowed" : "pointer" }}>
              {loading ? "Saving..." : initialItem ? "Update Article" : "Create Article"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
