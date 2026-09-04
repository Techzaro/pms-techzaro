import React, { useEffect, useState, useCallback, useRef } from "react";
import { IoSearchOutline, IoFilterOutline } from "react-icons/io5";
import { Bookmark, Check, Trash2, Plus, Pencil, Save, X, RotateCcw, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import API_URL from "../config/api";
import { authToken } from "../utils/auth";
import { notify } from "../utils/notify";
import MultiSelectDropdown from "./MultiSelectDropdown";

/**
 * TaskFilterBar.jsx
 * Advanced Action & Filter Bar with Multi-Select categories and Saved Views integration (SRS Point 15).
 * Supports: Statuses, States (Reopened, Transferred), Due States, Priorities, Assignees, Creators, Followers, Projects, Dates.
 * Fully accessible to ALL user roles.
 */
export default function TaskFilterBar({
  filters = {},
  onFilterChange,
  onApplyFilters,
  onReset,
  search = "",
  onSearchChange,
  sortBy = "",
  sortDirection = "desc",
  onSortChange,
  activeStatus = "",
  module = "tasks",
}) {
  const { t } = useTranslation();
  const [users, setUsers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [showFilters, setShowFilters] = useState(false);
  const [savedViews, setSavedViews] = useState([]);
  const [activeViewId, setActiveViewId] = useState(null);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [newViewName, setNewViewName] = useState("");
  const [savingView, setSavingView] = useState(false);
  const [showViewsDropdown, setShowViewsDropdown] = useState(false);
  const [editingView, setEditingView] = useState(null);
  const [editViewName, setEditViewName] = useState("");
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [viewToDelete, setViewToDelete] = useState(null);
  const [deletingView, setDeletingView] = useState(false);
  const dropdownRef = useRef(null);

  // Fetch users & projects for dropdowns
  useEffect(() => {
    const token = authToken();
    if (!token) return;

    fetch(`${API_URL}/users`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      skipLoader: true,
    })
      .then((res) => res.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : (data?.users || data?.data || []);
        setUsers(Array.isArray(list) ? list : []);
      })
      .catch(() => setUsers([]));

    fetch(`${API_URL}/projects`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      skipLoader: true,
    })
      .then((res) => res.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : (data?.projects || data?.data || []);
        setProjects(Array.isArray(list) ? list : []);
      })
      .catch(() => setProjects([]));
  }, []);

  // Fetch User's Custom Saved Views (SRS Point 15 - Available to all roles)
  const fetchSavedViews = useCallback(() => {
    const token = authToken();
    if (!token) return;

    fetch(`${API_URL}/task-saved-views`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      skipLoader: true,
    })
      .then((res) => (res.ok ? res.json() : { data: [] }))
      .then((data) => {
        const list = Array.isArray(data?.data) ? data.data : [];
        setSavedViews(list);
      })
      .catch(() => setSavedViews([]));
  }, []);

  useEffect(() => {
    fetchSavedViews();
  }, [fetchSavedViews]);

  // Click outside to close views dropdown
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowViewsDropdown(false);
      }
    };
    if (showViewsDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showViewsDropdown]);

  // Options for multi-select dropdowns
  const userOptions = users.map((u) => ({
    value: u?.id,
    label: u?.name || u?.email || "User",
  }));

  const projectOptions = projects.map((p) => ({
    value: p?.id,
    label: (p?.title || "Project") + (p?.business_id ? ` (${p.business_id})` : ""),
  }));

  // SRS Point 15 Statuses Options
  const statusOptions = [
    { value: "Pending", label: t("Pending", { defaultValue: "Pending" }) },
    { value: "In Progress", label: t("In Progress", { defaultValue: "In Progress" }) },
    { value: "Submitted", label: t("Submitted", { defaultValue: "Submitted" }) },
    { value: "Completed", label: t("Completed", { defaultValue: "Completed" }) },
    { value: "Paused", label: t("Paused", { defaultValue: "Paused" }) },
    { value: "Declined", label: t("Declined", { defaultValue: "Declined" }) },
    { value: "Abandoned", label: t("Abandoned", { defaultValue: "Abandoned" }) },
  ];

  // SRS Point 15 Priority Options
  const priorityOptions = [
    { value: "Urgent", label: t("Urgent", { defaultValue: "Urgent" }) },
    { value: "High", label: t("High", { defaultValue: "High" }) },
    { value: "Medium", label: t("Medium", { defaultValue: "Medium" }) },
    { value: "Low", label: t("Low", { defaultValue: "Low" }) },
  ];

  // SRS Point 15 States Options
  const stateOptions = [
    { value: "Reopened", label: t("Reopened", { defaultValue: "Reopened" }) },
    { value: "Transferred", label: t("Transferred", { defaultValue: "Transferred" }) },
  ];

  // SRS Point 15 Due State Options
  const dueStateOptions = [
    { value: "Due Today", label: t("Due Today", { defaultValue: "Due Today" }) },
    { value: "Due This Week", label: t("Due This Week", { defaultValue: "Due This Week" }) },
    { value: "Due This Month", label: t("Due This Month", { defaultValue: "Due This Month" }) },
    { value: "Overdue", label: t("Overdue", { defaultValue: "Overdue" }) },
    { value: "Upcoming", label: t("Upcoming", { defaultValue: "Upcoming" }) },
    { value: "No due date", label: t("No due date", { defaultValue: "No due date" }) },
  ];

  const toArray = (val) => {
    if (Array.isArray(val)) return val;
    if (val !== undefined && val !== null && val !== "") return [val];
    return [];
  };

  const isNonEmpty = (val) => (Array.isArray(val) ? val.length > 0 : Boolean(val));

  const isActive = Boolean(
    (search && search.trim()) ||
    isNonEmpty(filters?.statuses) ||
    isNonEmpty(filters?.status) ||
    isNonEmpty(filters?.states) ||
    isNonEmpty(filters?.due_states) ||
    isNonEmpty(filters?.priority) ||
    isNonEmpty(filters?.priorities) ||
    isNonEmpty(filters?.user_id) ||
    isNonEmpty(filters?.assigned_to) ||
    isNonEmpty(filters?.project_id) ||
    isNonEmpty(filters?.created_by) ||
    isNonEmpty(filters?.follower_id) ||
    filters?.start_date ||
    filters?.end_date ||
    filters?.due_date_from ||
    filters?.due_date_to ||
    (activeStatus && activeStatus !== "" && activeStatus !== "all")
  );

  // Apply a selected view
  const handleSelectView = (view) => {
    setActiveViewId(view?.id || null);
    setShowViewsDropdown(false);

    const targetFilters = view?.filters || view?.filter_payload || {};
    const sortParams = view?.sort_parameters || null;

    if (onApplyFilters) {
      onApplyFilters(targetFilters, sortParams);
    } else {
      if (onReset) onReset();
      Object.keys(targetFilters).forEach((k) => {
        if (onFilterChange) onFilterChange(k, targetFilters[k]);
      });
      if (sortParams && onSortChange) {
        if (typeof sortParams === "object" && sortParams.sort_by) {
          onSortChange(sortParams.sort_by, sortParams.sort_direction || "desc");
        }
      }
    }
  };

  // Helper to compile current active filters
  const buildCurrentFilterPayload = () => {
    const rawStatuses = toArray(filters?.statuses || filters?.status);
    let finalStatuses = [...rawStatuses];

    if (finalStatuses.length === 0 && activeStatus && activeStatus !== "all" && activeStatus !== "") {
      const formattedStatus = activeStatus === "in_progress" ? "In Progress" : (activeStatus.charAt(0).toUpperCase() + activeStatus.slice(1));
      finalStatuses = [formattedStatus];
    }

    return {
      statuses: finalStatuses,
      states: toArray(filters?.states),
      due_states: toArray(filters?.due_states),
      priority: toArray(filters?.priority || filters?.priorities),
      user_id: toArray(filters?.user_id || filters?.assigned_to),
      project_id: toArray(filters?.project_id),
      created_by: toArray(filters?.created_by),
      follower_id: toArray(filters?.follower_id),
      start_date: filters?.start_date || "",
      end_date: filters?.end_date || "",
      due_date_from: filters?.due_date_from || "",
      due_date_to: filters?.due_date_to || "",
    };
  };

  // Save current active filters as a new custom Saved View
  const handleSaveCurrentView = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!newViewName.trim()) {
      if (notify?.error) notify.error(t("Please enter a name for the view.", { defaultValue: "Please enter a name for the view." }));
      else alert("Please enter a name for the view.");
      return;
    }

    setSavingView(true);
    const token = authToken();
    const currentFiltersPayload = buildCurrentFilterPayload();
    const sortPayload = sortBy ? { sort_by: sortBy, sort_direction: sortDirection } : null;

    try {
      const res = await fetch(`${API_URL}/task-saved-views`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: newViewName.trim(),
          view_name: newViewName.trim(),
          filters: currentFiltersPayload,
          filter_payload: currentFiltersPayload,
          sort_parameters: sortPayload,
          is_default: false,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.success) {
        if (notify?.success) notify.success(t("Saved view created successfully!", { defaultValue: "Saved view created successfully!" }));
        setNewViewName("");
        setShowSaveModal(false);
        fetchSavedViews();
        if (data?.data?.id) {
          setActiveViewId(data.data.id);
        }
      } else {
        const msg = data?.message || t("Failed to save view.", { defaultValue: "Failed to save view." });
        if (notify?.error) notify.error(msg);
        else alert(msg);
      }
    } catch (err) {
      if (notify?.error) notify.error(t("Error saving view.", { defaultValue: "Error saving view." }));
      console.error(err);
    } finally {
      setSavingView(false);
    }
  };

  // Update / Overwrite an existing saved view with current active filters
  const handleOverwriteView = async (e, view) => {
    if (e && e.stopPropagation) e.stopPropagation();
    if (e && e.preventDefault) e.preventDefault();

    if (!window.confirm('Overwrite "' + view.name + '" with your currently active filters and sorting?')) {
      return;
    }

    const token = authToken();
    const currentFiltersPayload = buildCurrentFilterPayload();
    const sortPayload = sortBy ? { sort_by: sortBy, sort_direction: sortDirection } : null;

    try {
      const res = await fetch(`${API_URL}/task-saved-views/${view.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: view.name,
          view_name: view.name,
          filters: currentFiltersPayload,
          filter_payload: currentFiltersPayload,
          sort_parameters: sortPayload,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.success) {
        if (notify?.success) notify.success(t("Saved view updated with current filters.", { defaultValue: "Saved view updated with current filters." }));
        fetchSavedViews();
        setActiveViewId(view.id);
      } else {
        if (notify?.error) notify.error(data?.message || t("Failed to update view.", { defaultValue: "Failed to update view." }));
      }
    } catch (err) {
      console.error("Error updating saved view filters:", err);
      if (notify?.error) notify.error(t("Error updating view.", { defaultValue: "Error updating view." }));
    }
  };

  // Update / Rename an existing saved view
  const handleUpdateViewName = async (e, viewId) => {
    if (e && e.stopPropagation) e.stopPropagation();
    if (e && e.preventDefault) e.preventDefault();
    if (!editViewName.trim()) return;

    const token = authToken();
    try {
      const res = await fetch(`${API_URL}/task-saved-views/${viewId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: editViewName.trim(),
          view_name: editViewName.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.success) {
        if (notify?.success) notify.success(t("Saved view renamed.", { defaultValue: "Saved view renamed." }));
        setEditingView(null);
        setEditViewName("");
        fetchSavedViews();
      } else {
        if (notify?.error) notify.error(data?.message || t("Failed to rename view.", { defaultValue: "Failed to rename view." }));
      }
    } catch (err) {
      console.error("Error renaming saved view:", err);
      if (notify?.error) notify.error(t("Error renaming view.", { defaultValue: "Error renaming view." }));
    }
  };

  // Execute delete request from modal
  const handleConfirmDelete = async () => {
    if (!viewToDelete?.id) return;
    setDeletingView(true);
    const token = authToken();
    try {
      const res = await fetch(`${API_URL}/task-saved-views/${viewToDelete.id}`, {
        method: "DELETE",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      if (res.ok) {
        if (notify?.success) notify.success(t("Saved view deleted.", { defaultValue: "Saved view deleted." }));
        fetchSavedViews();
        if (activeViewId === viewToDelete.id || activeViewId === `custom-${viewToDelete.id}`) {
          setActiveViewId(null);
          if (onReset) onReset();
        }
      } else {
        const data = await res.json().catch(() => ({}));
        if (notify?.error) notify.error(data?.message || t("Failed to delete view.", { defaultValue: "Failed to delete view." }));
      }
    } catch (err) {
      console.error("Error deleting saved view:", err);
      if (notify?.error) notify.error(t("Error deleting view.", { defaultValue: "Error deleting view." }));
    } finally {
      setDeletingView(false);
      setShowDeleteModal(false);
      setViewToDelete(null);
    }
  };

  const currentActiveViewName =
    savedViews.find((v) => v.id === activeViewId || `custom-${v.id}` === activeViewId)?.name || "";

  return (
    <div
      style={{
        background: "var(--bg-card, #ffffff)",
        border: "1px solid var(--border-color, #e2e8f0)",
        borderRadius: "12px",
        marginTop: "16px",
        marginBottom: "20px",
        padding: "14px 16px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
        boxSizing: "border-box",
        width: "100%",
        position: "relative",
        zIndex: 50,
        overflow: "visible",
      }}
    >
      {/* Top Header Row with Search on Left, and Saved Views dropdown, Filters Toggle & Reset on Right */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "12px",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        {/* Left Side: Search Bar */}
        <div style={{ flex: "1 1 240px", minWidth: 200, position: "relative" }}>
          <IoSearchOutline
            style={{
              position: "absolute",
              left: 12,
              top: "50%",
              transform: "translateY(-50%)",
              color: "#9ca3af",
              fontSize: 16,
            }}
          />
          <input
            type="text"
            placeholder={t("Search tasks...", { defaultValue: "Search tasks..." })}
            value={search || ""}
            onChange={(e) => onSearchChange && onSearchChange(e.target.value)}
            style={{
              width: "100%",
              height: "38px",
              padding: "6px 12px 6px 36px",
              borderRadius: "8px",
              border: "1px solid var(--border-color, #cbd5e1)",
              background: "var(--bg-card, #ffffff)",
              color: "var(--text-primary, #0f172a)",
              fontSize: "13px",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>

        {/* Right Side: Saved Views Dropdown, Toggle Filters & Reset Buttons */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          {/* Saved Views / My Filters Dropdown Selector */}
          <div style={{ position: "relative" }} ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setShowViewsDropdown(!showViewsDropdown)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                height: "38px",
                padding: "0 12px",
                borderRadius: "8px",
                border: "1px solid var(--border-color, #cbd5e1)",
                background: "var(--bg-card, #ffffff)",
                color: "var(--text-primary, #334155)",
                fontSize: "13px",
                fontWeight: 500,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
              title={t("Select or manage saved views", { defaultValue: "Select or manage saved views" })}
            >
              <Bookmark size={15} style={{ color: "#4f46e5" }} />
              <span>
                {t("Saved Views", { defaultValue: "Saved Views" })}
                {currentActiveViewName ? <>: <strong>{currentActiveViewName}</strong></> : null}
              </span>
            </button>

            {/* Views Dropdown Menu */}
            {showViewsDropdown && (
              <div
                style={{
                  position: "absolute",
                  top: "44px",
                  right: 0,
                  width: "300px",
                  background: "var(--bg-card, #ffffff)",
                  border: "1px solid var(--border-color, #e2e8f0)",
                  borderRadius: "10px",
                  boxShadow: "0 10px 25px -5px rgba(0,0,0,0.15), 0 8px 10px -6px rgba(0,0,0,0.1)",
                  zIndex: 200,
                  padding: "8px",
                }}
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
              >
                {/* Custom Saved Views List */}
                <div style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted, #64748b)", padding: "4px 8px" }}>
                  {t("My Custom Views", { defaultValue: "My Custom Views" })}
                </div>
                {savedViews.length === 0 ? (
                  <div style={{ padding: "12px 8px", fontSize: "12px", color: "var(--text-muted, #94a3b8)", fontStyle: "italic", textAlign: "center" }}>
                    {t("No custom views yet.", { defaultValue: "No custom views yet." })}
                  </div>
                ) : (
                  <div style={{ maxHeight: "200px", overflowY: "auto" }}>
                    {savedViews.map((sv) => {
                      const isSelected = activeViewId === sv.id || activeViewId === `custom-${sv.id}`;
                      const isEditing = editingView === sv.id;

                      if (isEditing) {
                        return (
                          <div
                            key={sv.id}
                            style={{ display: "flex", alignItems: "center", gap: "4px", padding: "4px 6px" }}
                            onClick={(e) => e.stopPropagation()}
                            onMouseDown={(e) => e.stopPropagation()}
                          >
                            <input
                              type="text"
                              value={editViewName}
                              onChange={(e) => setEditViewName(e.target.value)}
                              autoFocus
                              style={{
                                flex: 1,
                                height: "26px",
                                fontSize: "12px",
                                padding: "2px 6px",
                                borderRadius: "4px",
                                border: "1px solid #2563eb",
                                outline: "none",
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleUpdateViewName(e, sv.id);
                                if (e.key === "Escape") setEditingView(null);
                              }}
                            />
                            <button
                              type="button"
                              onClick={(e) => handleUpdateViewName(e, sv.id)}
                              style={{ background: "none", border: "none", color: "#16a34a", cursor: "pointer", padding: 2 }}
                              title={t("Save name", { defaultValue: "Save name" })}
                            >
                              <Check size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingView(null);
                              }}
                              style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", padding: 2 }}
                              title={t("Cancel", { defaultValue: "Cancel" })}
                            >
                              <X size={14} />
                            </button>
                          </div>
                        );
                      }

                      return (
                        <div
                          key={sv.id}
                          onClick={() => handleSelectView({ id: sv.id, name: sv.name, filters: sv.filters, filter_payload: sv.filter_payload, sort_parameters: sv.sort_parameters })}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "6px 8px",
                            borderRadius: "6px",
                            fontSize: "12px",
                            cursor: "pointer",
                            background: isSelected ? "var(--color-primary-bg, #eff6ff)" : "transparent",
                            color: isSelected ? "var(--color-primary, #2563eb)" : "var(--text-primary, #334155)",
                            fontWeight: isSelected ? 600 : 400,
                          }}
                        >
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }} title={sv.name}>
                            {sv.name}
                          </span>
                          <div
                            style={{ display: "flex", alignItems: "center", gap: "4px", marginLeft: "6px" }}
                            onClick={(e) => e.stopPropagation()}
                            onMouseDown={(e) => e.stopPropagation()}
                          >
                            {isSelected && <Check size={14} color="#2563eb" />}
                            <button
                              type="button"
                              onClick={(e) => handleOverwriteView(e, sv)}
                              style={{
                                background: "transparent",
                                border: "none",
                                color: "#4f46e5",
                                cursor: "pointer",
                                padding: 2,
                                display: "inline-flex",
                                alignItems: "center",
                              }}
                              title={t("Overwrite view with current active filters/sort", { defaultValue: "Overwrite view with current active filters/sort" })}
                            >
                              <RefreshCw size={11} />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingView(sv.id);
                                setEditViewName(sv.name);
                              }}
                              style={{
                                background: "transparent",
                                border: "none",
                                color: "#64748b",
                                cursor: "pointer",
                                padding: 2,
                                display: "inline-flex",
                                alignItems: "center",
                              }}
                              title={t("Rename view", { defaultValue: "Rename view" })}
                            >
                              <Pencil size={11} />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setViewToDelete(sv);
                                setShowDeleteModal(true);
                                setShowViewsDropdown(false);
                              }}
                              style={{
                                background: "transparent",
                                border: "none",
                                color: "#ef4444",
                                cursor: "pointer",
                                padding: 2,
                                display: "inline-flex",
                                alignItems: "center",
                              }}
                              title={t("Delete view", { defaultValue: "Delete view" })}
                            >
                              <Trash2 size={11} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Save Current View Action */}
                <div style={{ borderTop: "1px solid var(--border-color, #f1f5f9)", paddingTop: "8px", marginTop: "4px" }}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowViewsDropdown(false);
                      setShowSaveModal(true);
                    }}
                    style={{
                      width: "100%",
                      padding: "6px 8px",
                      borderRadius: "6px",
                      border: "1px dashed var(--border-color, #cbd5e1)",
                      background: "var(--bg-hover, #f8fafc)",
                      color: "#4f46e5",
                      fontSize: "12px",
                      fontWeight: 600,
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "6px",
                    }}
                  >
                    <Plus size={14} />
                    <span>{t("Save Current Filters as View", { defaultValue: "Save Current Filters as View" })}</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => setShowFilters(!showFilters)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              height: "38px",
              padding: "0 14px",
              borderRadius: "8px",
              border: showFilters || isActive ? "1px solid #2563eb" : "1px solid var(--border-color, #cbd5e1)",
              background: showFilters || isActive ? "var(--color-primary-bg, #eff6ff)" : "var(--bg-card, #ffffff)",
              color: showFilters || isActive ? "var(--color-primary, #2563eb)" : "var(--text-primary, #334155)",
              fontSize: "13px",
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            <IoFilterOutline size={16} />
            <span>{t("Filters", { defaultValue: "Filters" })}</span>
            {isActive && (
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  backgroundColor: "#2563eb",
                  marginLeft: 2,
                }}
              />
            )}
          </button>

          {isActive && (
            <button
              type="button"
              onClick={() => {
                setActiveViewId(null);
                if (onReset) onReset();
              }}
              style={{
                height: "38px",
                padding: "0 14px",
                borderRadius: "8px",
                border: "1px solid var(--border-color, #cbd5e1)",
                background: "transparent",
                color: "#dc2626",
                fontSize: "12px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {t("Clear Filters", { defaultValue: "Clear Filters" })}
            </button>
          )}
        </div>
      </div>

      {/* Collapsible Advanced Filters Container (SRS Point 15) */}
      {showFilters && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "12px",
            alignItems: "flex-end",
            marginTop: "14px",
            paddingTop: "14px",
            borderTop: "1px solid var(--border-color, #f1f5f9)",
            position: "relative",
            zIndex: 100,
            overflow: "visible",
          }}
        >
          {/* 1. Status Multi-Select Filter */}
          <div style={{ flex: "1 1 170px", minWidth: 150 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary, #64748b)", display: "block", marginBottom: 4 }}>
              {t("Status", { defaultValue: "Status" })}
            </label>
            <MultiSelectDropdown
              size="sm"
              value={toArray(filters?.statuses || filters?.status)}
              onChange={(val) => {
                if (onFilterChange) {
                  onFilterChange("statuses", val);
                  onFilterChange("status", val);
                }
              }}
              options={statusOptions}
              placeholder={t("All Statuses", { defaultValue: "All Statuses" })}
              searchPlaceholder={t("Search status...", { defaultValue: "Search status..." })}
            />
          </div>

          {/* 2. Priority Multi-Select Filter */}
          <div style={{ flex: "1 1 140px", minWidth: 130 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary, #64748b)", display: "block", marginBottom: 4 }}>
              {t("Priority", { defaultValue: "Priority" })}
            </label>
            <MultiSelectDropdown
              size="sm"
              value={toArray(filters?.priority || filters?.priorities)}
              onChange={(val) => {
                if (onFilterChange) {
                  onFilterChange("priority", val);
                  onFilterChange("priorities", val);
                }
              }}
              options={priorityOptions}
              placeholder={t("All Priorities", { defaultValue: "All Priorities" })}
              searchPlaceholder={t("Search priority...", { defaultValue: "Search priority..." })}
            />
          </div>

          {/* 3. State / Activity Multi-Select Filter */}
          <div style={{ flex: "1 1 150px", minWidth: 140 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary, #64748b)", display: "block", marginBottom: 4 }}>
              {t("Activity / States", { defaultValue: "Activity / States" })}
            </label>
            <MultiSelectDropdown
              size="sm"
              value={toArray(filters?.states || filters?.state)}
              onChange={(val) => {
                if (onFilterChange) {
                  onFilterChange("states", val);
                  onFilterChange("state", val);
                }
              }}
              options={stateOptions}
              placeholder={t("All States", { defaultValue: "All States" })}
              searchPlaceholder={t("Search state...", { defaultValue: "Search state..." })}
            />
          </div>

          {/* 4. Due State Multi-Select Filter */}
          <div style={{ flex: "1 1 160px", minWidth: 150 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary, #64748b)", display: "block", marginBottom: 4 }}>
              {t("Due State", { defaultValue: "Due State" })}
            </label>
            <MultiSelectDropdown
              size="sm"
              value={toArray(filters?.due_states || filters?.due_state)}
              onChange={(val) => {
                if (onFilterChange) {
                  onFilterChange("due_states", val);
                  onFilterChange("due_state", val);
                }
              }}
              options={dueStateOptions}
              placeholder={t("All Due Dates", { defaultValue: "All Due Dates" })}
              searchPlaceholder={t("Search due state...", { defaultValue: "Search due state..." })}
            />
          </div>

          {/* 5. Person (Assignee) Multi-Select Filter */}
          <div style={{ flex: "1 1 160px", minWidth: 150 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary, #64748b)", display: "block", marginBottom: 4 }}>
              {t("Assignee", { defaultValue: "Assignee" })}
            </label>
            <MultiSelectDropdown
              size="sm"
              value={toArray(filters?.user_id || filters?.assigned_to)}
              onChange={(val) => onFilterChange && onFilterChange("user_id", val)}
              options={userOptions}
              placeholder={t("All Assignees", { defaultValue: "All Assignees" })}
              searchPlaceholder={t("Search assignees...", { defaultValue: "Search assignees..." })}
            />
          </div>

          {/* 6. Creator / Assigner Multi-Select Filter */}
          <div style={{ flex: "1 1 160px", minWidth: 150 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary, #64748b)", display: "block", marginBottom: 4 }}>
              {t("Creator / Assigner", { defaultValue: "Creator / Assigner" })}
            </label>
            <MultiSelectDropdown
              size="sm"
              value={toArray(filters?.created_by || filters?.assigned_by)}
              onChange={(val) => onFilterChange && onFilterChange("created_by", val)}
              options={userOptions}
              placeholder={t("All Creators", { defaultValue: "All Creators" })}
              searchPlaceholder={t("Search creators...", { defaultValue: "Search creators..." })}
            />
          </div>

          {/* 7. Project Multi-Select Filter */}
          <div style={{ flex: "1 1 160px", minWidth: 150 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary, #64748b)", display: "block", marginBottom: 4 }}>
              {t("Project", { defaultValue: "Project" })}
            </label>
            <MultiSelectDropdown
              size="sm"
              value={toArray(filters?.project_id)}
              onChange={(val) => onFilterChange && onFilterChange("project_id", val)}
              options={projectOptions}
              placeholder={t("All Projects", { defaultValue: "All Projects" })}
              searchPlaceholder={t("Search projects...", { defaultValue: "Search projects..." })}
            />
          </div>

          {/* 8. Start Date */}
          <div style={{ flex: "1 1 120px", minWidth: 110 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary, #64748b)", display: "block", marginBottom: 4 }}>
              {t("Start Date", { defaultValue: "Start Date" })}
            </label>
            <input
              type="date"
              value={filters?.start_date || ""}
              onChange={(e) => onFilterChange && onFilterChange("start_date", e.target.value)}
              style={{
                width: "100%",
                height: "36px",
                padding: "4px 8px",
                borderRadius: "8px",
                border: "1px solid var(--border-color, #cbd5e1)",
                background: "var(--bg-card, #ffffff)",
                color: "var(--text-primary, #0f172a)",
                fontSize: "12px",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* 9. End Date */}
          <div style={{ flex: "1 1 120px", minWidth: 110 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary, #64748b)", display: "block", marginBottom: 4 }}>
              {t("End Date", { defaultValue: "End Date" })}
            </label>
            <input
              type="date"
              value={filters?.end_date || ""}
              onChange={(e) => onFilterChange && onFilterChange("end_date", e.target.value)}
              style={{
                width: "100%",
                height: "36px",
                padding: "4px 8px",
                borderRadius: "8px",
                border: "1px solid var(--border-color, #cbd5e1)",
                background: "var(--bg-card, #ffffff)",
                color: "var(--text-primary, #0f172a)",
                fontSize: "12px",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* 10. Save Filter Button at the end of the filter menu */}
          <div style={{ flex: "0 0 auto", display: "flex", alignItems: "center" }}>
            <button
              type="button"
              onClick={() => setShowSaveModal(true)}
              style={{
                height: "36px",
                padding: "0 14px",
                borderRadius: "8px",
                border: "1px solid #4f46e5",
                background: "#4f46e5",
                color: "#ffffff",
                fontSize: "12px",
                fontWeight: 600,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                boxShadow: "0 1px 2px rgba(79, 70, 229, 0.2)",
                transition: "all 0.15s ease",
              }}
              title={t("Save active filters as a preset", { defaultValue: "Save active filters as a preset" })}
            >
              <Bookmark size={14} />
              <span>{t("Save Filter", { defaultValue: "Save Filter" })}</span>
            </button>
          </div>
        </div>
      )}

      {/* Save View Modal Dialog */}
      {showSaveModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
          }}
          onClick={() => setShowSaveModal(false)}
        >
          <div
            style={{
              background: "var(--bg-card, #ffffff)",
              borderRadius: "12px",
              padding: "20px",
              width: "100%",
              maxWidth: "420px",
              boxShadow: "0 20px 25px -5px rgba(0,0,0,0.15)",
              border: "1px solid var(--border-color, #e2e8f0)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Bookmark size={20} color="#4f46e5" />
                <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "var(--text-primary, #1e293b)" }}>
                  {t("Save Current View", { defaultValue: "Save Current View" })}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowSaveModal(false)}
                style={{ background: "transparent", border: "none", color: "#94a3b8", cursor: "pointer" }}
              >
                <X size={18} />
              </button>
            </div>
            <p style={{ margin: "0 0 16px", fontSize: "13px", color: "var(--text-muted, #64748b)" }}>
              {t("Save your active filters and sorting for quick access anytime.", { defaultValue: "Save your active filters and sorting for quick access anytime." })}
            </p>
            <form onSubmit={handleSaveCurrentView}>
              <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary, #334155)", display: "block", marginBottom: "6px" }}>
                {t("View Name", { defaultValue: "View Name" })} <span style={{ color: "#ef4444" }}>*</span>
              </label>
              <input
                type="text"
                placeholder={t("e.g. My Urgent Overdue Tasks", { defaultValue: "e.g. My Urgent Overdue Tasks" })}
                value={newViewName}
                onChange={(e) => setNewViewName(e.target.value)}
                autoFocus
                style={{
                  width: "100%",
                  height: "38px",
                  padding: "8px 12px",
                  borderRadius: "8px",
                  border: "1px solid var(--border-color, #cbd5e1)",
                  fontSize: "13px",
                  marginBottom: "16px",
                  boxSizing: "border-box",
                  outline: "none",
                  background: "var(--bg-card, #ffffff)",
                  color: "var(--text-primary, #0f172a)",
                }}
              />
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                <button
                  type="button"
                  onClick={() => setShowSaveModal(false)}
                  style={{
                    padding: "8px 14px",
                    borderRadius: "8px",
                    border: "1px solid var(--border-color, #cbd5e1)",
                    background: "var(--bg-card, #ffffff)",
                    color: "var(--text-primary, #64748b)",
                    fontSize: "13px",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {t("Cancel", { defaultValue: "Cancel" })}
                </button>
                <button
                  type="submit"
                  disabled={savingView}
                  style={{
                    padding: "8px 16px",
                    borderRadius: "8px",
                    border: "none",
                    background: "#4f46e5",
                    color: "#ffffff",
                    fontSize: "13px",
                    fontWeight: 600,
                    cursor: savingView ? "not-allowed" : "pointer",
                    opacity: savingView ? 0.7 : 1,
                  }}
                >
                  {savingView ? t("Saving...", { defaultValue: "Saving..." }) : t("Save View", { defaultValue: "Save View" })}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal Dialog */}
      {showDeleteModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
          }}
          onClick={() => {
            if (!deletingView) {
              setShowDeleteModal(false);
              setViewToDelete(null);
            }
          }}
        >
          <div
            style={{
              background: "var(--bg-card, #ffffff)",
              borderRadius: "12px",
              padding: "20px",
              width: "100%",
              maxWidth: "400px",
              boxShadow: "0 20px 25px -5px rgba(0,0,0,0.15)",
              border: "1px solid var(--border-color, #e2e8f0)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <div
                  style={{
                    width: "32px",
                    height: "32px",
                    borderRadius: "50%",
                    backgroundColor: "#fee2e2",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Trash2 size={16} color="#ef4444" />
                </div>
                <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "var(--text-primary, #1e293b)" }}>
                  {t("Delete Saved View", { defaultValue: "Delete Saved View" })}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!deletingView) {
                    setShowDeleteModal(false);
                    setViewToDelete(null);
                  }
                }}
                style={{ background: "transparent", border: "none", color: "#94a3b8", cursor: "pointer" }}
              >
                <X size={18} />
              </button>
            </div>
            <p style={{ margin: "0 0 20px", fontSize: "13px", color: "var(--text-muted, #64748b)", lineHeight: "1.5" }}>
              {t("Are you sure you want to delete the view", { defaultValue: "Are you sure you want to delete the view" })}{" "}
              <strong style={{ color: "var(--text-primary, #1e293b)" }}>"{viewToDelete?.name}"</strong>?{" "}
              {t("This action cannot be undone.", { defaultValue: "This action cannot be undone." })}
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button
                type="button"
                disabled={deletingView}
                onClick={() => {
                  setShowDeleteModal(false);
                  setViewToDelete(null);
                }}
                style={{
                  padding: "8px 14px",
                  borderRadius: "8px",
                  border: "1px solid var(--border-color, #cbd5e1)",
                  background: "var(--bg-card, #ffffff)",
                  color: "var(--text-primary, #64748b)",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: deletingView ? "not-allowed" : "pointer",
                }}
              >
                {t("Cancel", { defaultValue: "Cancel" })}
              </button>
              <button
                type="button"
                disabled={deletingView}
                onClick={handleConfirmDelete}
                style={{
                  padding: "8px 16px",
                  borderRadius: "8px",
                  border: "none",
                  background: "#ef4444",
                  color: "#ffffff",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: deletingView ? "not-allowed" : "pointer",
                  opacity: deletingView ? 0.7 : 1,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                {deletingView ? (
                  <span>{t("Deleting...", { defaultValue: "Deleting..." })}</span>
                ) : (
                  <>
                    <Trash2 size={14} />
                    <span>{t("Delete", { defaultValue: "Delete" })}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
