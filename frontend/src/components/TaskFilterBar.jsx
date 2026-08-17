import React, { useEffect, useState } from "react";
import { IoSearchOutline, IoFilterOutline } from "react-icons/io5";
import API_URL from "../config/api";
import { authToken } from "../utils/auth";
import CustomSelect from "./CustomSelect";

/**
 * TaskFilterBar.jsx
 * Action & filter bar for task tables with collapsible filter toggle button.
 */
export default function TaskFilterBar({ filters, onFilterChange, onReset, search, onSearchChange }) {
  const [users, setUsers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    const token = authToken();
    if (!token) return;

    fetch(`${API_URL}/users`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      skipLoader: true,
    })
      .then((res) => res.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : data.data || [];
        setUsers(list);
      })
      .catch(() => {});

    fetch(`${API_URL}/projects`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      skipLoader: true,
    })
      .then((res) => res.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : data.data || [];
        setProjects(list);
      })
      .catch(() => {});
  }, []);

  const userOptions = [
    { value: "", label: "All Assignees" },
    ...users.map((u) => ({ value: String(u.id), label: u.name })),
  ];

  const projectOptions = [
    { value: "", label: "All Projects" },
    ...projects.map((p) => ({ value: String(p.id), label: p.title })),
  ];

  const statusOptions = [
    { value: "", label: "All Statuses" },
    { value: "pending", label: "Pending" },
    { value: "in_progress", label: "In Progress" },
    { value: "submitted", label: "Submitted" },
    { value: "approved", label: "Approved" },
    { value: "reopened", label: "Reopened" },
    { value: "abandoned", label: "Abandoned" },
  ];

  const isActive = Boolean(
    (search && search.trim()) ||
    filters?.user_id ||
    filters?.project_id ||
    filters?.status ||
    filters?.start_date ||
    filters?.end_date
  );

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
      }}
    >
      {/* Top Header Row with Search Input & Filter Toggle Button */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "12px",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        {/* Task Name Search */}
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
            placeholder="Search task name..."
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

        {/* Toggle Filters & Reset Buttons */}
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
            <span>Filters</span>
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
              onClick={onReset}
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
              Clear Filters
            </button>
          )}
        </div>
      </div>

      {/* Collapsible Advanced Filters Container */}
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
          {/* Person (Assignee) Filter */}
          <div style={{ flex: "1 1 150px", minWidth: 130 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary, #64748b)", display: "block", marginBottom: 4 }}>
              Person (Assignee)
            </label>
            <CustomSelect
              name="filter_user_id"
              value={filters?.user_id || ""}
              onChange={(val) => onFilterChange("user_id", val)}
              options={userOptions}
            />
          </div>

          {/* Project Filter */}
          <div style={{ flex: "1 1 150px", minWidth: 130 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary, #64748b)", display: "block", marginBottom: 4 }}>
              Project
            </label>
            <CustomSelect
              name="filter_project_id"
              value={filters?.project_id || ""}
              onChange={(val) => onFilterChange("project_id", val)}
              options={projectOptions}
            />
          </div>

          {/* Status Filter */}
          <div style={{ flex: "1 1 140px", minWidth: 120 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary, #64748b)", display: "block", marginBottom: 4 }}>
              Status
            </label>
            <CustomSelect
              name="filter_status"
              value={filters?.status || ""}
              onChange={(val) => onFilterChange("status", val)}
              options={statusOptions}
            />
          </div>

          {/* Start Date */}
          <div style={{ flex: "1 1 130px", minWidth: 120 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary, #64748b)", display: "block", marginBottom: 4 }}>
              Start Date
            </label>
            <input
              type="date"
              value={filters?.start_date || ""}
              onChange={(e) => onFilterChange("start_date", e.target.value)}
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

          {/* End Date */}
          <div style={{ flex: "1 1 130px", minWidth: 120 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary, #64748b)", display: "block", marginBottom: 4 }}>
              End Date
            </label>
            <input
              type="date"
              value={filters?.end_date || ""}
              onChange={(e) => onFilterChange("end_date", e.target.value)}
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
    </div>
  );
}
