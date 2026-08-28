import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import API_URL from "../config/api";
import { authToken } from "../utils/auth";
import { useNotification } from "../context/NotificationContext";
import CustomSelect from "./CustomSelect";
import { X, Edit, Trash2, Paperclip } from "lucide-react";

export default function CreateKnowledgeModal({ isOpen, onClose, onSuccess, initialItem }) {
  const { t } = useTranslation();
  const notify = useNotification();
  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState([]);
  const [file, setFile] = useState(null);
  const [deleteExistingFile, setDeleteExistingFile] = useState(false);
  const [customCategory, setCustomCategory] = useState("");
  const [categories, setCategories] = useState([]);

  const [form, setForm] = useState({
    title: "",
    content: "",
    category: "",
    visibility_level: "organization",
    project_id: "",
  });

  useEffect(() => {
    if (initialItem) {
      setForm({
        title: initialItem.title || "",
        content: initialItem.content || "",
        category: initialItem.category_id ? String(initialItem.category_id) : (initialItem.category || ""),
        visibility_level: initialItem.visibility_level || "organization",
        project_id: initialItem.project_id || "",
      });

      setDeleteExistingFile(false);
      setFile(null);
    }
  }, [initialItem]);

  useEffect(() => {
    const token = authToken();
    if (!token) return;

    fetch(`${API_URL}/kb-categories`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      skipLoader: true,
    })
      .then((r) => r.json())
      .then((d) => {
        const catData = Array.isArray(d?.data) ? d.data : Array.isArray(d) ? d : [];
        setCategories(catData);
      })
      .catch(() => {});

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
    { value: "organization", label: t("Organization (Only for members within my organization)", { defaultValue: "Organization (Only for members within my organization)" }) },
    { value: "department_team", label: t("Department Team (Only for members within my department)", { defaultValue: "Department Team (Only for members within my department)" }) },
    { value: "project_team", label: t("Project Team (Only for members working on a specific project)", { defaultValue: "Project Team (Only for members working on a specific project)" }) },
    { value: "private", label: t("Private (Only for me)", { defaultValue: "Private (Only for me)" }) },
  ];

  const categoryOptions = [
    { value: "", label: t("Select Category...", { defaultValue: "Select Category..." }) },
    ...categories.map((c) => ({ value: String(c.id), label: c.name })),
    { value: "custom", label: t("+ Add Custom / New Category...", { defaultValue: "+ Add Custom / New Category..." }) },
  ];

  const projectOptions = [
    { value: "", label: t("Select Target Project...", { defaultValue: "Select Target Project..." }) },
    ...projects.map((p) => ({ value: String(p.id), label: p.title })),
  ];

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) {
      notify.error(t("Article title is required.", { defaultValue: "Article title is required." }));
      return;
    }

    const finalCategory = form.category === "custom" ? customCategory.trim() : form.category;
    if (!finalCategory) {
      notify.error(t("Please enter a custom category name.", { defaultValue: "Please enter a custom category name." }));
      return;
    }

    if (form.visibility_level === "project_team" && !form.project_id) {
      notify.error(t("Please select a target project for Project Team visibility.", { defaultValue: "Please select a target project for Project Team visibility." }));
      return;
    }

    setLoading(true);
    try {
      const token = authToken();
      const formData = new FormData();
      formData.append("title", form.title.trim());
      formData.append("content", form.content || "");
      formData.append("category", finalCategory);
      formData.append("visibility_level", form.visibility_level);
      if (form.visibility_level === "project_team" && form.project_id) {
        formData.append("project_id", form.project_id);
      }
      if (file) {
        formData.append("file", file);
      }
      if (deleteExistingFile) {
        formData.append("delete_file", "1");
      }

      let res;
      if (initialItem) {
        formData.append("_method", "PUT");
        res = await fetch(`${API_URL}/knowledge-base/${initialItem.id}`, {
          method: "POST",
          headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
          body: formData,
        });
      } else {
        res = await fetch(`${API_URL}/knowledge-base`, {
          method: "POST",
          headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
          body: formData,
        });
      }

      const d = await res.json();
      if (!res.ok) throw new Error(d.message || "Failed to save article.");

      notify.success(initialItem ? t("Knowledge article updated successfully.", { defaultValue: "Knowledge article updated successfully." }) : t("Knowledge article created successfully.", { defaultValue: "Knowledge article created successfully." }));
      if (onSuccess) onSuccess(d);
      onClose();
    } catch (err) {
      notify.error(err.message || t("Error saving article.", { defaultValue: "Error saving article." }));
    } finally {
      setLoading(false);
    }
  };

  const hasAttachedFile = !deleteExistingFile && (file || (initialItem && (initialItem.file_path || initialItem.file_name)));

  return (
    <div className="modal-overlay" style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }}>
      <div className="modal-content" style={{ background: "var(--bg-card)", color: "var(--text-primary)", borderRadius: "12px", width: "100%", maxWidth: "680px", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)" }}>
        {/* HEADER */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid var(--border-color)" }}>
          <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 600 }}>{initialItem ? t("Edit Knowledge Article", { defaultValue: "Edit Knowledge Article" }) : t("Create Knowledge Article", { defaultValue: "Create Knowledge Article" })}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)" }}>
            <X size={20} />
          </button>
        </div>

        {/* BODY */}
        <form onSubmit={handleSubmit} style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Article Title */}
          <div>
            <label style={{ fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "4px" }}>
              {t("Article Title", { defaultValue: "Article Title" })} <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <input
              type="text"
              placeholder={t("e.g. Deployment Guidelines & Code Quality Standards", { defaultValue: "e.g. Deployment Guidelines & Code Quality Standards" })}
              value={form.title}
              onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
              style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid var(--border-color)", background: "var(--bg-card)", color: "var(--text-primary)", fontSize: "13px" }}
              required
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            {/* Category */}
            <div>
              <label style={{ fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "4px" }}>{t("Category")}</label>
              <CustomSelect
                name="category"
                value={form.category}
                onChange={(val) => setForm((p) => ({ ...p, category: val }))}
                options={categoryOptions}
              />
              {form.category === "custom" && (
                <input
                  type="text"
                  placeholder={t("Enter custom category name...", { defaultValue: "Enter custom category name..." })}
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
                {t("Visibility Level", { defaultValue: "Visibility Level" })} <span style={{ color: "#ef4444" }}>*</span>
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
                {t("Target Project", { defaultValue: "Target Project" })} <span style={{ color: "#ef4444" }}>*</span>
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
            <label style={{ fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "4px" }}>{t("Article Content / Documentation", { defaultValue: "Article Content / Documentation" })}</label>
            <textarea
              placeholder={t("Write the full documentation, article body, or instructions here...", { defaultValue: "Write the full documentation, article body, or instructions here..." })}
              value={form.content}
              onChange={(e) => setForm((p) => ({ ...p, content: e.target.value }))}
              rows={8}
              style={{ width: "100%", padding: "10px 12px", borderRadius: "6px", border: "1px solid var(--border-color)", background: "var(--bg-card)", color: "var(--text-primary)", fontSize: "13px", lineHeight: "1.5" }}
            />
          </div>

          {/* Attached File with Edit & Delete Action Icon Buttons */}
          <div>
            <label style={{ fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "6px" }}>
              {t("Attach Document / Resource File (Optional)", { defaultValue: "Attach Document / Resource File (Optional)" })}
            </label>

            {hasAttachedFile ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: "var(--bg-hover)", borderRadius: "8px", border: "1px solid var(--border-color)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "13px" }}>
                  <Paperclip size={16} color="#2563eb" />
                  <span style={{ fontWeight: 600 }}>
                    {file ? file.name : (initialItem.file_name || (initialItem.file_path ? initialItem.file_path.split("/").pop() : ""))}
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
                    title={t("Edit / Replace File", { defaultValue: "Edit / Replace File" })}
                  >
                    <Edit size={14} /> {t("Edit")}
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
                    title={t("Delete File", { defaultValue: "Delete File" })}
                  >
                    <Trash2 size={14} /> {t("Delete")}
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
              {t("Cancel")}
            </button>
            <button type="submit" disabled={loading} style={{ padding: "8px 20px", borderRadius: "6px", border: "none", background: "#2563eb", color: "#ffffff", fontSize: "13px", fontWeight: 600, cursor: loading ? "not-allowed" : "pointer" }}>
              {loading ? t("Saving...", { defaultValue: "Saving..." }) : initialItem ? t("Update Article", { defaultValue: "Update Article" }) : t("Create Article", { defaultValue: "Create Article" })}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
