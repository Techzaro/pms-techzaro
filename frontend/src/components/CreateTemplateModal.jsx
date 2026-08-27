import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import API_URL from "../config/api";
import { authToken } from "../utils/auth";
import { useNotification } from "../context/NotificationContext";
import CustomSelect from "./CustomSelect";
import { X, Plus, Trash2, Edit, Paperclip, FileText } from "lucide-react";

export default function CreateTemplateModal({ isOpen, onClose, onSuccess, initialTemplate }) {
  const { t } = useTranslation();
  const notify = useNotification();
  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState([]);
  const [file, setFile] = useState(null);
  const [deleteExistingFile, setDeleteExistingFile] = useState(false);
  const [customCategory, setCustomCategory] = useState("");

  const [form, setForm] = useState({
    title: "",
    description: "",
    category: "General",
    visibility_level: "private",
    project_id: "",
  });

  const [subtasks, setSubtasks] = useState([{ title: "" }]);
  const [requirements, setRequirements] = useState([]);
  const [newReq, setNewReq] = useState("");

  useEffect(() => {
    if (initialTemplate) {
      const isKnownCategory = ["General", "Development", "Design", "QA & Testing", "Operations", "Marketing"].includes(initialTemplate.category);
      setForm({
        title: initialTemplate.title || "",
        description: initialTemplate.description || "",
        category: isKnownCategory ? (initialTemplate.category || "General") : "custom",
        visibility_level: initialTemplate.visibility_level || "private",
        project_id: initialTemplate.project_id || "",
      });
      if (!isKnownCategory && initialTemplate.category) {
        setCustomCategory(initialTemplate.category);
      }
      if (initialTemplate.data?.subtasks) {
        setSubtasks(initialTemplate.data.subtasks.map((s) => ({ title: typeof s === "string" ? s : s.title })));
      }
      if (initialTemplate.data?.requirements) {
        setRequirements(initialTemplate.data.requirements);
      }
      setDeleteExistingFile(false);
      setFile(null);
    }
  }, [initialTemplate]);

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
    { value: "private", label: t("Private (Only for me)", { defaultValue: "Private (Only for me)" }) },
    { value: "project_team", label: t("Project Team (Only for members working on assigned project)", { defaultValue: "Project Team (Only for members working on assigned project)" }) },
    { value: "department_team", label: t("Department Team (Only for members within my department)", { defaultValue: "Department Team (Only for members within my department)" }) },
    { value: "organization", label: t("Organization (Only for members within my organization)", { defaultValue: "Organization (Only for members within my organization)" }) },
  ];

  const categoryOptions = [
    { value: "General", label: t("General") },
    { value: "Development", label: t("Development", { defaultValue: "Development" }) },
    { value: "Design", label: t("Design", { defaultValue: "Design" }) },
    { value: "QA & Testing", label: t("QA & Testing", { defaultValue: "QA & Testing" }) },
    { value: "Operations", label: t("Operations", { defaultValue: "Operations" }) },
    { value: "Marketing", label: t("Marketing", { defaultValue: "Marketing" }) },
    { value: "custom", label: t("+ Add Custom / New Category...", { defaultValue: "+ Add Custom / New Category..." }) },
  ];

  const projectOptions = [
    { value: "", label: t("Select Target Project...", { defaultValue: "Select Target Project..." }) },
    ...projects.map((p) => ({ value: String(p.id), label: p.title })),
  ];

  const handleAddSubtask = () => setSubtasks((prev) => [...prev, { title: "" }]);
  const handleRemoveSubtask = (idx) => setSubtasks((prev) => prev.filter((_, i) => i !== idx));
  const handleSubtaskChange = (idx, val) => setSubtasks((prev) => prev.map((s, i) => i === idx ? { title: val } : s));

  const handleAddReq = () => {
    if (!newReq.trim()) return;
    setRequirements((prev) => [...prev, newReq.trim()]);
    setNewReq("");
  };
  const handleRemoveReq = (idx) => setRequirements((prev) => prev.filter((_, i) => i !== idx));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) {
      notify.error(t("Template title is required.", { defaultValue: "Template title is required." }));
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
      const payloadData = {
        subtasks: subtasks.filter((s) => s.title.trim()).map((s) => ({ title: s.title.trim() })),
        requirements: requirements.filter(Boolean),
      };

      const formData = new FormData();
      formData.append("title", form.title.trim());
      formData.append("description", form.description || "");
      formData.append("category", finalCategory);
      formData.append("visibility_level", form.visibility_level);
      if (form.visibility_level === "project_team" && form.project_id) {
        formData.append("project_id", form.project_id);
      }
      formData.append("data", JSON.stringify(payloadData));

      if (file) {
        formData.append("file", file);
      }
      if (deleteExistingFile) {
        formData.append("delete_file", "1");
      }

      let res;
      if (initialTemplate) {
        formData.append("_method", "PUT");
        res = await fetch(`${API_URL}/templates/${initialTemplate.id}`, {
          method: "POST",
          headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
          body: formData,
        });
      } else {
        res = await fetch(`${API_URL}/templates`, {
          method: "POST",
          headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
          body: formData,
        });
      }

      const d = await res.json();
      if (!res.ok) throw new Error(d.message || "Failed to save template.");

      notify.success(initialTemplate ? t("Template updated successfully.", { defaultValue: "Template updated successfully." }) : t("Template created successfully.", { defaultValue: "Template created successfully." }));
      if (onSuccess) onSuccess(d);
      onClose();
    } catch (err) {
      notify.error(err.message || t("Error saving template.", { defaultValue: "Error saving template." }));
    } finally {
      setLoading(false);
    }
  };

  const hasAttachedFile = !deleteExistingFile && (file || (initialTemplate && (initialTemplate.file_path || initialTemplate.file_name)));

  return (
    <div className="modal-overlay" style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }}>
      <div className="modal-content" style={{ background: "var(--bg-card)", color: "var(--text-primary)", borderRadius: "12px", width: "100%", maxWidth: "680px", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)" }}>
        {/* HEADER */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid var(--border-color)" }}>
          <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 600 }}>{initialTemplate ? t("Edit Task Template", { defaultValue: "Edit Task Template" }) : t("Create Task Template", { defaultValue: "Create Task Template" })}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)" }}>
            <X size={20} />
          </button>
        </div>

        {/* BODY */}
        <form onSubmit={handleSubmit} style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Title */}
          <div>
            <label style={{ fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "4px" }}>
              {t("Template Title", { defaultValue: "Template Title" })} <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <input
              type="text"
              placeholder={t("e.g. Standard Web Development Workflow", { defaultValue: "e.g. Standard Web Development Workflow" })}
              value={form.title}
              onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
              style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid var(--border-color)", background: "var(--bg-card)", color: "var(--text-primary)", fontSize: "13px" }}
              required
            />
          </div>

          {/* Description */}
          <div>
            <label style={{ fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "4px" }}>{t("Description")}</label>
            <textarea
              placeholder={t("Brief summary of what this template contains...", { defaultValue: "Brief summary of what this template contains..." })}
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              rows={3}
              style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid var(--border-color)", background: "var(--bg-card)", color: "var(--text-primary)", fontSize: "13px" }}
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

            {/* Template Visibility */}
            <div>
              <label style={{ fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                {t("Template Visibility", { defaultValue: "Template Visibility" })} <span style={{ color: "#ef4444" }}>*</span>
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

          {/* Subtasks */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
              <label style={{ fontSize: "12px", fontWeight: 600 }}>{t("Default Subtasks / Deliverables", { defaultValue: "Default Subtasks / Deliverables" })}</label>
              <button type="button" onClick={handleAddSubtask} style={{ background: "none", border: "none", color: "#3b82f6", cursor: "pointer", fontSize: "12px", display: "flex", alignItems: "center", gap: "4px", fontWeight: 600 }}>
                <Plus size={14} /> {t("Add Subtask", { defaultValue: "Add Subtask" })}
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {subtasks.map((st, i) => (
                <div key={i} style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <input
                    type="text"
                    placeholder={t("Subtask #{{num}} Title", { defaultValue: `Subtask #${i + 1} Title`, num: i + 1 })}
                    value={st.title}
                    onChange={(e) => handleSubtaskChange(i, e.target.value)}
                    style={{ flex: 1, padding: "6px 10px", borderRadius: "6px", border: "1px solid var(--border-color)", background: "var(--bg-card)", color: "var(--text-primary)", fontSize: "12px" }}
                  />
                  {subtasks.length > 1 && (
                    <button type="button" onClick={() => handleRemoveSubtask(i)} style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer" }}>
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Requirements */}
          <div>
            <label style={{ fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "4px" }}>{t("Requirements & Guidelines", { defaultValue: "Requirements & Guidelines" })}</label>
            <div style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
              <input
                type="text"
                placeholder={t("Add a requirement bullet point...", { defaultValue: "Add a requirement bullet point..." })}
                value={newReq}
                onChange={(e) => setNewReq(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddReq(); } }}
                style={{ flex: 1, padding: "6px 10px", borderRadius: "6px", border: "1px solid var(--border-color)", background: "var(--bg-card)", color: "var(--text-primary)", fontSize: "12px" }}
              />
              <button type="button" onClick={handleAddReq} style={{ padding: "6px 12px", borderRadius: "6px", background: "var(--bg-hover)", border: "1px solid var(--border-color)", cursor: "pointer", fontSize: "12px" }}>
                {t("Add", { defaultValue: "Add" })}
              </button>
            </div>
            {requirements.map((req, idx) => (
              <div key={idx} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 8px", background: "var(--bg-hover)", borderRadius: "4px", marginBottom: "4px", fontSize: "12px" }}>
                <span>• {req}</span>
                <button type="button" onClick={() => handleRemoveReq(idx)} style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer" }}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
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
                  <span style={{ fontWeight: 600 }}>{file ? file.name : (initialTemplate.file_name || (initialTemplate.file_path ? initialTemplate.file_path.split("/").pop() : ""))}</span>
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
                      if (initialTemplate?.file_path) {
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
              {loading ? t("Saving...", { defaultValue: "Saving..." }) : initialTemplate ? t("Update Template", { defaultValue: "Update Template" }) : t("Create Template", { defaultValue: "Create Template" })}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
