import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { X, Search, Check, FolderKanban, CheckSquare, Plus, Link2 } from "lucide-react";
import API_URL from "../config/api";
import { authToken } from "../utils/auth";
import { useNotification } from "../context/NotificationContext";
import { publish } from "../utils/eventBus";

/**
 * Reusable modal allowing a resource (Knowledge Base article or Calendar Event)
 * to be attached/linked to a Project or a Task.
 *
 * @param {Object} props
 * @param {boolean} props.isOpen - Whether modal is visible
 * @param {Function} props.onClose - Callback to close modal
 * @param {Object} props.resource - { type: "knowledge_base"|"event", id: number|string, title: string }
 * @param {Function} [props.onSuccess] - Callback when successfully linked
 */
export default function AttachResourceModal({ isOpen, onClose, resource, onSuccess }) {
  const { t } = useTranslation();
  const notify = useNotification();

  const [targetType, setTargetType] = useState("project"); // "project" | "task"
  const [searchQuery, setSearchQuery] = useState("");
  const [projects, setProjects] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loadingList, setLoadingList] = useState(false);
  const [selectedTargetId, setSelectedTargetId] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setSelectedTargetId(null);
      setSearchQuery("");
      return;
    }

    const token = authToken();
    if (!token) return;

    setLoadingList(true);
    if (targetType === "project") {
      fetch(`${API_URL}/projects?per_page=100`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        skipLoader: true,
      })
        .then((r) => r.json())
        .then((d) => {
          const list = Array.isArray(d) ? d : d?.data || [];
          setProjects(list);
        })
        .catch((err) => console.error("Failed to load projects", err))
        .finally(() => setLoadingList(false));
    } else {
      fetch(`${API_URL}/all-tasks?per_page=100`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        skipLoader: true,
      })
        .then((r) => r.json())
        .then((d) => {
          const list = Array.isArray(d) ? d : d?.data || [];
          setTasks(list);
        })
        .catch((err) => console.error("Failed to load tasks", err))
        .finally(() => setLoadingList(false));
    }
  }, [isOpen, targetType]);

  if (!isOpen || !resource) return null;

  const isKb = resource.type === "knowledge_base" || resource.type === "kb";
  const resourceTitle = resource.title || (isKb ? t("Document", { defaultValue: "Document" }) : t("Event", { defaultValue: "Event" }));

  const filteredItems = (targetType === "project" ? projects : tasks).filter((item) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      (item.title || "").toLowerCase().includes(q) ||
      (item.business_id || "").toLowerCase().includes(q) ||
      (item.project_code || "").toLowerCase().includes(q)
    );
  });

  const handleAttach = async () => {
    if (!selectedTargetId) {
      notify.error(
        targetType === "project"
          ? t("Please select a project to attach to.", { defaultValue: "Please select a project to attach to." })
          : t("Please select a task to attach to.", { defaultValue: "Please select a task to attach to." })
      );
      return;
    }

    setSubmitting(true);
    try {
      const token = authToken();
      let url = "";
      let body = {};

      if (targetType === "project") {
        if (isKb) {
          url = `${API_URL}/projects/${selectedTargetId}/knowledge-bases`;
          body = { knowledge_base_id: resource.id };
        } else {
          url = `${API_URL}/projects/${selectedTargetId}/events`;
          body = { event_id: resource.id };
        }
      } else {
        if (isKb) {
          url = `${API_URL}/tasks/${selectedTargetId}/knowledge-bases`;
          body = { knowledge_base_id: resource.id };
        } else {
          url = `${API_URL}/tasks/${selectedTargetId}/events`;
          body = { event_id: resource.id };
        }
      }

      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to attach resource.");

      publish("task:updated", { id: selectedTargetId });
      publish("project:updated", { id: selectedTargetId });
      publish("data:changed", { type: targetType, action: "updated" });

      notify.success(
        targetType === "project"
          ? t("Attached successfully to project!", { defaultValue: "Attached successfully to project!" })
          : t("Attached successfully to task!", { defaultValue: "Attached successfully to task!" })
      );

      if (onSuccess) onSuccess(data);
      onClose();
    } catch (err) {
      console.error("Attach failed", err);
      notify.error(err.message || t("Failed to attach.", { defaultValue: "Failed to attach." }));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 10000,
        padding: "16px",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: "var(--bg-card, #ffffff)",
          borderRadius: "12px",
          width: "100%",
          maxWidth: "520px",
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid var(--border-color, #e5e7eb)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <h3
            style={{
              margin: 0,
              fontSize: "16px",
              fontWeight: 600,
              color: "var(--text-heading, #111827)",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <Link2 size={18} color="#2563eb" />
            {t("Attach to Project or Task", { defaultValue: "Attach to Project or Task" })}
          </h3>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", color: "#9ca3af", cursor: "pointer", padding: "4px" }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Resource Badge */}
        <div style={{ padding: "12px 20px", background: "var(--bg-card-alt, #f9fafb)", borderBottom: "1px solid var(--border-color, #f3f4f6)" }}>
          <div style={{ fontSize: "11px", color: "var(--text-muted, #6b7280)", textTransform: "uppercase", fontWeight: 700, marginBottom: "4px" }}>
            {isKb ? t("Document to Attach", { defaultValue: "Document to Attach" }) : t("Event to Attach", { defaultValue: "Event to Attach" })}
          </div>
          <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary, #111827)" }}>
            {resourceTitle}
          </div>
        </div>

        {/* Target Type Selector */}
        <div style={{ padding: "12px 20px 0 20px" }}>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              type="button"
              onClick={() => {
                setTargetType("project");
                setSelectedTargetId(null);
              }}
              style={{
                flex: 1,
                padding: "8px 12px",
                borderRadius: "8px",
                border: targetType === "project" ? "1px solid #2563eb" : "1px solid var(--border-color, #e5e7eb)",
                background: targetType === "project" ? "#eff6ff" : "var(--bg-card, #ffffff)",
                color: targetType === "project" ? "#2563eb" : "var(--text-primary, #374151)",
                fontWeight: 600,
                fontSize: "13px",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
              }}
            >
              <FolderKanban size={15} />
              {t("Project", { defaultValue: "Project" })}
            </button>
            <button
              type="button"
              onClick={() => {
                setTargetType("task");
                setSelectedTargetId(null);
              }}
              style={{
                flex: 1,
                padding: "8px 12px",
                borderRadius: "8px",
                border: targetType === "task" ? "1px solid #2563eb" : "1px solid var(--border-color, #e5e7eb)",
                background: targetType === "task" ? "#eff6ff" : "var(--bg-card, #ffffff)",
                color: targetType === "task" ? "#2563eb" : "var(--text-primary, #374151)",
                fontWeight: 600,
                fontSize: "13px",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
              }}
            >
              <CheckSquare size={15} />
              {t("Task", { defaultValue: "Task" })}
            </button>
          </div>
        </div>

        {/* Search */}
        <div style={{ padding: "12px 20px" }}>
          <div className="pd-files-search" style={{ margin: 0, width: "100%" }}>
            <Search size={15} />
            <input
              type="text"
              placeholder={
                targetType === "project"
                  ? t("Search projects by name or code...", { defaultValue: "Search projects by name or code..." })
                  : t("Search tasks by title or ID...", { defaultValue: "Search tasks by title or ID..." })
              }
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* List of Targets */}
        <div style={{ padding: "0 20px 16px 20px", overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: "8px" }}>
          {loadingList ? (
            <p className="td-muted" style={{ textAlign: "center", padding: "20px 0" }}>
              {targetType === "project"
                ? t("Loading projects...", { defaultValue: "Loading projects..." })
                : t("Loading tasks...", { defaultValue: "Loading tasks..." })}
            </p>
          ) : filteredItems.length === 0 ? (
            <div style={{ textAlign: "center", padding: "24px 0", color: "var(--text-muted, #6b7280)", fontSize: "14px" }}>
              {targetType === "project"
                ? t("No projects found.", { defaultValue: "No projects found." })
                : t("No tasks found.", { defaultValue: "No tasks found." })}
            </div>
          ) : (
            filteredItems.map((item) => {
              const isSelected = selectedTargetId === item.id;
              return (
                <div
                  key={item.id}
                  onClick={() => setSelectedTargetId(item.id)}
                  style={{
                    padding: "10px 14px",
                    borderRadius: "8px",
                    border: isSelected ? "1px solid #2563eb" : "1px solid var(--border-color, #e5e7eb)",
                    background: isSelected ? "#eff6ff" : "var(--bg-card, #ffffff)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "12px",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: "13px", color: "var(--text-primary, #111827)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {item.title}
                    </div>
                    {item.business_id && (
                      <div style={{ fontSize: "11px", color: "var(--text-muted, #6b7280)", marginTop: "2px" }}>
                        {item.business_id}
                      </div>
                    )}
                  </div>

                  <div>
                    {isSelected ? (
                      <span
                        style={{
                          fontSize: "12px",
                          color: "#2563eb",
                          fontWeight: 600,
                          display: "flex",
                          alignItems: "center",
                          gap: "4px",
                        }}
                      >
                        <Check size={16} />
                      </span>
                    ) : (
                      <span style={{ fontSize: "12px", color: "var(--text-muted, #9ca3af)" }}>
                        {t("Select", { defaultValue: "Select" })}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "12px 20px",
            borderTop: "1px solid var(--border-color, #e5e7eb)",
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center",
            gap: "10px",
            background: "var(--bg-card-alt, #f9fafb)",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            style={{
              padding: "7px 16px",
              borderRadius: "6px",
              border: "1px solid var(--border-color, #d1d5db)",
              background: "transparent",
              color: "var(--text-primary, #374151)",
              fontSize: "13px",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            {t("Cancel", { defaultValue: "Cancel" })}
          </button>
          <button
            type="button"
            onClick={handleAttach}
            disabled={submitting || !selectedTargetId}
            style={{
              padding: "7px 18px",
              borderRadius: "6px",
              border: "none",
              background: "var(--color-primary, #2563eb)",
              color: "#ffffff",
              fontSize: "13px",
              fontWeight: 600,
              cursor: submitting || !selectedTargetId ? "not-allowed" : "pointer",
              opacity: submitting || !selectedTargetId ? 0.6 : 1,
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            {submitting ? t("Attaching...", { defaultValue: "Attaching..." }) : t("Attach", { defaultValue: "Attach" })}
          </button>
        </div>
      </div>
    </div>
  );
}
