import React, { useEffect, useState, useCallback } from "react";
import { IoSearchOutline, IoFilterOutline } from "react-icons/io5";
import { Bookmark, Check, Trash2, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import API_URL from "../config/api";
import { authToken } from "../utils/auth";
import { notify } from "../utils/notify";
import MultiSelectDropdown from "./MultiSelectDropdown";

/**
 * TaskFilterBar.jsx
 * Advanced Action & Filter Bar with Multi-Select categories and Saved Views integration.
 * Supports: Statuses, States (Reopened, Transferred), Due States, Assignees, Projects, Date Ranges.
 * Fully accessible to ALL user roles (Admin, Manager, Team Lead, Member).
 */
export default function TaskFilterBar({
  filters = {},
  onFilterChange,
  onApplyFilters,
  onReset,
  search = "",
  onSearchChange,
  module = "tasks",
}) {
  const { t } = useTranslation();
  const [users, setUsers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [showFilters, setShowFilters] = useState(false);
  const [savedViews, setSavedViews] = useState([]);
  const [activeViewId, setActiveViewId] = useState("all");
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [newViewName, setNewViewName] = useState("");
  const [savingView, setSavingView] = useState(false);
  const [showViewsDropdown, setShowViewsDropdown] = useState(false);

  // Standard non-deletable default views (SRS Section 11)
  const defaultViews = [
    { id: "all", name: t("All", { defaultValue: "All" }), filters: {} },
    { id: "pending", name: t("Pending"), filters: { statuses: ["Pending"] } },
    { id: "in_progress", name: t("In Progress"), filters: { statuses: ["In Progress"] } },
    { id: "submitted", name: t("Submitted", { defaultValue: "Submitted" }), filters: { statuses: ["Submitted"] } },
    { id: "completed", name: t("Completed", { defaultValue: "Completed" }), filters: { statuses: ["Completed", "Approved"] } },
    { id: "paused", name: t("Paused", { defaultValue: "Paused" }), filters: { statuses: ["Paused"] } },
    { id: "declined", name: t("Declined", { defaultValue: "Declined" }), filters: { statuses: ["Declined"] } },
    { id: "abandoned", name: t("Abandoned", { defaultValue: "Abandoned" }), filters: { statuses: ["Abandoned"] } },
  ];

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

  // Fetch User's Custom Saved Views (SRS Section 11 & 12 - Available to all roles)
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

  // Options for multi-select dropdowns
  const userOptions = users.map((u) => ({
    value: u?.id,
    label: u?.name || u?.email || "User",
  }));

  const projectOptions = projects.map((p) => ({
    value: p?.id,
    label: (p?.title || "Project") + (p?.business_id ? ` (${p.business_id})` : ""),
  }));

  // SRS Section 8 & 9 Statuses Options
  const statusOptions = [
    { value: "Pending", label: t("Pending") },
    { value: "In Progress", label: t("In Progress") },
    { value: "Submitted", label: t("Submitted", { defaultValue: "Submitted" }) },
    { value: "Completed", label: t("Completed", { defaultValue: "Completed" }) },
    { value: "Paused", label: t("Paused", { defaultValue: "Paused" }) },
    { value: "Declined", label: t("Declined", { defaultValue: "Declined" }) },
    { value: "Abandoned", label: t("Abandoned", { defaultValue: "Abandoned" }) },
  ];

  // SRS Section 5 States Options
  const stateOptions = [
    { value: "Reopened", label: t("Reopened", { defaultValue: "Reopened" }) },
    { value: "Transferred", label: t("Transferred", { defaultValue: "Transferred" }) },
  ];

  // SRS Section 6 Due State Options
  const dueStateOptions = [
    { value: "Due Today", label: t("Due Today", { defaultValue: "Due Today" }) },
    { value: "Due This Week", label: t("Due This Week", { defaultValue: "Due This Week" }) },
    { value: "Due This Month", label: t("Due This Month", { defaultValue: "Due This Month" }) },
    { value: "Overdue", label: t("Overdue") },
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
    isNonEmpty(filters?.user_id) ||
    isNonEmpty(filters?.project_id) ||
    filters?.start_date ||
    filters?.end_date
  );

  // Apply a selected view (Default or Custom)
  const handleSelectView = (view) => {
    setActiveViewId(view?.id || "all");
    setShowViewsDropdown(false);

    if (onApplyFilters) {
      onApplyFilters(view?.filters || {});
    } else {
      if (onReset) onReset();
      const targetFilters = view?.filters || {};
      Object.keys(targetFilters).forEach((k) => {
        if (onFilterChange) onFilterChange(k, targetFilters[k]);
      });
    }
  };

  // Save current active filters as a custom Saved View
  const handleSaveCurrentView = async (e) => {
    e.preventDefault();
    if (!newViewName.trim()) {
      notify?.error ? notify.error(t("Please enter a name for the view.", { defaultValue: "Please enter a name for the view." })) : alert("Please enter a name for the view.");
      return;
    }

    setSavingView(true);
    const token = authToken();

    const currentFiltersPayload = {
      statuses: toArray(filters?.statuses || filters?.status),
      states: toArray(filters?.states),
      due_states: toArray(filters?.due_states),
      user_id: toArray(filters?.user_id),
      project_id: toArray(filters?.project_id),
      start_date: filters?.start_date || "",
      end_date: filters?.end_date || "",
    };

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
          filters: currentFiltersPayload,
          is_default: false,
        }),
      });

      const data = await res.json();
      if (res.ok && data?.success) {
        notify?.success ? notify.success(t("Saved view created successfully!", { defaultValue: "Saved view created successfully!" })) : null;
        setNewViewName("");
        setShowSaveModal(false);
        fetchSavedViews();
        if (data?.data?.id) {
          setActiveViewId(`custom-${data.data.id}`);
        }
      } else {
        notify?.error ? notify.error(data?.message || "Failed to save view.") : alert(data?.message || "Failed to save view.");
      }
    } catch (err) {
      notify?.error ? notify.error(t("Error saving view.", { defaultValue: "Error saving view." })) : console.error(err);
    } finally {
      setSavingView(false);
    }
  };

  // Delete a custom saved view
  const handleDeleteView = async (e, viewId) => {
    e.stopPropagation();
    if (!window.confirm("Are you sure you want to delete this saved view?")) return;

    const token = authToken();
    try {
      const res = await fetch(`${API_URL}/task-saved-views/${viewId}`, {
        method: "DELETE",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      if (res.ok) {
        notify?.success ? notify.success(t("Saved view deleted.", { defaultValue: "Saved view deleted." })) : null;
        fetchSavedViews();
        if (activeViewId === `custom-${viewId}`) {
          setActiveViewId("all");
          if (onReset) onReset();
        }
      }
    } catch (err) {
      console.error("Error deleting saved view:", err);
    }
  };

  const currentActiveViewName =
    defaultViews.find((v) => v.id === activeViewId)?.name ||
    savedViews.find((v) => `custom-${v.id}` === activeViewId)?.name ||
    t("Saved Views", { defaultValue: "Saved Views" });

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
      {/* Top Header Row with Search, Saved Views Selector, and Filter Toggle */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "12px",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        {/* Left Side: Search & Saved Views dropdown */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: "1 1 360px", minWidth: 280, flexWrap: "wrap" }}>
          {/* Task Name Search */}
          <div style={{ flex: "1 1 200px", minWidth: 180, position: "relative" }}>
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
              placeholder={t("Search tasks...")}
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

          {/* Saved Views Dropdown Selector (SRS Sec 11 & 12) */}
          <div style={{ position: "relative" }}>
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
              <span>{t("View", { defaultValue: "View" })}: <strong>{currentActiveViewName}</strong></span>
            </button>

            {/* Views Dropdown Menu */}
            {showViewsDropdown && (
              <div
                style={{
                  position: "absolute",
                  top: "44px",
                  left: 0,
                  width: "260px",
                  background: "#ffffff",
                  border: "1px solid #e2e8f0",
                  borderRadius: "10px",
                  boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)",
                  zIndex: 200,
                  padding: "8px",
                }}
              >
                {/* Standard Views */}
                <div style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", color: "#64748b", padding: "4px 8px" }}>
                  {t("Standard Views", { defaultValue: "Standard Views" })}
                </div>
                <div style={{ maxHeight: "150px", overflowY: "auto", marginBottom: "6px" }}>
                  {defaultViews.map((dv) => {
                    const isSelected = activeViewId === dv.id;
                    return (
                      <div
                        key={dv.id}
                        onClick={() => handleSelectView(dv)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "6px 8px",
                          borderRadius: "6px",
                          fontSize: "12px",
                          cursor: "pointer",
                          background: isSelected ? "#eff6ff" : "transparent",
                          color: isSelected ? "#2563eb" : "#334155",
                          fontWeight: isSelected ? 600 : 400,
                        }}
                      >
                        <span>{dv.name}</span>
                        {isSelected && <Check size={14} color="#2563eb" />}
                      </div>
                    );
                  })}
                </div>

                {/* Custom Saved Views */}
                <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: "6px" }}>
                  <div style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", color: "#64748b", padding: "4px 8px" }}>
                    {t("My Custom Views", { defaultValue: "My Custom Views" })}
                  </div>
                  {savedViews.length === 0 ? (
                    <div style={{ padding: "6px 8px", fontSize: "11px", color: "#94a3b8", fontStyle: "italic" }}>
                      {t("No custom views yet.", { defaultValue: "No custom views yet." })}
                    </div>
                  ) : (
                    <div style={{ maxHeight: "140px", overflowY: "auto" }}>
                      {savedViews.map((sv) => {
                        const isSelected = activeViewId === `custom-${sv.id}`;
                        return (
                          <div
                            key={sv.id}
                            onClick={() => handleSelectView({ id: `custom-${sv.id}`, name: sv.name, filters: sv.filters })}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              padding: "6px 8px",
                              borderRadius: "6px",
                              fontSize: "12px",
                              cursor: "pointer",
                              background: isSelected ? "#eff6ff" : "transparent",
                              color: isSelected ? "#2563eb" : "#334155",
                              fontWeight: isSelected ? 600 : 400,
                            }}
                          >
                            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {sv.name}
                            </span>
                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                              {isSelected && <Check size={14} color="#2563eb" />}
                              <button
                                type="button"
                                onClick={(e) => handleDeleteView(e, sv.id)}
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
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Save Current View Action */}
                <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: "8px", marginTop: "4px" }}>
                  <button
                    type="button"
                    onClick={() => {
                      setShowViewsDropdown(false);
                      setShowSaveModal(true);
                    }}
                    style={{
                      width: "100%",
                      padding: "6px 8px",
                      borderRadius: "6px",
                      border: "1px dashed #cbd5e1",
                      background: "#f8fafc",
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
        </div>

        {/* Right Side: Toggle Filters & Reset Buttons */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
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
              background: showFilters || isActive ? "#eff6ff" : "var(--bg-card, #ffffff)",
              color: showFilters || isActive ? "#2563eb" : "var(--text-primary, #334155)",
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
                setActiveViewId("all");
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
              {t("Clear Filters")}
            </button>
          )}
        </div>
      </div>

      {/* Collapsible Advanced Filters Container (Multi-Select SRS Sec 8 & 9) */}
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
          {/* 1. Status Multi-Select Filter (Pending, In Progress, Submitted, Approved, Paused, Declined, Abandoned) */}
          <div style={{ flex: "1 1 180px", minWidth: 160 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary, #64748b)", display: "block", marginBottom: 4 }}>
              {t("Status")}
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

          {/* 2. State / Activity Multi-Select Filter (Reopened, Transferred) */}
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

          {/* 3. Due State Multi-Select Filter (Due Today, Due This Week, Overdue, etc.) */}
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

          {/* 4. Person (Assignee) Multi-Select Filter */}
          <div style={{ flex: "1 1 160px", minWidth: 150 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary, #64748b)", display: "block", marginBottom: 4 }}>
              {t("Person (Assignee)", { defaultValue: "Person (Assignee)" })}
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

          {/* 5. Project Multi-Select Filter */}
          <div style={{ flex: "1 1 160px", minWidth: 150 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary, #64748b)", display: "block", marginBottom: 4 }}>
              {t("Project", { defaultValue: "Project" })}
            </label>
            <MultiSelectDropdown
              size="sm"
              value={toArray(filters?.project_id)}
              onChange={(val) => onFilterChange && onFilterChange("project_id", val)}
              options={projectOptions}
              placeholder={t("All Projects")}
              searchPlaceholder={t("Search projects...")}
            />
          </div>

          {/* 6. Start Date */}
          <div style={{ flex: "1 1 120px", minWidth: 110 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary, #64748b)", display: "block", marginBottom: 4 }}>
              {t("Start Date")}
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

          {/* 7. End Date */}
          <div style={{ flex: "1 1 120px", minWidth: 110 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary, #64748b)", display: "block", marginBottom: 4 }}>
              {t("End Date")}
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
            backgroundColor: "rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={() => setShowSaveModal(false)}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: "12px",
              padding: "20px",
              width: "100%",
              maxWidth: "400px",
              boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
              <Bookmark size={20} color="#4f46e5" />
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#1e293b" }}>
                {t("Save Current View", { defaultValue: "Save Current View" })}
              </h3>
            </div>
            <p style={{ margin: "0 0 16px", fontSize: "13px", color: "#64748b" }}>
              {t("Save your active filters for quick access anytime.", { defaultValue: "Save your active filters for quick access anytime." })}
            </p>
            <form onSubmit={handleSaveCurrentView}>
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
                  border: "1px solid #cbd5e1",
                  fontSize: "13px",
                  marginBottom: "16px",
                  boxSizing: "border-box",
                  outline: "none",
                }}
              />
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                <button
                  type="button"
                  onClick={() => setShowSaveModal(false)}
                  style={{
                    padding: "8px 14px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    background: "#ffffff",
                    color: "#64748b",
                    fontSize: "13px",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {t("Cancel")}
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
                  {savingView ? t("Saving...") : t("Save View", { defaultValue: "Save View" })}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
