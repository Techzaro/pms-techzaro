import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "../components/layout/DashboardLayout";
import Breadcrumb from "../components/Breadcrumb";
import ConfirmModal from "../components/ConfirmModal";
import API_URL from "../config/api";
import { authToken, rolePath, getUser } from "../utils/auth";
import { useNotification } from "../context/NotificationContext";
import DOMPurify from "dompurify";
import "./KnowledgeBase.css";
import {
  Plus,
  Search,
  BookOpen,
  Lock,
  Users,
  Building,
  ShieldCheck,
  Edit,
  Trash2,
  Download,
  Paperclip,
  X,
  Pin,
  Eye,
  Layers,
  User,
  Clock,
  Sparkles,
  ExternalLink,
} from "lucide-react";

export default function KnowledgeBaseList() {
  const user = getUser();
  const notify = useNotification();
  const navigate = useNavigate();

  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [visibilityFilter, setVisibilityFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const [deletingItem, setDeletingItem] = useState(null);
  const [readingItem, setReadingItem] = useState(null);

  // New Category Modal State
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [newCatForm, setNewCatForm] = useState({ name: "", description: "", color: "#3b82f6" });
  const [catLoading, setCatLoading] = useState(false);

  // Fetch Categories from API (Always dynamic, never hardcoded)
  const fetchCategories = async () => {
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/kb-categories`, {
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
        skipLoader: true,
      });
      if (res.ok) {
        const d = await res.json();
        setCategories(Array.isArray(d.data) ? d.data : []);
      }
    } catch (e) {
      console.error("Error fetching KB categories", e);
    }
  };

  // Fetch Articles from API
  const fetchItems = async () => {
    setLoading(true);
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/knowledge-base?all=1`, {
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
        skipLoader: true,
      });
      if (res.ok) {
        const d = await res.json();
        setItems(Array.isArray(d.data) ? d.data : []);
      }
    } catch (e) {
      notify.error("Failed to load knowledge base articles.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
    fetchItems();
  }, []);

  const handleCreateCategory = async (e) => {
    e.preventDefault();
    if (!newCatForm.name.trim()) {
      notify.error("Category name is required.");
      return;
    }

    setCatLoading(true);
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/kb-categories`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(newCatForm),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        notify.success("Category created successfully!");
        setNewCatForm({ name: "", description: "", color: "#3b82f6" });
        setCategoryModalOpen(false);
        fetchCategories();
      } else {
        notify.error(data.message || "Failed to create category.");
      }
    } catch (e) {
      notify.error("Error creating category.");
    } finally {
      setCatLoading(false);
    }
  };

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
        fetchCategories();
      } else {
        notify.error("Failed to delete article.");
      }
    } catch (e) {
      notify.error("An error occurred while deleting article.");
    } finally {
      setDeletingItem(null);
    }
  };

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const searchLower = search.toLowerCase();
      const titleMatch = item.title?.toLowerCase().includes(searchLower);
      const contentMatch = item.content?.toLowerCase().includes(searchLower);
      const catMatch = item.category?.toLowerCase().includes(searchLower) || item.categoryRelation?.name?.toLowerCase().includes(searchLower);
      const tagsMatch = Array.isArray(item.tags) && item.tags.some((t) => t.toLowerCase().includes(searchLower));

      const matchesSearch = !search || titleMatch || contentMatch || catMatch || tagsMatch;

      const matchesCategory =
        selectedCategory === "all" ||
        item.category_id === Number(selectedCategory) ||
        item.category === selectedCategory ||
        item.categoryRelation?.slug === selectedCategory;

      const matchesVisibility = visibilityFilter === "all" || item.visibility_level === visibilityFilter;
      const matchesStatus = statusFilter === "all" || item.status === statusFilter;

      return matchesSearch && matchesCategory && matchesVisibility && matchesStatus;
    });
  }, [items, search, selectedCategory, visibilityFilter, statusFilter]);

  const pinnedItems = useMemo(() => filteredItems.filter((i) => i.is_pinned), [filteredItems]);
  const regularItems = useMemo(() => filteredItems.filter((i) => !i.is_pinned), [filteredItems]);

  const visibilityBadge = (level) => {
    switch (level) {
      case "private":
        return (
          <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "11px", fontWeight: 600, padding: "2px 8px", borderRadius: "12px", background: "#f3f4f6", color: "#4b5563" }}>
            <Lock size={12} /> Private
          </span>
        );
      case "project_team":
        return (
          <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "11px", fontWeight: 600, padding: "2px 8px", borderRadius: "12px", background: "#eff6ff", color: "#1d4ed8" }}>
            <Users size={12} /> Project Team
          </span>
        );
      case "team":
        return (
          <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "11px", fontWeight: 600, padding: "2px 8px", borderRadius: "12px", background: "#ede9fe", color: "#6d28d9" }}>
            <Users size={12} /> Team
          </span>
        );
      case "department_team":
        return (
          <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "11px", fontWeight: 600, padding: "2px 8px", borderRadius: "12px", background: "#f0fdf4", color: "#15803d" }}>
            <Building size={12} /> Department
          </span>
        );
      case "organization":
        return (
          <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "11px", fontWeight: 600, padding: "2px 8px", borderRadius: "12px", background: "#fef3c7", color: "#b45309" }}>
            <ShieldCheck size={12} /> Organization
          </span>
        );
      case "custom":
        return (
          <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "11px", fontWeight: 600, padding: "2px 8px", borderRadius: "12px", background: "#fdf2f8", color: "#be185d" }}>
            <Users size={12} /> Custom
          </span>
        );
      default:
        return null;
    }
  };

  const getCleanSnippet = (htmlContent) => {
    if (!htmlContent) return "No document preview available.";
    const temp = document.createElement("div");
    temp.innerHTML = htmlContent;
    return temp.textContent || temp.innerText || "";
  };

  const breadcrumbs = [
    { label: "Reports", path: rolePath("reports") },
    { label: "Knowledge Base" },
  ];

  return (
    <DashboardLayout>
      <Breadcrumb items={breadcrumbs} />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <h2 style={{ fontSize: "22px", fontWeight: 700, margin: 0, display: "flex", alignItems: "center", gap: "8px" }}>
            <BookOpen size={24} color="#2563eb" /> Knowledge Base & Documentation
          </h2>
          <p style={{ fontSize: "13px", color: "var(--text-secondary)", margin: "4px 0 0" }}>
            Enterprise documentation, company SOPs, technical patterns, and guidelines.
          </p>
        </div>

        <button
          onClick={() => navigate(rolePath("knowledge-base/create"))}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            padding: "9px 18px",
            borderRadius: "8px",
            background: "#2563eb",
            color: "#ffffff",
            fontSize: "13px",
            fontWeight: 600,
            border: "none",
            cursor: "pointer",
            boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
          }}
        >
          <Plus size={16} /> New Document / Article
        </button>
      </div>

      <div className="kb-container">
        {/* LEFT SIDEBAR: CATEGORIES & DIRECTORIES */}
        <div className="kb-sidebar">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "12px", fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", letterSpacing: "0.5px" }}>
              Categories
            </span>
            {["admin", "manager"].includes(user.role) && (
              <button
                onClick={() => setCategoryModalOpen(true)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "#2563eb", display: "inline-flex", alignItems: "center", gap: "2px", fontSize: "12px", fontWeight: 600 }}
                title="Add Custom Category"
              >
                <Plus size={14} /> Add
              </button>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <button
              onClick={() => setSelectedCategory("all")}
              className={`kb-category-item ${selectedCategory === "all" ? "active" : ""}`}
            >
              <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Layers size={16} /> All Articles
              </span>
              <span style={{ fontSize: "11px", background: "var(--bg-hover)", padding: "1px 6px", borderRadius: "10px" }}>
                {items.length}
              </span>
            </button>

            {categories.map((cat) => {
              const count = cat.articles_count ?? items.filter((i) => i.category_id === cat.id || i.category === cat.name).length;
              return (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(String(cat.id))}
                  className={`kb-category-item ${selectedCategory === String(cat.id) ? "active" : ""}`}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: cat.color || "#3b82f6" }} />
                    {cat.name}
                  </span>
                  <span style={{ fontSize: "11px", background: "var(--bg-hover)", padding: "1px 6px", borderRadius: "10px" }}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* VISIBILITY & STATUS FILTER OPTIONS */}
          <div style={{ borderTop: "1px solid var(--border-color)", paddingTop: "14px", display: "flex", flexDirection: "column", gap: "10px" }}>
            <label style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)" }}>
              Visibility Filter
            </label>
            <select
              value={visibilityFilter}
              onChange={(e) => setVisibilityFilter(e.target.value)}
              style={{ width: "100%", padding: "6px 10px", borderRadius: "6px", border: "1px solid var(--border-color)", background: "var(--bg-card)", fontSize: "12px", color: "var(--text-primary)" }}
            >
              <option value="all">All Visibilities</option>
              <option value="organization">Organization</option>
              <option value="department_team">Department Team</option>
              <option value="project_team">Project Team</option>
              <option value="team">Team</option>
              <option value="custom">Custom</option>
              <option value="private">Private (Only Me)</option>
            </select>

            <label style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", marginTop: "4px" }}>
              Status Filter
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{ width: "100%", padding: "6px 10px", borderRadius: "6px", border: "1px solid var(--border-color)", background: "var(--bg-card)", fontSize: "12px", color: "var(--text-primary)" }}
            >
              <option value="all">All Statuses</option>
              <option value="published">Published</option>
              <option value="draft">Drafts</option>
            </select>
          </div>
        </div>

        {/* RIGHT MAIN CONTENT AREA */}
        <div className="kb-content">
          {/* SEARCH & ACTIVE FILTER BAR */}
          <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
            <div style={{ position: "relative", flex: 1 }}>
              <Search style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#9ca3af" }} size={16} />
              <input
                type="text"
                placeholder="Search articles, documentation, guidelines, tags..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  width: "100%",
                  padding: "9px 12px 9px 36px",
                  borderRadius: "8px",
                  border: "1px solid var(--border-color)",
                  background: "var(--bg-card)",
                  fontSize: "13px",
                  color: "var(--text-primary)",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
                }}
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#9ca3af" }}
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          {/* MAIN ARTICLES LIST */}
          {loading ? (
            <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text-secondary)" }}>
              Loading knowledge base...
            </div>
          ) : filteredItems.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 20px", background: "var(--bg-card)", borderRadius: "12px", border: "1px solid var(--border-color)" }}>
              <BookOpen size={48} style={{ color: "#9ca3af", marginBottom: "12px" }} />
              <h3 style={{ margin: "0 0 6px", fontSize: "16px", fontWeight: 600 }}>No articles found</h3>
              <p style={{ margin: "0 0 16px", fontSize: "13px", color: "var(--text-secondary)" }}>
                Get started by creating your first rich-text documentation or guidelines.
              </p>
              <button
                onClick={() => navigate(rolePath("knowledge-base/create"))}
                style={{ padding: "8px 16px", borderRadius: "6px", background: "#2563eb", color: "#ffffff", border: "none", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
              >
                <Plus size={14} style={{ display: "inline", verticalAlign: "-2px", marginRight: "4px" }} /> Create Document
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
              {/* PINNED SECTION */}
              {pinnedItems.length > 0 && (
                <div>
                  <h4 style={{ margin: "0 0 12px", fontSize: "13px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", display: "flex", alignItems: "center", gap: "6px" }}>
                    <Pin size={14} color="#f59e0b" /> Pinned Documents
                  </h4>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "16px" }}>
                    {pinnedItems.map((item) => renderArticleCard(item))}
                  </div>
                </div>
              )}

              {/* ALL / REGULAR SECTION */}
              <div>
                {pinnedItems.length > 0 && (
                  <h4 style={{ margin: "0 0 12px", fontSize: "13px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
                    All Articles ({regularItems.length})
                  </h4>
                )}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "16px" }}>
                  {regularItems.map((item) => renderArticleCard(item))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ARTICLE READER MODAL */}
      {readingItem && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
          <div style={{ background: "var(--bg-card)", borderRadius: "14px", width: "100%", maxWidth: "850px", maxHeight: "90vh", display: "flex", flexDirection: "column", border: "1px solid var(--border-color)", boxShadow: "0 25px 50px -12px rgba(0,0,0,0.3)" }}>
            {/* HEADER */}
            <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--border-color)", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px" }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "8px", flexWrap: "wrap" }}>
                  <span style={{ fontSize: "11px", fontWeight: 600, color: "#2563eb", background: "#eff6ff", padding: "2px 8px", borderRadius: "4px" }}>
                    {readingItem.categoryRelation?.name || readingItem.category || "General"}
                  </span>
                  {visibilityBadge(readingItem.visibility_level)}
                  {readingItem.status === "draft" && (
                    <span style={{ fontSize: "11px", fontWeight: 600, color: "#d97706", background: "#fef3c7", padding: "2px 8px", borderRadius: "4px" }}>
                      Draft
                    </span>
                  )}
                  {readingItem.views_count > 0 && (
                    <span style={{ fontSize: "11px", color: "var(--text-muted)", display: "inline-flex", alignItems: "center", gap: "3px" }}>
                      <Eye size={12} /> {readingItem.views_count} views
                    </span>
                  )}
                </div>
                <h2 style={{ margin: 0, fontSize: "22px", fontWeight: 700, color: "var(--text-primary)" }}>
                  {readingItem.title}
                </h2>
                <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "6px", display: "flex", alignItems: "center", gap: "16px" }}>
                  <span>Author: <strong>{readingItem.creator?.name || "System"}</strong></span>
                  <span>Updated: {new Date(readingItem.updated_at || readingItem.created_at).toLocaleDateString()}</span>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                {(readingItem.created_by === user.id || ["admin", "manager"].includes(user.role)) && (
                  <button
                    onClick={() => {
                      const id = readingItem.id;
                      setReadingItem(null);
                      navigate(rolePath(`knowledge-base/edit/${id}`));
                    }}
                    style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "6px 12px", borderRadius: "6px", border: "1px solid #bfdbfe", background: "#eff6ff", color: "#1d4ed8", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}
                  >
                    <Edit size={14} /> Edit
                  </button>
                )}
                <button
                  onClick={() => setReadingItem(null)}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: "4px" }}
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* BODY */}
            <div style={{ padding: "24px", overflowY: "auto", flex: 1, fontSize: "15px", lineHeight: "1.75", color: "var(--text-primary)" }}>
              {readingItem.content ? (
                <div
                  className="kb-rendered-html"
                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(readingItem.content) }}
                />
              ) : (
                <p style={{ color: "var(--text-muted)", fontStyle: "italic" }}>No document body provided.</p>
              )}

              {/* TAGS */}
              {Array.isArray(readingItem.tags) && readingItem.tags.length > 0 && (
                <div style={{ marginTop: "24px", paddingTop: "16px", borderTop: "1px solid var(--border-color)", display: "flex", gap: "6px", flexWrap: "wrap" }}>
                  {readingItem.tags.map((t, idx) => (
                    <span key={idx} className="kb-tag-pill">#{t}</span>
                  ))}
                </div>
              )}

              {/* ATTACHMENT */}
              {readingItem.file_path && (
                <div style={{ marginTop: "20px", padding: "12px 16px", background: "var(--bg-hover)", borderRadius: "8px", border: "1px solid var(--border-color)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "13px" }}>
                    <Paperclip color="#2563eb" size={18} />
                    <span style={{ fontWeight: 500 }}>{readingItem.file_name || readingItem.file_path.split("/").pop()}</span>
                  </div>
                  <a
                    href={`${API_URL}/storage/${readingItem.file_path}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "6px 14px", borderRadius: "6px", background: "#2563eb", color: "#ffffff", fontSize: "12px", fontWeight: 600, textDecoration: "none" }}
                  >
                    <Download size={14} /> Download
                  </a>
                </div>
              )}

              {/* REFERENCE / EXTERNAL LINK */}
              {readingItem.reference_link && (
                <div style={{ marginTop: "16px", padding: "12px 16px", background: "var(--bg-hover)", borderRadius: "8px", border: "1px solid var(--border-color)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "13px", minWidth: 0, flex: 1, marginRight: "12px" }}>
                    <ExternalLink color="#2563eb" size={18} style={{ flexShrink: 0 }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase" }}>Reference Link</div>
                      <a
                        href={readingItem.reference_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: "#2563eb", textDecoration: "none", fontWeight: 500, wordBreak: "break-all" }}
                      >
                        {readingItem.reference_link}
                      </a>
                    </div>
                  </div>
                  <a
                    href={readingItem.reference_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "6px 14px", borderRadius: "6px", background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe", fontSize: "12px", fontWeight: 600, textDecoration: "none", flexShrink: 0 }}
                  >
                    Open Link <ExternalLink size={13} />
                  </a>
                </div>
              )}
            </div>

            {/* FOOTER */}
            <div style={{ padding: "14px 24px", borderTop: "1px solid var(--border-color)", display: "flex", justifyContent: "flex-end" }}>
              <button
                onClick={() => setReadingItem(null)}
                style={{ padding: "8px 18px", borderRadius: "6px", border: "1px solid var(--border-color)", background: "var(--bg-hover)", color: "var(--text-primary)", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CREATE CATEGORY MODAL */}
      {categoryModalOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
          <div style={{ background: "var(--bg-card)", borderRadius: "12px", width: "100%", maxWidth: "460px", border: "1px solid var(--border-color)", padding: "20px", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 600 }}>Create Knowledge Base Category</h3>
              <button onClick={() => setCategoryModalOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)" }}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateCategory} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div>
                <label style={{ fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                  Category Name <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Design System & UI Specs"
                  value={newCatForm.name}
                  onChange={(e) => setNewCatForm((p) => ({ ...p, name: e.target.value }))}
                  style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid var(--border-color)", background: "var(--bg-card)", color: "var(--text-primary)", fontSize: "13px" }}
                  required
                />
              </div>

              <div>
                <label style={{ fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "4px" }}>Description</label>
                <textarea
                  placeholder="Short description of articles filed in this category..."
                  value={newCatForm.description}
                  onChange={(e) => setNewCatForm((p) => ({ ...p, description: e.target.value }))}
                  rows={3}
                  style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid var(--border-color)", background: "var(--bg-card)", color: "var(--text-primary)", fontSize: "13px" }}
                />
              </div>

              <div>
                <label style={{ fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "4px" }}>Theme Color</label>
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  {["#3b82f6", "#10b981", "#8b5cf6", "#f59e0b", "#06b6d4", "#ec4899", "#ef4444"].map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setNewCatForm((p) => ({ ...p, color: c }))}
                      style={{
                        width: "26px",
                        height: "26px",
                        borderRadius: "50%",
                        background: c,
                        border: newCatForm.color === c ? "2px solid #000000" : "2px solid transparent",
                        cursor: "pointer",
                      }}
                    />
                  ))}
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "10px" }}>
                <button
                  type="button"
                  onClick={() => setCategoryModalOpen(false)}
                  style={{ padding: "8px 16px", borderRadius: "6px", border: "1px solid var(--border-color)", background: "var(--bg-hover)", color: "var(--text-primary)", fontSize: "13px", cursor: "pointer" }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={catLoading}
                  style={{ padding: "8px 20px", borderRadius: "6px", border: "none", background: "#2563eb", color: "#ffffff", fontSize: "13px", fontWeight: 600, cursor: catLoading ? "not-allowed" : "pointer" }}
                >
                  {catLoading ? "Creating..." : "Create Category"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      <ConfirmModal
        isOpen={!!deletingItem}
        onClose={() => setDeletingItem(null)}
        onConfirm={handleDeleteConfirm}
        title="Delete Knowledge Article"
        message={`Are you sure you want to delete "${deletingItem?.title}"? All versions and permissions will be permanently removed.`}
        confirmText="Delete"
        cancelText="Cancel"
        danger
      />
    </DashboardLayout>
  );

  function renderArticleCard(item) {
    const canEditDelete = item.created_by === user.id || ["admin", "manager"].includes(user.role);

    return (
      <div key={item.id} className="kb-card">
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px", gap: "8px" }}>
            <span
              style={{
                fontSize: "11px",
                fontWeight: 600,
                color: item.categoryRelation?.color || "#2563eb",
                background: "#eff6ff",
                padding: "2px 8px",
                borderRadius: "4px",
              }}
            >
              {item.categoryRelation?.name || item.category || "General"}
            </span>

            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              {item.is_pinned && <Pin size={14} color="#f59e0b" style={{ fill: "#f59e0b" }} />}
              {visibilityBadge(item.visibility_level)}
            </div>
          </div>

          <h3
            onClick={() => setReadingItem(item)}
            style={{ margin: "0 0 8px", fontSize: "16px", fontWeight: 600, color: "var(--text-primary)", cursor: "pointer", lineHeight: "1.3" }}
          >
            {item.title}
          </h3>

          <p
            style={{
              margin: "0 0 14px",
              fontSize: "13px",
              color: "var(--text-secondary)",
              minHeight: "38px",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
              lineHeight: "1.45",
            }}
          >
            {getCleanSnippet(item.content)}
          </p>

          {Array.isArray(item.tags) && item.tags.length > 0 && (
            <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", marginBottom: "12px" }}>
              {item.tags.slice(0, 3).map((t, idx) => (
                <span key={idx} className="kb-tag-pill">#{t}</span>
              ))}
              {item.tags.length > 3 && (
                <span className="kb-tag-pill">+{item.tags.length - 3}</span>
              )}
            </div>
          )}

          <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <User size={12} /> {item.creator?.name || "System User"}
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              {item.views_count > 0 && (
                <span style={{ display: "flex", alignItems: "center", gap: "3px" }}>
                  <Eye size={12} /> {item.views_count}
                </span>
              )}
              {item.file_path && (
                <span style={{ color: "#2563eb", display: "flex", alignItems: "center", gap: "2px" }} title="Has Attachment">
                  <Paperclip size={12} />
                </span>
              )}
              {item.reference_link && (
                <span style={{ color: "#2563eb", display: "flex", alignItems: "center", gap: "2px" }} title="Has External Reference">
                  <ExternalLink size={12} />
                </span>
              )}
            </div>
          </div>
        </div>

        {/* FOOTER ACTIONS */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: "12px", borderTop: "1px solid var(--border-color)" }}>
          <div style={{ display: "flex", gap: "6px" }}>
            {canEditDelete && (
              <>
                <button
                  onClick={() => navigate(rolePath(`knowledge-base/edit/${item.id}`))}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: "4px" }}
                  title="Edit in Rich-Text Editor"
                >
                  <Edit size={16} />
                </button>
                <button
                  onClick={() => setDeletingItem(item)}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", padding: "4px" }}
                  title="Delete Document"
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
            <BookOpen size={14} /> Read
          </button>
        </div>
      </div>
    );
  }
}
