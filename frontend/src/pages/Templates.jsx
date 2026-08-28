import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import DashboardLayout from "../components/layout/DashboardLayout";
import Breadcrumb from "../components/Breadcrumb";
import CreateTemplateModal from "../components/CreateTemplateModal";
import CreateTaskModal from "../components/CreateTaskModal";
import ConfirmModal from "../components/ConfirmModal";
import API_URL from "../config/api";
import { authToken, rolePath, getUser } from "../utils/auth";
import { useNotification } from "../context/NotificationContext";
import { Plus, Search, FileText, Lock, Users, Building, ShieldCheck, Edit, Trash2, ArrowRight, Paperclip, Download } from "lucide-react";

export default function Templates() {
  const { t } = useTranslation();
  const user = getUser();
  const notify = useNotification();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [visibilityFilter, setVisibilityFilter] = useState("all");

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [deletingTemplate, setDeletingTemplate] = useState(null);

  // Spawning task from template
  const [spawnTaskData, setSpawnTaskData] = useState(null);

  const fetchTemplates = () => {
    setLoading(true);
    const token = authToken();
    fetch(`${API_URL}/templates`, {
      headers: { Accept: "application/json", Authorization: token ? `Bearer ${token}` : "" },
      skipLoader: true,
    })
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((d) => setTemplates(Array.isArray(d.data) ? d.data : []))
      .catch(() => setTemplates([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  const handleDeleteConfirm = async () => {
    if (!deletingTemplate) return;
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/templates/${deletingTemplate.id}`, {
        method: "DELETE",
        headers: { Authorization: token ? `Bearer ${token}` : "", Accept: "application/json" },
      });
      if (res.ok) {
        notify.success(t("Template deleted successfully.", { defaultValue: "Template deleted successfully." }));
        fetchTemplates();
      } else {
        notify.error(t("Failed to delete template.", { defaultValue: "Failed to delete template." }));
      }
    } catch (e) {
      notify.error(t("An error occurred while deleting template.", { defaultValue: "An error occurred while deleting template." }));
    } finally {
      setDeletingTemplate(null);
    }
  };

  const handleUseTemplate = (template) => {
    const subtasks = template.data?.subtasks || [];
    const requirements = template.data?.requirements || [];

    setSpawnTaskData({
      title: template.title,
      description: template.description || "",
      task_type: template.data?.task_type || "one_off",
      priority: template.data?.priority || "Medium",
      project_id: template.project_id ? [template.project_id] : [],
      subtasks: subtasks,
      requirements: requirements,
    });
  };

  const filteredTemplates = templates.filter((t) => {
    const matchesSearch =
      t.title.toLowerCase().includes(search.toLowerCase()) ||
      (t.description && t.description.toLowerCase().includes(search.toLowerCase()));

    const matchesCategory = categoryFilter === "all" || t.category === categoryFilter;
    const matchesVisibility = visibilityFilter === "all" || t.visibility_level === visibilityFilter;

    return matchesSearch && matchesCategory && matchesVisibility;
  });

  const breadcrumbs = [
    { label: t("Drafts", { defaultValue: "Drafts" }), path: rolePath("drafts") },
    { label: t("Templates", { defaultValue: "Templates" }) },
  ];

  const visibilityBadge = (level) => {
    switch (level) {
      case "private":
      case "organization":
        return <span style={{ fontSize: "11px", fontWeight: 600, color: "#10b981", background: "#d1fae5", padding: "2px 8px", borderRadius: "4px", display: "inline-flex", alignItems: "center", gap: "4px" }}><Globe size={11} /> {t("Organization", { defaultValue: "Organization" })}</span>;
      case "department_team":
        return <span style={{ fontSize: "11px", fontWeight: 600, color: "#6366f1", background: "#e0e7ff", padding: "2px 8px", borderRadius: "4px", display: "inline-flex", alignItems: "center", gap: "4px" }}><Building size={11} /> {t("Department Team", { defaultValue: "Department Team" })}</span>;
      case "project_team":
        return <span style={{ fontSize: "11px", fontWeight: 600, color: "#f59e0b", background: "#fef3c7", padding: "2px 8px", borderRadius: "4px", display: "inline-flex", alignItems: "center", gap: "4px" }}><FolderGit2 size={11} /> {t("Project Team", { defaultValue: "Project Team" })}</span>;
      case "private":
      default:
        return <span style={{ fontSize: "11px", fontWeight: 600, color: "#64748b", background: "#f1f5f9", padding: "2px 8px", borderRadius: "4px", display: "inline-flex", alignItems: "center", gap: "4px" }}><Lock size={11} /> {t("Private", { defaultValue: "Private" })}</span>;
    }
  };

  return (
    <DashboardLayout>
      <Breadcrumb items={breadcrumbs} />

      <div style={{ padding: "0 4px" }}>
        {/* HEADER BAR */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "12px" }}>
          <div>
            <h2 style={{ fontSize: "20px", fontWeight: 700, margin: 0 }}>{t("Task & Project Templates", { defaultValue: "Task & Project Templates" })}</h2>
            <p style={{ fontSize: "13px", color: "var(--text-secondary)", margin: "4px 0 0" }}>
              {t("Standardized workflows and templates accessible based on visibility settings.", { defaultValue: "Standardized workflows and templates accessible based on visibility settings." })}
            </p>
          </div>

          <button
            onClick={() => { setEditingTemplate(null); setCreateModalOpen(true); }}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "8px 16px",
              borderRadius: "8px",
              background: "#2563eb",
              color: "#ffffff",
              fontSize: "13px",
              fontWeight: 600,
              border: "none",
              cursor: "pointer",
              boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
            }}
          >
            <Plus size={16} /> {t("Create / Upload Template", { defaultValue: "Create / Upload Template" })}
          </button>
        </div>

        {/* SEARCH & FILTERS BAR */}
        <div style={{ display: "flex", gap: "12px", alignItems: "center", marginBottom: "20px", flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: 1, minWidth: "200px" }}>
            <Search style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#9ca3af" }} size={16} />
            <input
              type="text"
              placeholder={t("Search templates by title or keyword...", { defaultValue: "Search templates by title or keyword..." })}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: "100%", padding: "8px 12px 8px 34px", borderRadius: "6px", border: "1px solid var(--border-color)", background: "var(--bg-card)", fontSize: "13px" }}
            />
          </div>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            style={{ padding: "8px 12px", borderRadius: "6px", border: "1px solid var(--border-color)", background: "var(--bg-card)", fontSize: "13px" }}
          >
            <option value="all">{t("All Categories", { defaultValue: "All Categories" })}</option>
            {availableCategories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          <select
            value={visibilityFilter}
            onChange={(e) => setVisibilityFilter(e.target.value)}
            style={{ padding: "8px 12px", borderRadius: "6px", border: "1px solid var(--border-color)", background: "var(--bg-card)", fontSize: "13px" }}
          >
            <option value="all">{t("All Visibility Levels", { defaultValue: "All Visibility Levels" })}</option>
            <option value="private">{t("Private (Only me)", { defaultValue: "Private (Only me)" })}</option>
            <option value="project_team">{t("Project Team", { defaultValue: "Project Team" })}</option>
            <option value="department_team">{t("Department Team", { defaultValue: "Department Team" })}</option>
            <option value="organization">{t("Organization", { defaultValue: "Organization" })}</option>
          </select>
        </div>

        {/* TEMPLATE GRID */}
        {loading ? (
          <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text-secondary)" }}>{t("Loading templates...", { defaultValue: "Loading templates..." })}</div>
        ) : filteredTemplates.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 0", background: "var(--bg-card)", borderRadius: "12px", border: "1px solid var(--border-color)" }}>
            <FileText size={40} style={{ color: "#9ca3af", marginBottom: "12px" }} />
            <h4 style={{ margin: "0 0 4px", fontSize: "15px", fontWeight: 600 }}>{t("No templates found", { defaultValue: "No templates found" })}</h4>
            <p style={{ margin: 0, fontSize: "13px", color: "var(--text-secondary)" }}>{t("Create a new template to standardize task workflows.", { defaultValue: "Create a new template to standardize task workflows." })}</p>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "16px" }}>
            {filteredTemplates.map((template) => {
              const subtaskCount = template.data?.subtasks?.length || 0;
              const canEditDelete = template.created_by === user.id || ["admin", "manager"].includes(user.role);

              return (
                <div key={template.id} style={{ background: "var(--bg-card)", border: "1px solid var(--border-color)", borderRadius: "12px", padding: "16px", display: "flex", flexDirection: "column", justifyContent: "space-between", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
                      {template.category && (
                        <span style={{ fontSize: "11px", fontWeight: 600, color: "#2563eb", background: "#dbeafe", padding: "2px 8px", borderRadius: "4px" }}>
                          {template.category}
                        </span>
                      )}
                      {visibilityBadge(template.visibility_level)}
                    </div>

                    <h3 style={{ margin: "4px 0 6px", fontSize: "15px", fontWeight: 600, color: "var(--text-primary)" }}>
                      {template.title}
                    </h3>

                    <p style={{ margin: "0 0 12px", fontSize: "12px", color: "var(--text-secondary)", minHeight: "36px", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                      {template.description || t("No description provided.", { defaultValue: "No description provided." })}
                    </p>

                    {template.project && (
                      <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "8px" }}>
                        {t("Linked Project:", { defaultValue: "Linked Project:" })} <strong>{template.project.title}</strong>
                      </div>
                    )}

                    {template.file_path && (
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 10px", background: "var(--bg-hover)", borderRadius: "6px", border: "1px solid var(--border-color)", marginBottom: "10px", fontSize: "11px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px", overflow: "hidden" }}>
                          <Paperclip size={14} color="#2563eb" />
                          <span style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {template.file_path.split("/").pop()}
                          </span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <a
                            href={`${API_URL}/storage/${template.file_path}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: "#2563eb", display: "inline-flex", alignItems: "center" }}
                            title={t("Download Attachment", { defaultValue: "Download Attachment" })}
                          >
                            <Download size={14} />
                          </a>
                          {canEditDelete && (
                            <>
                              <button
                                onClick={() => { setEditingTemplate(template); setCreateModalOpen(true); }}
                                style={{ background: "none", border: "none", color: "#2563eb", cursor: "pointer", padding: 0 }}
                                title={t("Edit / Replace Attachment", { defaultValue: "Edit / Replace Attachment" })}
                              >
                                <Edit size={14} />
                              </button>
                              <button
                                onClick={() => setDeletingTemplate(template)}
                                style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", padding: 0 }}
                                title={t("Delete Template File", { defaultValue: "Delete Template File" })}
                              >
                                <Trash2 size={14} />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    )}

                    <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "12px" }}>
                      {t("Subtasks: {{count}} | By: {{author}}", { count: subtaskCount, author: template.creator?.name || t("System", { defaultValue: "System" }), defaultValue: `Subtasks: ${subtaskCount} | By: ${template.creator?.name || "System"}` })}
                    </div>
                  </div>

                  {/* ACTIONS */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: "12px", borderTop: "1px solid var(--border-color)" }}>
                    <div style={{ display: "flex", gap: "6px" }}>
                      {canEditDelete && (
                        <>
                          <button
                            onClick={() => { setEditingTemplate(template); setCreateModalOpen(true); }}
                            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: "4px" }}
                            title={t("Edit Template", { defaultValue: "Edit Template" })}
                          >
                            <Edit size={16} />
                          </button>
                          <button
                            onClick={() => setDeletingTemplate(template)}
                            style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", padding: "4px" }}
                            title={t("Delete Template", { defaultValue: "Delete Template" })}
                          >
                            <Trash2 size={16} />
                          </button>
                        </>
                      )}
                    </div>

                    {/* Member and all roles can USE TEMPLATE to spawn a task */}
                    <button
                      onClick={() => handleUseTemplate(template)}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        padding: "6px 12px",
                        borderRadius: "6px",
                        background: "#10b981",
                        color: "#ffffff",
                        fontSize: "12px",
                        fontWeight: 600,
                        border: "none",
                        cursor: "pointer",
                      }}
                    >
                      {t("Use Template", { defaultValue: "Use Template" })} <ArrowRight size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* CREATE / EDIT TEMPLATE MODAL */}
      {createModalOpen && (
        <CreateTemplateModal
          isOpen={createModalOpen}
          initialTemplate={editingTemplate}
          onClose={() => { setCreateModalOpen(false); setEditingTemplate(null); }}
          onSuccess={fetchTemplates}
        />
      )}

      {/* DELETE CONFIRM MODAL */}
      <ConfirmModal
        isOpen={!!deletingTemplate}
        onClose={() => setDeletingTemplate(null)}
        onConfirm={handleDeleteConfirm}
        title={t("Delete Template", { defaultValue: "Delete Template" })}
        message={t("Are you sure you want to delete \"{{title}}\"?", { title: deletingTemplate?.title, defaultValue: `Are you sure you want to delete "${deletingTemplate?.title}"?` })}
        confirmText={t("Delete", { defaultValue: "Delete" })}
        cancelText={t("Cancel", { defaultValue: "Cancel" })}
        danger
      />

      {/* SPAWN TASK FROM TEMPLATE MODAL */}
      {spawnTaskData && (
        <CreateTaskModal
          onClose={() => setSpawnTaskData(null)}
          onTaskCreated={() => { setSpawnTaskData(null); notify.success(t("Task created from template successfully!", { defaultValue: "Task created from template successfully!" })); }}
          prefillData={spawnTaskData}
        />
      )}
    </DashboardLayout>
  );
}

