import React, { useState, useEffect } from "react";
import DashboardLayout from "../components/layout/DashboardLayout";
import Breadcrumb from "../components/Breadcrumb";
import CreateKnowledgeModal from "../components/CreateKnowledgeModal";
import ConfirmModal from "../components/ConfirmModal";
import API_URL from "../config/api";
import { authToken, rolePath, getUser } from "../utils/auth";
import { useNotification } from "../context/NotificationContext";
import { Plus, Search, BookOpen, Lock, Users, Building, ShieldCheck, Edit, Trash2, Download, Paperclip, X } from "lucide-react";

export default function KnowledgeBase() {
  const user = getUser();
  const notify = useNotification();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [visibilityFilter, setVisibilityFilter] = useState("all");

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [deletingItem, setDeletingItem] = useState(null);
  const [readingItem, setReadingItem] = useState(null);

  const fetchItems = () => {
    setLoading(true);
    const token = authToken();
    fetch(`${API_URL}/knowledge-base`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      skipLoader: true,
    })
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((d) => setItems(Array.isArray(d.data) ? d.data : []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchItems();
  }, []);

  const handleDeleteConfirm = async () => {
    if (!deletingItem) return;
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/knowledge-base/${deletingItem.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      });
      if (res.ok) {
        notify.success("Knowledge article deleted successfully.");
        fetchItems();
      } else {
        notify.error("Failed to delete article.");
      }
    } catch (e) {
      notify.error("An error occurred while deleting article.");
    } finally {
      setDeletingItem(null);
    }
  };

  const filteredItems = items.filter((item) => {
    const matchesSearch =
      item.title.toLowerCase().includes(search.toLowerCase()) ||
      (item.content && item.content.toLowerCase().includes(search.toLowerCase())) ||
      (item.category && item.category.toLowerCase().includes(search.toLowerCase()));

    const matchesCategory = categoryFilter === "all" || item.category === categoryFilter;
    const matchesVisibility = visibilityFilter === "all" || item.visibility_level === visibilityFilter;

    return matchesSearch && matchesCategory && matchesVisibility;
  });

  const visibilityBadge = (level) => {
    switch (level) {
      case "private":
        return <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "11px", fontWeight: 600, padding: "2px 8px", borderRadius: "12px", background: "#f3f4f6", color: "#4b5563" }}><Lock size={12} /> Private</span>;
      case "project_team":
        return <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "11px", fontWeight: 600, padding: "2px 8px", borderRadius: "12px", background: "#eff6ff", color: "#1d4ed8" }}><Users size={12} /> Project Team</span>;
      case "department_team":
        return <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "11px", fontWeight: 600, padding: "2px 8px", borderRadius: "12px", background: "#f0fdf4", color: "#15803d" }}><Building size={12} /> Department</span>;
      case "organization":
        return <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "11px", fontWeight: 600, padding: "2px 8px", borderRadius: "12px", background: "#fef3c7", color: "#b45309" }}><ShieldCheck size={12} /> Organization</span>;
      default:
        return null;
    }
  };

  const breadcrumbs = [
    { label: "Reports", path: rolePath("reports") },
    { label: "Knowledge Base" },
  ];

  return (
    <DashboardLayout>
      <Breadcrumb items={breadcrumbs} />

      <div style={{ padding: "0 4px" }}>
        {/* HEADER BAR */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "12px" }}>
          <div>
            <h2 style={{ fontSize: "20px", fontWeight: 700, margin: 0 }}>Knowledge Base & Documentation</h2>
            <p style={{ fontSize: "13px", color: "var(--text-secondary)", margin: "4px 0 0" }}>
              Share guidelines, SOPs, and technical resources with your team and organization.
            </p>
          </div>

          {/* Universal Creation Button accessible to ALL roles */}
          <button
            onClick={() => { setEditingItem(null); setCreateModalOpen(true); }}
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
            <Plus size={16} /> Create Article / Upload Knowledge
          </button>
        </div>

        {/* SEARCH & FILTERS BAR */}
        <div style={{ display: "flex", gap: "12px", alignItems: "center", marginBottom: "20px", flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: 1, minWidth: "200px" }}>
            <Search style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#9ca3af" }} size={16} />
            <input
              type="text"
              placeholder="Search knowledge base articles..."
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
            <option value="all">All Categories</option>
            <option value="General">General</option>
            <option value="Best Practices">Best Practices</option>
            <option value="Technical Documentation">Technical Documentation</option>
            <option value="Onboarding">Onboarding</option>
            <option value="Guidelines">Guidelines</option>
            <option value="Process & SOPs">Process & SOPs</option>
          </select>

          <select
            value={visibilityFilter}
            onChange={(e) => setVisibilityFilter(e.target.value)}
            style={{ padding: "8px 12px", borderRadius: "6px", border: "1px solid var(--border-color)", background: "var(--bg-card)", fontSize: "13px" }}
          >
            <option value="all">All Visibility Levels</option>
            <option value="organization">Organization</option>
            <option value="department_team">Department Team</option>
            <option value="project_team">Project Team</option>
            <option value="private">Private (Only me)</option>
          </select>
        </div>

        {/* ARTICLES GRID */}
        {loading ? (
          <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text-secondary)" }}>Loading knowledge base...</div>
        ) : filteredItems.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 0", background: "var(--bg-card)", borderRadius: "12px", border: "1px solid var(--border-color)" }}>
            <BookOpen size={40} style={{ color: "#9ca3af", marginBottom: "12px" }} />
            <h4 style={{ margin: "0 0 4px", fontSize: "15px", fontWeight: 600 }}>No articles found</h4>
            <p style={{ margin: 0, fontSize: "13px", color: "var(--text-secondary)" }}>Create a knowledge article to build your organization's documentation.</p>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "16px" }}>
            {filteredItems.map((item) => {
              const canEditDelete = item.created_by === user.id || ["admin", "manager"].includes(user.role);

              return (
                <div key={item.id} style={{ background: "var(--bg-card)", border: "1px solid var(--border-color)", borderRadius: "12px", padding: "18px", display: "flex", flexDirection: "column", justifyContent: "space-between", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px" }}>
                      <span style={{ fontSize: "11px", fontWeight: 600, color: "#059669", background: "#d1fae5", padding: "2px 8px", borderRadius: "4px" }}>
                        {item.category || "General"}
                      </span>
                      {visibilityBadge(item.visibility_level)}
                    </div>

                    <h3
                      onClick={() => setReadingItem(item)}
                      style={{ margin: "4px 0 8px", fontSize: "15px", fontWeight: 600, color: "var(--text-primary)", cursor: "pointer" }}
                    >
                      {item.title}
                    </h3>

                    <p style={{ margin: "0 0 12px", fontSize: "12px", color: "var(--text-secondary)", minHeight: "42px", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                      {item.content || "No text description provided. Attached file available."}
                    </p>

                    {item.project && (
                      <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "8px" }}>
                        Linked Project: <strong>{item.project.title}</strong>
                      </div>
                    )}

                    <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "12px", display: "flex", alignItems: "center", gap: "12px" }}>
                      <span>By: {item.creator?.name || "System User"}</span>
                      {item.file_path && <span style={{ color: "#2563eb", display: "inline-flex", alignItems: "center", gap: "2px" }}><Paperclip size={12} /> Attachment</span>}
                    </div>
                  </div>

                  {/* FOOTER ACTIONS */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: "12px", borderTop: "1px solid var(--border-color)" }}>
                    <div style={{ display: "flex", gap: "6px" }}>
                      {canEditDelete && (
                        <>
                          <button
                            onClick={() => { setEditingItem(item); setCreateModalOpen(true); }}
                            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: "4px" }}
                            title="Edit Article"
                          >
                            <Edit size={16} />
                          </button>
                          <button
                            onClick={() => setDeletingItem(item)}
                            style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", padding: "4px" }}
                            title="Delete Article"
                          >
                            <Trash2 size={16} />
                          </button>
                        </>
                      )}
                    </div>

                    <button
                      onClick={() => setReadingItem(item)}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        padding: "6px 14px",
                        borderRadius: "6px",
                        background: "#2563eb",
                        color: "#ffffff",
                        fontSize: "12px",
                        fontWeight: 600,
                        border: "none",
                        cursor: "pointer",
                      }}
                    >
                      <BookOpen size={14} /> Read Article
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* CREATE / EDIT KNOWLEDGE ARTICLE MODAL */}
      {createModalOpen && (
        <CreateKnowledgeModal
          isOpen={createModalOpen}
          initialItem={editingItem}
          onClose={() => { setCreateModalOpen(false); setEditingItem(null); }}
          onSuccess={fetchItems}
        />
      )}

      {/* READING UI MODAL */}
      {readingItem && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
          <div style={{ background: "var(--bg-card)", borderRadius: "12px", width: "100%", maxWidth: "750px", maxHeight: "90vh", overflowY: "auto", border: "1px solid var(--border-color)", boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)", padding: "24px" }}>
            {/* HEADER */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px", paddingBottom: "16px", borderBottom: "1px solid var(--border-color)" }}>
              <div>
                <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "8px" }}>
                  <span style={{ fontSize: "11px", fontWeight: 600, color: "#059669", background: "#d1fae5", padding: "2px 8px", borderRadius: "4px" }}>
                    {readingItem.category || "General"}
                  </span>
                  {visibilityBadge(readingItem.visibility_level)}
                </div>
                <h2 style={{ margin: 0, fontSize: "20px", fontWeight: 700 }}>{readingItem.title}</h2>
                <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px" }}>
                  Published by <strong>{readingItem.creator?.name || "System"}</strong> on {new Date(readingItem.created_at).toLocaleDateString()}
                </div>
              </div>
              <button onClick={() => setReadingItem(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)" }}>
                <X size={22} />
              </button>
            </div>

            {/* CONTENT BODY */}
            <div style={{ fontSize: "14px", lineHeight: "1.7", color: "var(--text-primary)", whiteSpace: "pre-wrap", marginBottom: "20px" }}>
              {readingItem.content || "No document body provided."}
            </div>

            {/* FILE ATTACHMENT DOWNLOAD */}
            {readingItem.file_path && (
              <div style={{ padding: "12px 16px", background: "var(--bg-hover)", borderRadius: "8px", border: "1px solid var(--border-color)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "13px" }}>
                  <Paperclip color="#2563eb" size={18} />
                  <span>{readingItem.file_name || readingItem.file_path.split("/").pop()}</span>
                </div>
                <a
                  href={`${API_URL}/storage/${readingItem.file_path}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "6px 14px", borderRadius: "6px", background: "#2563eb", color: "#ffffff", fontSize: "12px", fontWeight: 600, textDecoration: "none" }}
                >
                  <Download size={14} /> Download File
                </a>
              </div>
            )}

            {/* FOOTER */}
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "24px", paddingTop: "16px", borderTop: "1px solid var(--border-color)" }}>
              <button onClick={() => setReadingItem(null)} style={{ padding: "8px 20px", borderRadius: "6px", border: "1px solid var(--border-color)", background: "var(--bg-hover)", color: "var(--text-primary)", fontSize: "13px", cursor: "pointer", fontWeight: 600 }}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE CONFIRM MODAL */}
      <ConfirmModal
        isOpen={!!deletingItem}
        onClose={() => setDeletingItem(null)}
        onConfirm={handleDeleteConfirm}
        title="Delete Knowledge Article"
        message={`Are you sure you want to delete "${deletingItem?.title}"?`}
        confirmText="Delete"
        cancelText="Cancel"
        danger
      />
    </DashboardLayout>
  );
}
