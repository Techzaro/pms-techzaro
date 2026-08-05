import React, { useEffect, useState } from "react";
import { IoSearchOutline } from "react-icons/io5";
import API_URL from "../config/api";
import { authToken } from "../utils/auth";
import CustomSelect from "./CustomSelect";

/**
 * TaskFilterBar.jsx
 * Responsive action & filter bar for task tables.
 * Wraps gracefully on smaller screens with clean vertical spacing.
 */
export default function TaskFilterBar({ filters, onFilterChange, onReset, search, onSearchChange }) {
  const [users, setUsers] = useState([]);
  const [projects, setProjects] = useState([]);

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
        display: "flex",
        flexWrap: "wrap",
        gap: "12px",
        alignItems: "flex-end",
        padding: "14px 16px",
        background: "var(--bg-card, #ffffff)",
        border: "1px solid var(--border-color, #e2e8f0)",
        borderRadius: "12px",
        marginTop: "16px",
        marginBottom: "20px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
        boxSizing: "border-box",
        width: "100%",
        maxWidth: "100%",
      }}
    >
      {/* Task Name Search */}
      <div style={{ flex: "1 1 180px", minWidth: 150 }}>
        <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary, #64748b)", display: "block", marginBottom: 4, whiteSpace: "nowrap" }}>
          Task Name Search
        </label>
        <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
          <IoSearchOutline style={{ position: "absolute", left: 10, color: "#9ca3af", fontSize: 16 }} />
          <input
            type="text"
            placeholder="Search task name..."
            value={search || ""}
            onChange={(e) => onSearchChange && onSearchChange(e.target.value)}
            style={{
              width: "100%",
              height: "36px",
              padding: "6px 8px 6px 32px",
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

      {/* Person (Assignee) Filter */}
      <div style={{ flex: "1 1 140px", minWidth: 130 }}>
        <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary, #64748b)", display: "block", marginBottom: 4, whiteSpace: "nowrap" }}>
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
      <div style={{ flex: "1 1 140px", minWidth: 130 }}>
        <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary, #64748b)", display: "block", marginBottom: 4, whiteSpace: "nowrap" }}>
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
      <div style={{ flex: "1 1 130px", minWidth: 120 }}>
        <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary, #64748b)", display: "block", marginBottom: 4, whiteSpace: "nowrap" }}>
          Status
        </label>
        <CustomSelect
          name="filter_status"
          value={filters?.status || ""}
          onChange={(val) => onFilterChange("status", val)}
          options={statusOptions}
        />
      </div>

      {/* Date Range Start */}
      <div style={{ flex: "1 1 130px", minWidth: 120 }}>
        <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary, #64748b)", display: "block", marginBottom: 4, whiteSpace: "nowrap" }}>
          Start Date
        </label>
        <input
          type="date"
          value={filters?.start_date || ""}
          onChange={(e) => onFilterChange("start_date", e.target.value)}
          style={{
            width: "100%",
            height: "36px",
            padding: "6px 8px",
            borderRadius: "8px",
            border: "1px solid var(--border-color, #cbd5e1)",
            background: "var(--bg-card, #ffffff)",
            color: "var(--text-primary, #0f172a)",
            fontSize: "12px",
            boxSizing: "border-box",
          }}
        />
      </div>

      {/* Date Range End */}
      <div style={{ flex: "1 1 130px", minWidth: 120 }}>
        <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary, #64748b)", display: "block", marginBottom: 4, whiteSpace: "nowrap" }}>
          End Date
        </label>
        <input
          type="date"
          value={filters?.end_date || ""}
          onChange={(e) => onFilterChange("end_date", e.target.value)}
          style={{
            width: "100%",
            height: "36px",
            padding: "6px 8px",
            borderRadius: "8px",
            border: "1px solid var(--border-color, #cbd5e1)",
            background: "var(--bg-card, #ffffff)",
            color: "var(--text-primary, #0f172a)",
            fontSize: "12px",
            boxSizing: "border-box",
          }}
        />
      </div>

      {/* Clear Filters Button */}
      {isActive && (
        <button
          type="button"
          onClick={onReset}
          style={{
            height: "36px",
            padding: "0 14px",
            borderRadius: "8px",
            border: "1px solid #fca5a5",
            background: "#fef2f2",
            color: "#dc2626",
            fontSize: "12px",
            fontWeight: 600,
            cursor: "pointer",
            whiteSpace: "nowrap",
            transition: "all 0.15s ease",
            alignSelf: "flex-end",
          }}
        >
          Clear Filters
        </button>
      )}
    </div>
  );
}
