import React, { useState, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "../components/layout/DashboardLayout";
import Breadcrumb from "../components/Breadcrumb";
import ConfirmModal from "../components/ConfirmModal";
import ShareKnowledgeModal from "../components/ShareKnowledgeModal";
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
  Star,
  Copy,
  Archive,
  RotateCcw,
  Share2,
  MoreVertical,
  Filter,
  Briefcase,
  Calendar,
  RotateCw,
} from "lucide-react";

export default function KnowledgeBaseList() {
  const { t } = useTranslation();
  const user = getUser();
  const notify = useNotification();
  const navigate = useNavigate();

  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [teams, setTeams] = useState([]);
  const [projects, setProjects] = useState([]);
  const [authors, setAuthors] = useState([]);
  const [loading, setLoading] = useState(true);

  // ── Filters State ──────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [teamFilter, setTeamFilter] = useState("all");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const [authorFilter, setAuthorFilter] = useState("all");
  const [visibilityFilter, setVisibilityFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  // ── Action Menus & Modals State ───────────────────────────
  const [openMenuId, setOpenMenuId] = useState(null);
  const [deletingItem, setDeletingItem] = useState(null);
  const [archivingItem, setArchivingItem] = useState(null);
  const [restoringItem, setRestoringItem] = useState(null);
  const [sharingItem, setSharingItem] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  // ── New Category Modal State ──────────────────────────────
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [newCatForm, setNewCatForm] = useState({ name: "", description: "", color: "#3b82f6" });
  const [catLoading, setCatLoading] = useState(false);

  // Close 3-dot dropdowns when clicking outside
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (!e.target.closest(".kb-action-dropdown-wrapper")) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  // Fetch Lookups (Categories, Teams, Projects, Users)
  const fetchLookups = async () => {
    const token = authToken();
    if (!token) return;

    try {
      fetch(`${API_URL}/kb-categories`, {
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
        skipLoader: true,
      })
        .then((r) => (r.ok ? r.json() : []))
        .then((d) => setCategories(Array.isArray(d?.data) ? d.data : []))
        .catch(() => {});

      fetch(`${API_URL}/teams`, {
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
        skipLoader: true,
      })
        .then((r) => (r.ok ? r.json() : []))
        .then((d) => setTeams(Array.isArray(d?.data) ? d.data : Array.isArray(d) ? d : []))
        .catch(() => {});

      fetch(`${API_URL}/projects?all=1`, {
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
        skipLoader: true,
      })
        .then((r) => (r.ok ? r.json() : []))
        .then((d) => setProjects(Array.isArray(d?.data) ? d.data : Array.isArray(d) ? d : []))
        .catch(() => {});

      fetch(`${API_URL}/users?all=1`, {
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
        skipLoader: true,
      })
        .then((r) => (r.ok ? r.json() : []))
        .then((d) => {
          const uList = Array.isArray(d?.data) ? d.data : Array.isArray(d?.users) ? d.users : Array.isArray(d) ? d : [];
          setAuthors(uList);
        })
        .catch(() => {});
    } catch (e) {
      console.error("Error fetching lookups", e);
    }
  };

  // Merge explicitly fetched users with unique creators from loaded items
  const combinedAuthors = useMemo(() => {
    const map = new Map();
    authors.forEach((u) => {
      if (u && u.id) map.set(String(u.id), u);
    });
    items.forEach((item) => {
      if (item.creator && item.creator.id) {
        if (!map.has(String(item.creator.id))) {
          map.set(String(item.creator.id), item.creator);
        }
      }
      if (item.created_by && !map.has(String(item.created_by))) {
        map.set(String(item.created_by), { id: item.created_by, name: item.creator?.name || `User #${item.created_by}` });
      }
    });
    return Array.from(map.values());
  }, [authors, items]);

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
      notify.error(t("Failed to load knowledge base articles.", { defaultValue: "Failed to load knowledge base articles." }));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLookups();
    fetchItems();
  }, []);

  // ── Action Handlers ────────────────────────────────────────

  // Toggle Favorite
  const handleToggleFavorite = async (item, e) => {
    if (e) e.stopPropagation();
    try {
      const token = authToken();
      // Optimistic update
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, is_favorited: !i.is_favorited } : i))
      );

      const res = await fetch(`${API_URL}/knowledge-base/${item.id}/favorite`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      });
      const data = await res.json();
      if (res.ok && data.success) {
        notify.success(
          data.is_favorited
            ? t("Added to favorites!", { defaultValue: "Added to favorites!" })
            : t("Removed from favorites.", { defaultValue: "Removed from favorites." })
        );
      } else {
        // Rollback
        setItems((prev) =>
          prev.map((i) => (i.id === item.id ? { ...i, is_favorited: item.is_favorited } : i))
        );
        notify.error(data.message || t("Failed to update favorite status.", { defaultValue: "Failed to update favorite status." }));
      }
    } catch (err) {
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, is_favorited: item.is_favorited } : i))
      );
      notify.error(t("Error updating favorite status.", { defaultValue: "Error updating favorite status." }));
    }
  };

  // Duplicate Article
  const handleDuplicate = async (item) => {
    setOpenMenuId(null);
    setActionLoading(true);
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/knowledge-base/${item.id}/duplicate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      });
      const data = await res.json();
      if (res.ok && data.success) {
        notify.success(t("Article duplicated successfully as draft!", { defaultValue: "Article duplicated successfully as draft!" }));
        fetchItems();
      } else {
        notify.error(data.message || t("Failed to duplicate article.", { defaultValue: "Failed to duplicate article." }));
      }
    } catch (err) {
      notify.error(t("Error duplicating article.", { defaultValue: "Error duplicating article." }));
    } finally {
      setActionLoading(false);
    }
  };

  // Archive Article Confirm
  const handleArchiveConfirm = async () => {
    if (!archivingItem) return;
    setActionLoading(true);
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/knowledge-base/${archivingItem.id}/archive`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      });
      const data = await res.json();
      if (res.ok && data.success) {
        notify.success(t("Article archived successfully.", { defaultValue: "Article archived successfully." }));
        fetchItems();
      } else {
        notify.error(data.message || t("Failed to archive article.", { defaultValue: "Failed to archive article." }));
      }
    } catch (err) {
      notify.error(t("Error archiving article.", { defaultValue: "Error archiving article." }));
    } finally {
      setActionLoading(false);
      setArchivingItem(null);
    }
  };

  // Restore Article Confirm
  const handleRestoreConfirm = async () => {
    if (!restoringItem) return;
    setActionLoading(true);
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/knowledge-base/${restoringItem.id}/restore`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      });
      const data = await res.json();
      if (res.ok && data.success) {
        notify.success(t("Article restored successfully.", { defaultValue: "Article restored successfully." }));
        fetchItems();
      } else {
        notify.error(data.message || t("Failed to restore article.", { defaultValue: "Failed to restore article." }));
      }
    } catch (err) {
      notify.error(t("Error restoring article.", { defaultValue: "Error restoring article." }));
    } finally {
      setActionLoading(false);
      setRestoringItem(null);
    }
  };

  // Download Attachment via Authenticated Blob
  const handleDownload = async (item) => {
    setOpenMenuId(null);
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/knowledge-base/${item.id}/download`, {
        headers: {
          Accept: "application/json, */*",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        skipLoader: true,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        notify.error(err?.message || t("Failed to download attachment.", { defaultValue: "Failed to download attachment." }));
        return;
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = item.file_name || (item.file_path ? item.file_path.split("/").pop() : `kb-attachment-${item.id}`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      notify.success(t("Download completed.", { defaultValue: "Download completed." }));
    } catch (e) {
      console.error("Download failed", e);
      notify.error(t("Download failed.", { defaultValue: "Download failed." }));
    }
  };

  // Delete Article Confirm
  const handleDeleteConfirm = async () => {
    if (!deletingItem) return;
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/knowledge-base/${deletingItem.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      });
      if (res.ok) {
        notify.success(t("Knowledge article deleted successfully.", { defaultValue: "Knowledge article deleted successfully." }));
        fetchItems();
      } else {
        notify.error(t("Failed to delete article.", { defaultValue: "Failed to delete article." }));
      }
    } catch (e) {
      notify.error(t("An error occurred while deleting article.", { defaultValue: "An error occurred while deleting article." }));
    } finally {
      setDeletingItem(null);
    }
  };

  // Create Category
  const handleCreateCategory = async (e) => {
    e.preventDefault();
    if (!newCatForm.name.trim()) {
      notify.error(t("Category name is required.", { defaultValue: "Category name is required." }));
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
        notify.success(t("Category created successfully!", { defaultValue: "Category created successfully!" }));
        setNewCatForm({ name: "", description: "", color: "#3b82f6" });
        setCategoryModalOpen(false);
        fetchLookups();
      } else {
        notify.error(data.message || t("Failed to create category.", { defaultValue: "Failed to create category." }));
      }
    } catch (e) {
      notify.error(t("Error creating category.", { defaultValue: "Error creating category." }));
    } finally {
      setCatLoading(false);
    }
  };

  // Reset all filters
  const resetFilters = () => {
    setSearch("");
    setSelectedCategory("all");
    setTeamFilter("all");
    setDepartmentFilter("all");
    setProjectFilter("all");
    setAuthorFilter("all");
    setVisibilityFilter("all");
    setStatusFilter("all");
    setDateFrom("");
    setDateTo("");
    setFavoritesOnly(false);
  };

  const isAnyFilterActive =
    search !== "" ||
    selectedCategory !== "all" ||
    teamFilter !== "all" ||
    departmentFilter !== "all" ||
    projectFilter !== "all" ||
    authorFilter !== "all" ||
    visibilityFilter !== "all" ||
    statusFilter !== "all" ||
    dateFrom !== "" ||
    dateTo !== "" ||
    favoritesOnly;

  // ── Comprehensive Filtering Engine ───────────────────────────
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const searchLower = search.toLowerCase();

      // Multi-field search
      const titleMatch = item.title?.toLowerCase().includes(searchLower);
      const contentMatch = item.content?.toLowerCase().includes(searchLower);
      const catMatch =
        item.category?.toLowerCase().includes(searchLower) ||
        item.categoryRelation?.name?.toLowerCase().includes(searchLower);
      const tagsMatch = Array.isArray(item.tags) && item.tags.some((tItem) => tItem.toLowerCase().includes(searchLower));
      const authorMatch =
        item.creator?.name?.toLowerCase().includes(searchLower) ||
        item.creator?.email?.toLowerCase().includes(searchLower);
      const deptMatch = item.department?.toLowerCase().includes(searchLower);
      const projectMatch = item.project?.title?.toLowerCase().includes(searchLower);
      const statusMatch = item.status?.toLowerCase().includes(searchLower);
      const visibilityMatch = item.visibility_level?.toLowerCase().includes(searchLower);

      const matchesSearch =
        !search ||
        titleMatch ||
        contentMatch ||
        catMatch ||
        tagsMatch ||
        authorMatch ||
        deptMatch ||
        projectMatch ||
        statusMatch ||
        visibilityMatch;

      // Category filter
      const matchesCategory =
        selectedCategory === "all" ||
        item.category_id === Number(selectedCategory) ||
        item.category === selectedCategory ||
        item.categoryRelation?.slug === selectedCategory;

      // Team filter
      const matchesTeam =
        teamFilter === "all" ||
        (Array.isArray(item.visibilities) && item.visibilities.some((v) => String(v.team_id) === String(teamFilter))) ||
        String(item.project?.team_id) === String(teamFilter);

      // Sub-team / Department filter
      const matchesDepartment =
        departmentFilter === "all" ||
        (item.department && item.department.toLowerCase() === departmentFilter.toLowerCase()) ||
        (Array.isArray(item.visibilities) &&
          item.visibilities.some((v) => v.department && v.department.toLowerCase() === departmentFilter.toLowerCase()));

      // Project filter
      const matchesProject = projectFilter === "all" || String(item.project_id) === String(projectFilter);

      // Author filter
      const matchesAuthor = authorFilter === "all" || String(item.created_by) === String(authorFilter);

      // Visibility filter
      const matchesVisibility = visibilityFilter === "all" || item.visibility_level === visibilityFilter;

      // Status filter
      const matchesStatus = statusFilter === "all" || item.status === statusFilter;

      // Date Range filter
      let matchesDate = true;
      if (dateFrom && item.created_at) {
        matchesDate = matchesDate && new Date(item.created_at) >= new Date(dateFrom);
      }
      if (dateTo && item.created_at) {
        matchesDate = matchesDate && new Date(item.created_at) <= new Date(`${dateTo}T23:59:59`);
      }

      // Favorites filter
      const matchesFavorites = !favoritesOnly || Boolean(item.is_favorited);

      return (
        matchesSearch &&
        matchesCategory &&
        matchesTeam &&
        matchesDepartment &&
        matchesProject &&
        matchesAuthor &&
        matchesVisibility &&
        matchesStatus &&
        matchesDate &&
        matchesFavorites
      );
    });
  }, [
    items,
    search,
    selectedCategory,
    teamFilter,
    departmentFilter,
    projectFilter,
    authorFilter,
    visibilityFilter,
    statusFilter,
    dateFrom,
    dateTo,
    favoritesOnly,
  ]);

  const pinnedItems = useMemo(() => filteredItems.filter((i) => i.is_pinned), [filteredItems]);
  const regularItems = useMemo(() => filteredItems.filter((i) => !i.is_pinned), [filteredItems]);

  const visibilityBadge = (level) => {
    switch (level) {
      case "private":
        return (
          <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "11px", fontWeight: 600, padding: "2px 8px", borderRadius: "12px", background: "#f3f4f6", color: "#4b5563" }}>
            <Lock size={12} /> {t("Private", { defaultValue: "Private" })}
          </span>
        );
      case "project_team":
        return (
          <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "11px", fontWeight: 600, padding: "2px 8px", borderRadius: "12px", background: "#eff6ff", color: "#1d4ed8" }}>
            <Users size={12} /> {t("Project Team", { defaultValue: "Project Team" })}
          </span>
        );
      case "team":
        return (
          <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "11px", fontWeight: 600, padding: "2px 8px", borderRadius: "12px", background: "#ede9fe", color: "#6d28d9" }}>
            <Users size={12} /> {t("Team", { defaultValue: "Team" })}
          </span>
        );
      case "department_team":
        return (
          <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "11px", fontWeight: 600, padding: "2px 8px", borderRadius: "12px", background: "#f0fdf4", color: "#15803d" }}>
            <Building size={12} /> {t("Department", { defaultValue: "Department" })}
          </span>
        );
      case "organization":
        return (
          <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "11px", fontWeight: 600, padding: "2px 8px", borderRadius: "12px", background: "#fef3c7", color: "#b45309" }}>
            <ShieldCheck size={12} /> {t("Organization", { defaultValue: "Organization" })}
          </span>
        );
      case "custom":
        return (
          <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "11px", fontWeight: 600, padding: "2px 8px", borderRadius: "12px", background: "#fdf2f8", color: "#be185d" }}>
            <Users size={12} /> {t("Custom", { defaultValue: "Custom" })}
          </span>
        );
      default:
        return null;
    }
  };

  const getCleanSnippet = (htmlContent) => {
    if (!htmlContent) return t("No document preview available.", { defaultValue: "No document preview available." });
    const temp = document.createElement("div");
    temp.innerHTML = htmlContent;
    return temp.textContent || temp.innerText || "";
  };

  const breadcrumbs = [
    { label: t("Reports", { defaultValue: "Reports" }), path: rolePath("reports") },
    { label: t("Knowledge Base", { defaultValue: "Knowledge Base" }) },
  ];

  return (
    <DashboardLayout>
      <Breadcrumb items={breadcrumbs} />

      {/* HEADER BAR */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <h2 style={{ fontSize: "22px", fontWeight: 700, margin: 0, display: "flex", alignItems: "center", gap: "8px" }}>
            <BookOpen size={24} color="#2563eb" /> {t("Knowledge Base & Documentation", { defaultValue: "Knowledge Base & Documentation" })}
          </h2>
          <p style={{ fontSize: "13px", color: "var(--text-secondary)", margin: "4px 0 0" }}>
            {t("Enterprise documentation, company SOPs, technical patterns, and guidelines.", { defaultValue: "Enterprise documentation, company SOPs, technical patterns, and guidelines." })}
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {/* FAVORITES ONLY TOGGLE */}
          <button
            type="button"
            onClick={() => setFavoritesOnly((p) => !p)}
            className={`kb-filter-pill-btn ${favoritesOnly ? "active" : ""}`}
            style={{
              background: favoritesOnly ? "#fef3c7" : "var(--bg-card)",
              borderColor: favoritesOnly ? "#f59e0b" : "var(--border-color)",
              color: favoritesOnly ? "#b45309" : "var(--text-secondary)",
            }}
          >
            <Star size={14} style={{ fill: favoritesOnly ? "#f59e0b" : "none", color: favoritesOnly ? "#f59e0b" : "inherit" }} />
            {t("Favorites", { defaultValue: "Favorites" })}
          </button>

          {/* ADVANCED FILTERS TOGGLE */}
          <button
            type="button"
            onClick={() => setShowAdvancedFilters((p) => !p)}
            className={`kb-filter-pill-btn ${showAdvancedFilters || isAnyFilterActive ? "active" : ""}`}
          >
            <Filter size={14} />
            {t("Filters", { defaultValue: "Filters" })}
            {isAnyFilterActive && (
              <span style={{ background: "#2563eb", color: "#fff", borderRadius: "50%", width: "6px", height: "6px", display: "inline-block" }} />
            )}
          </button>

          {/* CREATE ARTICLE BUTTON */}
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
            <Plus size={16} /> {t("New Document / Article", { defaultValue: "New Document / Article" })}
          </button>
        </div>
      </div>

      <div className="kb-container">
        {/* LEFT SIDEBAR: CATEGORIES & FILTER OPTIONS */}
        <div className="kb-sidebar">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "12px", fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", letterSpacing: "0.5px" }}>
              {t("Categories", { defaultValue: "Categories" })}
            </span>
            {["admin", "manager"].includes(user?.role) && (
              <button
                onClick={() => setCategoryModalOpen(true)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "#2563eb", display: "inline-flex", alignItems: "center", gap: "2px", fontSize: "12px", fontWeight: 600 }}
                title={t("Add Custom Category", { defaultValue: "Add Custom Category" })}
              >
                <Plus size={14} /> {t("Add", { defaultValue: "Add" })}
              </button>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <button
              onClick={() => setSelectedCategory("all")}
              className={`kb-category-item ${selectedCategory === "all" ? "active" : ""}`}
            >
              <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Layers size={16} /> {t("All Articles", { defaultValue: "All Articles" })}
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

          {/* QUICK SIDEBAR FILTERS (Visibility, Status, Reset) */}
          <div style={{ borderTop: "1px solid var(--border-color)", paddingTop: "14px", display: "flex", flexDirection: "column", gap: "10px" }}>
            <div className="kb-filter-field">
              <label>{t("Visibility / Access", { defaultValue: "Visibility / Access" })}</label>
              <select
                value={visibilityFilter}
                onChange={(e) => setVisibilityFilter(e.target.value)}
              >
                <option value="all">{t("All Visibilities", { defaultValue: "All Visibilities" })}</option>
                <option value="organization">{t("Organization", { defaultValue: "Organization" })}</option>
                <option value="department_team">{t("Department Team", { defaultValue: "Department Team" })}</option>
                <option value="project_team">{t("Project Team", { defaultValue: "Project Team" })}</option>
                <option value="team">{t("Team", { defaultValue: "Team" })}</option>
                <option value="custom">{t("Custom", { defaultValue: "Custom" })}</option>
                <option value="private">{t("Private (Only Me)", { defaultValue: "Private (Only Me)" })}</option>
              </select>
            </div>

            <div className="kb-filter-field">
              <label>{t("Status", { defaultValue: "Status" })}</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="all">{t("All Statuses", { defaultValue: "All Statuses" })}</option>
                <option value="published">{t("Published", { defaultValue: "Published" })}</option>
                <option value="draft">{t("Drafts", { defaultValue: "Drafts" })}</option>
                <option value="archived">{t("Archived", { defaultValue: "Archived" })}</option>
              </select>
            </div>

            {isAnyFilterActive && (
              <button
                type="button"
                onClick={resetFilters}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                  padding: "7px 12px",
                  borderRadius: "6px",
                  border: "1px solid var(--border-color)",
                  background: "var(--bg-hover)",
                  color: "var(--text-secondary)",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer",
                  marginTop: "6px",
                }}
              >
                <RotateCcw size={13} /> {t("Clear All Filters", { defaultValue: "Clear All Filters" })}
              </button>
            )}
          </div>
        </div>

        {/* RIGHT MAIN CONTENT AREA */}
        <div className="kb-content">
          {/* SEARCH BAR */}
          <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
            <div style={{ position: "relative", flex: 1 }}>
              <Search style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#9ca3af" }} size={16} />
              <input
                type="text"
                placeholder={t("Search by title, description, content, category, tags, author, date, status, or access level...", { defaultValue: "Search by title, description, content, category, tags, author, date, status, or access level..." })}
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
                  boxSizing: "border-box",
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

          {/* ADVANCED FILTER PANEL (TEAM, SUB-TEAM, PROJECT, AUTHOR, DATE) */}
          {showAdvancedFilters && (
            <div className="kb-advanced-filters-panel">
              {/* TEAM FILTER */}
              <div className="kb-filter-field">
                <label style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                  <Users size={12} /> {t("Team", { defaultValue: "Team" })}
                </label>
                <select value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)}>
                  <option value="all">{t("All Teams", { defaultValue: "All Teams" })}</option>
                  {teams.map((tm) => (
                    <option key={tm.id} value={String(tm.id)}>
                      {tm.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* SUB-TEAM / DEPARTMENT FILTER */}
              <div className="kb-filter-field">
                <label style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                  <Building size={12} /> {t("Sub-team / Dept", { defaultValue: "Sub-team / Dept" })}
                </label>
                <select value={departmentFilter} onChange={(e) => setDepartmentFilter(e.target.value)}>
                  <option value="all">{t("All Departments", { defaultValue: "All Departments" })}</option>
                  {["Engineering", "Design", "Product", "Marketing", "Sales", "Operations", "HR", "Support", "Management", "General"].map((dept) => (
                    <option key={dept} value={dept}>
                      {dept}
                    </option>
                  ))}
                </select>
              </div>

              {/* PROJECT FILTER */}
              <div className="kb-filter-field">
                <label style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                  <Briefcase size={12} /> {t("Project", { defaultValue: "Project" })}
                </label>
                <select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)}>
                  <option value="all">{t("All Projects", { defaultValue: "All Projects" })}</option>
                  {projects.map((pr) => (
                    <option key={pr.id} value={String(pr.id)}>
                      {pr.title}
                    </option>
                  ))}
                </select>
              </div>

              {/* AUTHOR FILTER */}
              <div className="kb-filter-field">
                <label style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                  <User size={12} /> {t("Author", { defaultValue: "Author" })}
                </label>
                <select value={authorFilter} onChange={(e) => setAuthorFilter(e.target.value)}>
                  <option value="all">{t("All Authors", { defaultValue: "All Authors" })}</option>
                  {combinedAuthors.map((ath) => (
                    <option key={ath.id} value={String(ath.id)}>
                      {ath.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* DATE FROM */}
              <div className="kb-filter-field">
                <label style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                  <Calendar size={12} /> {t("Date From", { defaultValue: "Date From" })}
                </label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
              </div>

              {/* DATE TO */}
              <div className="kb-filter-field">
                <label style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                  <Calendar size={12} /> {t("Date To", { defaultValue: "Date To" })}
                </label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* MAIN ARTICLES LIST */}
          {loading ? (
            <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text-secondary)" }}>
              {t("Loading knowledge base...", { defaultValue: "Loading knowledge base..." })}
            </div>
          ) : filteredItems.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 20px", background: "var(--bg-card)", borderRadius: "12px", border: "1px solid var(--border-color)" }}>
              <BookOpen size={48} style={{ color: "#9ca3af", marginBottom: "12px" }} />
              <h3 style={{ margin: "0 0 6px", fontSize: "16px", fontWeight: 600 }}>{t("No articles found", { defaultValue: "No articles found" })}</h3>
              <p style={{ margin: "0 0 16px", fontSize: "13px", color: "var(--text-secondary)" }}>
                {isAnyFilterActive
                  ? t("No articles match your active filter criteria. Try clearing some filters.", { defaultValue: "No articles match your active filter criteria. Try clearing some filters." })
                  : t("Get started by creating your first rich-text documentation or guidelines.", { defaultValue: "Get started by creating your first rich-text documentation or guidelines." })}
              </p>
              {isAnyFilterActive ? (
                <button
                  onClick={resetFilters}
                  style={{ padding: "8px 16px", borderRadius: "6px", background: "var(--bg-hover)", color: "var(--text-primary)", border: "1px solid var(--border-color)", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
                >
                  <RotateCcw size={14} style={{ display: "inline", verticalAlign: "-2px", marginRight: "4px" }} /> {t("Reset Filters", { defaultValue: "Reset Filters" })}
                </button>
              ) : (
                <button
                  onClick={() => navigate(rolePath("knowledge-base/create"))}
                  style={{ padding: "8px 16px", borderRadius: "6px", background: "#2563eb", color: "#ffffff", border: "none", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
                >
                  <Plus size={14} style={{ display: "inline", verticalAlign: "-2px", marginRight: "4px" }} /> {t("Create Document", { defaultValue: "Create Document" })}
                </button>
              )}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
              {/* PINNED SECTION */}
              {pinnedItems.length > 0 && (
                <div>
                  <h4 style={{ margin: "0 0 12px", fontSize: "13px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", display: "flex", alignItems: "center", gap: "6px" }}>
                    <Pin size={14} color="#f59e0b" /> {t("Pinned Documents", { defaultValue: "Pinned Documents" })}
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
                    {t("All Articles ({{count}})", { count: regularItems.length, defaultValue: `All Articles (${regularItems.length})` })}
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

      {/* CREATE CATEGORY MODAL */}
      {categoryModalOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
          <div style={{ background: "var(--bg-card)", borderRadius: "12px", width: "100%", maxWidth: "460px", border: "1px solid var(--border-color)", padding: "20px", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 600 }}>{t("Create Knowledge Base Category", { defaultValue: "Create Knowledge Base Category" })}</h3>
              <button onClick={() => setCategoryModalOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)" }}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateCategory} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div>
                <label style={{ fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                  {t("Category Name", { defaultValue: "Category Name" })} <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <input
                  type="text"
                  placeholder={t("e.g. Design System & UI Specs", { defaultValue: "e.g. Design System & UI Specs" })}
                  value={newCatForm.name}
                  onChange={(e) => setNewCatForm((p) => ({ ...p, name: e.target.value }))}
                  style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid var(--border-color)", background: "var(--bg-card)", color: "var(--text-primary)", fontSize: "13px" }}
                  required
                />
              </div>

              <div>
                <label style={{ fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "4px" }}>{t("Description", { defaultValue: "Description" })}</label>
                <textarea
                  placeholder={t("Short description of articles filed in this category...", { defaultValue: "Short description of articles filed in this category..." })}
                  value={newCatForm.description}
                  onChange={(e) => setNewCatForm((p) => ({ ...p, description: e.target.value }))}
                  rows={3}
                  style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid var(--border-color)", background: "var(--bg-card)", color: "var(--text-primary)", fontSize: "13px" }}
                />
              </div>

              <div>
                <label style={{ fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "4px" }}>{t("Theme Color", { defaultValue: "Theme Color" })}</label>
                {(() => {
                  const PRESET_COLORS_KB = ["#3b82f6", "#10b981", "#8b5cf6", "#f59e0b", "#06b6d4", "#ec4899", "#ef4444"];
                  return (
                    <div style={{ display: "flex", gap: "7px", alignItems: "center", flexWrap: "wrap" }}>
                      {PRESET_COLORS_KB.map((c) => (
                        <button
                          key={c}
                          type="button"
                          title={c}
                          onClick={() => setNewCatForm((p) => ({ ...p, color: c }))}
                          style={{
                            width: "26px",
                            height: "26px",
                            borderRadius: "50%",
                            background: c,
                            border: newCatForm.color === c ? "3px solid #0f172a" : "2px solid transparent",
                            outline: newCatForm.color === c ? "2px solid #fff" : "none",
                            outlineOffset: "-4px",
                            cursor: "pointer",
                            flexShrink: 0,
                            transition: "border 0.15s, outline 0.15s",
                          }}
                        />
                      ))}
                      <label
                        title={t("Pick custom color", { defaultValue: "Pick custom color" })}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "5px",
                          padding: "3px 9px",
                          borderRadius: "20px",
                          border: !PRESET_COLORS_KB.includes(newCatForm.color) ? "2px solid #0f172a" : "1px solid var(--border-color, #cbd5e1)",
                          background: !PRESET_COLORS_KB.includes(newCatForm.color) ? newCatForm.color : "var(--bg-hover, #f8fafc)",
                          color: !PRESET_COLORS_KB.includes(newCatForm.color) ? "#fff" : "var(--text-secondary, #64748b)",
                          fontSize: "11px",
                          fontWeight: 600,
                          cursor: "pointer",
                          flexShrink: 0,
                          transition: "all 0.15s",
                        }}
                      >
                        <input
                          type="color"
                          value={newCatForm.color || "#3b82f6"}
                          onChange={(e) => setNewCatForm((p) => ({ ...p, color: e.target.value }))}
                          style={{ position: "absolute", opacity: 0, width: 0, height: 0, pointerEvents: "none" }}
                          tabIndex={-1}
                          aria-hidden="true"
                        />
                        🎨 {!PRESET_COLORS_KB.includes(newCatForm.color) ? (newCatForm.color || "").toUpperCase() : t("Custom", { defaultValue: "Custom" })}
                      </label>
                    </div>
                  );
                })()}
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "10px" }}>
                <button
                  type="button"
                  onClick={() => setCategoryModalOpen(false)}
                  style={{ padding: "8px 16px", borderRadius: "6px", border: "1px solid var(--border-color)", background: "var(--bg-hover)", color: "var(--text-primary)", fontSize: "13px", cursor: "pointer" }}
                >
                  {t("Cancel", { defaultValue: "Cancel" })}
                </button>
                <button
                  type="submit"
                  disabled={catLoading}
                  style={{ padding: "8px 20px", borderRadius: "6px", border: "none", background: "#2563eb", color: "#ffffff", fontSize: "13px", fontWeight: 600, cursor: catLoading ? "not-allowed" : "pointer" }}
                >
                  {catLoading ? t("Creating...", { defaultValue: "Creating..." }) : t("Create Category", { defaultValue: "Create Category" })}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SHARE MODAL */}
      <ShareKnowledgeModal
        isOpen={Boolean(sharingItem)}
        onClose={() => setSharingItem(null)}
        article={sharingItem}
      />

      {/* ARCHIVE CONFIRMATION MODAL */}
      <ConfirmModal
        isOpen={Boolean(archivingItem)}
        onClose={() => setArchivingItem(null)}
        onConfirm={handleArchiveConfirm}
        title={t("Archive Knowledge Article", { defaultValue: "Archive Knowledge Article" })}
        message={t("Are you sure you want to archive \"{{title}}\"? It will be hidden from the active list.", { title: archivingItem?.title, defaultValue: `Are you sure you want to archive "${archivingItem?.title}"? It will be hidden from the active list.` })}
        confirmText={t("Archive", { defaultValue: "Archive" })}
        cancelText={t("Cancel", { defaultValue: "Cancel" })}
      />

      {/* RESTORE CONFIRMATION MODAL */}
      <ConfirmModal
        isOpen={Boolean(restoringItem)}
        onClose={() => setRestoringItem(null)}
        onConfirm={handleRestoreConfirm}
        title={t("Restore Knowledge Article", { defaultValue: "Restore Knowledge Article" })}
        message={t("Restore \"{{title}}\" back to published status?", { title: restoringItem?.title, defaultValue: `Restore "${restoringItem?.title}" back to published status?` })}
        confirmText={t("Restore", { defaultValue: "Restore" })}
        cancelText={t("Cancel", { defaultValue: "Cancel" })}
      />

      {/* DELETE CONFIRMATION MODAL */}
      <ConfirmModal
        isOpen={!!deletingItem}
        onClose={() => setDeletingItem(null)}
        onConfirm={handleDeleteConfirm}
        title={t("Delete Knowledge Article", { defaultValue: "Delete Knowledge Article" })}
        message={t("Are you sure you want to delete \"{{title}}\"? All versions and permissions will be permanently removed.", { title: deletingItem?.title, defaultValue: `Are you sure you want to delete "${deletingItem?.title}"? All versions and permissions will be permanently removed.` })}
        confirmText={t("Delete", { defaultValue: "Delete" })}
        cancelText={t("Cancel", { defaultValue: "Cancel" })}
        danger
      />
    </DashboardLayout>
  );

  // ── Render Individual Article Card ───────────────────────────
  function renderArticleCard(item) {
    const isMenuOpen = openMenuId === item.id;

    const canEdit =
      item.user_permissions?.can_edit ??
      (item.created_by === user?.id || ["admin", "manager"].includes(user?.role));
    const canDelete =
      item.user_permissions?.can_delete ??
      (item.created_by === user?.id || ["admin", "manager"].includes(user?.role));
    const canDuplicate = item.user_permissions?.can_duplicate ?? user?.role !== "guest";
    const canArchive = item.user_permissions?.can_archive ?? canEdit;
    const canRestore = item.user_permissions?.can_restore ?? canEdit;
    const canShare = item.user_permissions?.can_share ?? true;
    const canDownload = Boolean(item.file_path);

    return (
      <div key={item.id} className="kb-card">
        <div>
          {/* CARD TOP HEADER: CATEGORY, PIN, VISIBILITY, FAVORITE */}
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
              {item.categoryRelation?.name || item.category || ""}
            </span>

            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              {item.is_pinned && <Pin size={14} color="#f59e0b" style={{ fill: "#f59e0b" }} />}
              {visibilityBadge(item.visibility_level)}

              {/* FAVORITE STAR BUTTON */}
              <button
                type="button"
                className={`kb-fav-star-btn ${item.is_favorited ? "active" : ""}`}
                onClick={(e) => handleToggleFavorite(item, e)}
                title={item.is_favorited ? t("Remove from favorites", { defaultValue: "Remove from favorites" }) : t("Add to favorites", { defaultValue: "Add to favorites" })}
              >
                <Star size={15} />
              </button>
            </div>
          </div>

          {/* TITLE */}
          <h3
            onClick={() => navigate(rolePath(`knowledge-base/${item.id}`))}
            style={{ margin: "0 0 8px", fontSize: "16px", fontWeight: 600, color: "var(--text-primary)", cursor: "pointer", lineHeight: "1.3" }}
          >
            {item.title}
          </h3>

          {/* CONTENT SNIPPET */}
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

          {/* TAGS */}
          {Array.isArray(item.tags) && item.tags.length > 0 && (
            <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", marginBottom: "12px" }}>
              {item.tags.slice(0, 3).map((tItem, idx) => (
                <span key={idx} className="kb-tag-pill">#{tItem}</span>
              ))}
              {item.tags.length > 3 && (
                <span className="kb-tag-pill">+{item.tags.length - 3}</span>
              )}
            </div>
          )}

          {/* METADATA: AUTHOR, VIEWS, ATTACHMENT, REFERENCE */}
          <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <User size={12} /> {item.creator?.name || t("System User", { defaultValue: "System User" })}
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              {item.status === "archived" && (
                <span style={{ fontSize: "10px", fontWeight: 600, padding: "1px 6px", borderRadius: "8px", background: "#fef2f2", color: "#dc2626" }}>
                  {t("Archived", { defaultValue: "Archived" })}
                </span>
              )}
              {item.status === "draft" && (
                <span style={{ fontSize: "10px", fontWeight: 600, padding: "1px 6px", borderRadius: "8px", background: "#f3f4f6", color: "#4b5563" }}>
                  {t("Draft", { defaultValue: "Draft" })}
                </span>
              )}
              {item.views_count > 0 && (
                <span style={{ display: "flex", alignItems: "center", gap: "3px" }}>
                  <Eye size={12} /> {item.views_count}
                </span>
              )}
              {item.file_path && (
                <span style={{ color: "#2563eb", display: "flex", alignItems: "center", gap: "2px" }} title={t("Has Attachment", { defaultValue: "Has Attachment" })}>
                  <Paperclip size={12} />
                </span>
              )}
              {item.reference_link && (
                <span style={{ color: "#2563eb", display: "flex", alignItems: "center", gap: "2px" }} title={t("Has External Reference", { defaultValue: "Has External Reference" })}>
                  <ExternalLink size={12} />
                </span>
              )}
            </div>
          </div>
        </div>

        {/* FOOTER ACTIONS */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: "12px", borderTop: "1px solid var(--border-color)" }}>
          {/* ACTION BUTTONS & 3-DOT MENU */}
          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            {canEdit && (
              <button
                onClick={() => navigate(rolePath(`knowledge-base/edit/${item.id}`))}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: "5px" }}
                title={t("Edit in Rich-Text Editor", { defaultValue: "Edit in Rich-Text Editor" })}
              >
                <Edit size={15} />
              </button>
            )}

            {/* 3-DOT DROPDOWN WRAPPER */}
            <div className="kb-action-dropdown-wrapper">
              <button
                type="button"
                className="kb-action-trigger-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenMenuId(isMenuOpen ? null : item.id);
                }}
                title={t("More actions", { defaultValue: "More actions" })}
              >
                <MoreVertical size={16} />
              </button>

              {/* 3-DOT POPUP MENU */}
              {isMenuOpen && (
                <div className="kb-action-menu">
                  {/* DUPLICATE */}
                  {canDuplicate && (
                    <button
                      type="button"
                      className="kb-action-menu-item"
                      onClick={() => handleDuplicate(item)}
                    >
                      <Copy size={14} color="#6366f1" />
                      <span>{t("Duplicate Article", { defaultValue: "Duplicate Article" })}</span>
                    </button>
                  )}

                  {/* SHARE INTERNALLY */}
                  {canShare && (
                    <button
                      type="button"
                      className="kb-action-menu-item"
                      onClick={() => {
                        setOpenMenuId(null);
                        setSharingItem(item);
                      }}
                    >
                      <Share2 size={14} color="#2563eb" />
                      <span>{t("Share Internally", { defaultValue: "Share Internally" })}</span>
                    </button>
                  )}

                  {/* DOWNLOAD ATTACHMENT */}
                  {canDownload && (
                    <button
                      type="button"
                      className="kb-action-menu-item"
                      onClick={() => handleDownload(item)}
                    >
                      <Download size={14} color="#059669" />
                      <span>{t("Download Attachment", { defaultValue: "Download Attachment" })}</span>
                    </button>
                  )}

                  {/* TOGGLE FAVORITE */}
                  <button
                    type="button"
                    className="kb-action-menu-item"
                    onClick={(e) => {
                      setOpenMenuId(null);
                      handleToggleFavorite(item, e);
                    }}
                  >
                    <Star size={14} color="#f59e0b" style={{ fill: item.is_favorited ? "#f59e0b" : "none" }} />
                    <span>
                      {item.is_favorited
                        ? t("Remove from Favorites", { defaultValue: "Remove from Favorites" })
                        : t("Add to Favorites", { defaultValue: "Add to Favorites" })}
                    </span>
                  </button>

                  {/* ARCHIVE OR RESTORE */}
                  {item.status !== "archived" && canArchive && (
                    <button
                      type="button"
                      className="kb-action-menu-item"
                      onClick={() => {
                        setOpenMenuId(null);
                        setArchivingItem(item);
                      }}
                    >
                      <Archive size={14} color="#d97706" />
                      <span>{t("Archive Article", { defaultValue: "Archive Article" })}</span>
                    </button>
                  )}

                  {item.status === "archived" && canRestore && (
                    <button
                      type="button"
                      className="kb-action-menu-item"
                      onClick={() => {
                        setOpenMenuId(null);
                        setRestoringItem(item);
                      }}
                    >
                      <RotateCcw size={14} color="#16a34a" />
                      <span>{t("Restore Article", { defaultValue: "Restore Article" })}</span>
                    </button>
                  )}

                  {/* DELETE */}
                  {canDelete && (
                    <button
                      type="button"
                      className="kb-action-menu-item danger"
                      onClick={() => {
                        setOpenMenuId(null);
                        setDeletingItem(item);
                      }}
                    >
                      <Trash2 size={14} color="#ef4444" />
                      <span>{t("Delete Document", { defaultValue: "Delete Document" })}</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* READ BUTTON */}
          <button
            onClick={() => navigate(rolePath(`knowledge-base/${item.id}`))}
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
            <BookOpen size={14} /> {t("Read", { defaultValue: "Read" })}
          </button>
        </div>
      </div>
    );
  }
}
