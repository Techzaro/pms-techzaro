/**
 * Notifications page component.
 *
 * Displays a paginated, filterable list of the current user's notifications.
 * Supports filtering by read/unread status and notification type, searching,
 * bulk selection, and marking individual or all notifications as read.
 * A right sidebar shows the user's account status summary.
 */

import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import DashboardLayout from "../components/layout/DashboardLayout";
import { authToken, rolePath, getUser, normalizeRole } from "../utils/auth";
import { timeAgo } from "../utils/formatDateTime";
import { useRelativeTime } from "../hooks/useRelativeTime";
import { useRefreshOnEvent } from "../utils/useRefreshOnEvent";
import API_URL from "../config/api";
import "./Notifications.css";

/** Map of notification type keys to their display icon, background and colour. */
const TYPE_ICONS = {
  project_assigned: { icon: "folder", bg: "#ede9fe", color: "#7c3aed" },
  project_updated: { icon: "edit", bg: "#dbeafe", color: "#2563eb" },
  project_submitted: { icon: "upload", bg: "#dbeafe", color: "#2563eb" },
  project_approved: { icon: "check", bg: "#d1fae5", color: "#059669" },
  project_rejected: { icon: "x", bg: "#fee2e2", color: "#dc2626" },
  project_reopened: { icon: "refresh", bg: "#fef3c7", color: "#d97706" },
  project_access_granted: { icon: "check", bg: "#d1fae5", color: "#059669" },
  project_access_removed: { icon: "x", bg: "#fee2e2", color: "#dc2626" },
  user_updated: { icon: "edit", bg: "#dbeafe", color: "#2563eb" },
  task_assigned: { icon: "task", bg: "#ede9fe", color: "#7c3aed" },
  task_updated: { icon: "edit", bg: "#dbeafe", color: "#2563eb" },
  task_submitted: { icon: "upload", bg: "#dbeafe", color: "#2563eb" },
  task_completed: { icon: "done", bg: "#d1fae5", color: "#059669" },
  task_approved: { icon: "check", bg: "#d1fae5", color: "#059669" },
  task_rejected: { icon: "x", bg: "#fee2e2", color: "#dc2626" },
  task_reopened: { icon: "refresh", bg: "#fef3c7", color: "#d97706" },
  deliverable_assigned: { icon: "deliverable", bg: "#ede9fe", color: "#7c3aed" },
  deliverable_updated: { icon: "edit", bg: "#dbeafe", color: "#2563eb" },
  deliverable_submitted: { icon: "upload", bg: "#dbeafe", color: "#2563eb" },
  deliverable_approved: { icon: "check", bg: "#d1fae5", color: "#059669" },
  deliverable_rejected: { icon: "x", bg: "#fee2e2", color: "#dc2626" },
  deliverable_reopened: { icon: "refresh", bg: "#fef3c7", color: "#d97706" },
  event_created: { icon: "calendar", bg: "#ede9fe", color: "#7c3aed" },
  event_updated: { icon: "calendar", bg: "#dbeafe", color: "#2563eb" },
  event_cancelled: { icon: "calendar", bg: "#fee2e2", color: "#dc2626" },
  event_reminder: { icon: "alarm", bg: "#fef3c7", color: "#d97706" },
};

/** Renders the appropriate SVG icon for a given notification type. */
function TypeIcon({ type }) {
  const cfg = TYPE_ICONS[type] || { icon: "bell", bg: "#f3f4f6", color: "#6b7280" };

  return (
    <div className="notif-icon" style={{ background: cfg.bg, color: cfg.color }}>
      {cfg.icon === "folder" && (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
      )}
      {cfg.icon === "upload" && (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
      )}
      {cfg.icon === "check" && (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
      {cfg.icon === "x" && (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      )}
      {cfg.icon === "refresh" && (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="23 4 23 10 17 10" />
          <polyline points="1 20 1 14 7 14" />
          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
        </svg>
      )}
      {cfg.icon === "task" && (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 11l3 3L22 4" />
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
        </svg>
      )}
      {cfg.icon === "done" && (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      )}
      {cfg.icon === "deliverable" && (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="16 3 21 3 21 8" />
          <line x1="4" y1="20" x2="21" y2="3" />
          <polyline points="21 16 21 21 16 21" />
          <line x1="15" y1="15" x2="21" y2="21" />
          <line x1="4" y1="4" x2="9" y2="9" />
        </svg>
      )}
      {cfg.icon === "bell" && (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
      )}
      {cfg.icon === "calendar" && (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      )}
      {cfg.icon === "alarm" && (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="13" r="8" />
          <polyline points="12 9 12 13 15 15" />
          <line x1="3" y1="3" x2="6" y2="6" />
          <line x1="21" y1="3" x2="18" y2="6" />
        </svg>
      )}
      {cfg.icon === "edit" && (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
      )}
    </div>
  );
}

/** Main Notifications page — fetches, filters and renders the user's notification feed. */
function Notifications() {
  const user = getUser();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("all");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [selected, setSelected] = useState(new Set());
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [total, setTotal] = useState(0);
  const tick = useRelativeTime();

  const NOTIFICATION_TYPES = [
    { value: "", label: "All Types" },
    { value: "user_updated", label: "Profile Updated" },
    { value: "project_assigned", label: "Project Assigned" },
    { value: "project_updated", label: "Project Updated" },
    { value: "project_submitted", label: "Project Submitted" },
    { value: "project_approved", label: "Project Approved" },
    { value: "project_rejected", label: "Project Rejected" },
    { value: "project_reopened", label: "Project Reopened" },
    { value: "project_access_granted", label: "Project Access Granted" },
    { value: "project_access_removed", label: "Project Access Removed" },
    { value: "task_assigned", label: "Task Assigned" },
    { value: "task_updated", label: "Task Updated" },
    { value: "task_submitted", label: "Task Submitted" },
    { value: "task_completed", label: "Task Completed" },
    { value: "task_approved", label: "Task Approved" },
    { value: "task_rejected", label: "Task Rejected" },
    { value: "task_reopened", label: "Task Reopened" },
    { value: "deliverable_assigned", label: "Deliverable Assigned" },
    { value: "deliverable_updated", label: "Deliverable Updated" },
    { value: "deliverable_submitted", label: "Deliverable Submitted" },
    { value: "deliverable_approved", label: "Deliverable Approved" },
    { value: "deliverable_rejected", label: "Deliverable Rejected" },
    { value: "deliverable_reopened", label: "Deliverable Reopened" },
    { value: "event_created", label: "Event Created" },
    { value: "event_updated", label: "Event Updated" },
    { value: "event_cancelled", label: "Event Cancelled" },
    { value: "event_reminder", label: "Event Reminder" },
  ];

  /**
   * Fetch notifications from the API with the given page, tab filter,
   * search query and type filter.
   */
  const fetchNotifications = useCallback(async (p = 1, filter = activeTab, q = search, type = typeFilter) => {
    const token = authToken();
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: p });
      if (filter === "unread") params.set("filter", "unread");
      else if (filter === "read") params.set("filter", "read");
      if (q) params.set("search", q);
      if (type) params.set("type", type);

      const res = await fetch(`${API_URL}/notifications?${params}`, {
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
        skipLoader: true,
      });
      if (!res.ok) throw new Error("Failed to fetch notifications");
      const data = await res.json();
      setNotifications(data.data || []);
      setPage(data.meta?.current_page || data.current_page || 1);
      setLastPage(data.meta?.last_page || data.last_page || 1);
      setTotal(data.meta?.total || data.total || 0);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [activeTab, search, typeFilter]);

  useEffect(() => {
    fetchNotifications(1, activeTab, search);
  }, [activeTab]);

  useRefreshOnEvent(["data:changed"], () => fetchNotifications(1, activeTab, search));

  const handleSearch = (q) => {
    setSearch(q);
    if (q.length >= 2 || q.length === 0) {
      fetchNotifications(1, activeTab, q);
    }
  };

  const handlePageChange = (p) => {
    if (p < 1 || p > lastPage) return;
    fetchNotifications(p, activeTab, search);
  };

  const unreadCount = notifications.filter((n) => !n.is_read).length;
  const readCount = notifications.filter((n) => n.is_read).length;

  const tabs = [
    { id: "all", label: `All (${total})` },
    { id: "unread", label: `Unread (${unreadCount})` },
    { id: "read", label: `Read (${readCount})` },
  ];

  const filtered = notifications;

  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((n) => n.id)));
    }
  };

  /** Mark a single notification as read via the API and update local state. */
  const markAsRead = async (id) => {
    const token = authToken();
    if (!token) return;
    try {
      await fetch(`${API_URL}/notifications/${id}/read`, {
        method: "POST",
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
        skipLoader: true,
      });
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      );
    } catch {}
  };

  /** Mark all unread notifications as read in one API call. */
  const markAllAsRead = async () => {
    const token = authToken();
    if (!token) return;
    try {
      await fetch(`${API_URL}/notifications/read-all`, {
        method: "POST",
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
        skipLoader: true,
      });
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    } catch {}
  };

  const getLinkPath = (n) => {
    if (n.link) {
      const role = user?.role || "admin";
      return rolePath(n.link.replace(/^\//, ""));
    }
    return "#";
  };

  return (
    <DashboardLayout hideRightSidebar={true}>
      <br />
      <div className="notif-layout">
        {/* Header - spans full width */}
        <div className="notif-header">
          <div className="notif-header-left">
            <div className="notif-header-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#111827" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
            </div>
            <div>
              <h1 className="notif-title">Notifications</h1>
              <p className="notif-subtitle">Stay updated with your latest activities</p>
            </div>
          </div>
        </div>

        <div className="notif-layout-row">
        <div className="notif-page">
          {/* Search + Type Filter */}
          <div className="notif-search-wrap">
            <div className="notif-search">
              <svg className="notif-search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                placeholder="Search notifications..."
                value={search}
                onChange={(e) => handleSearch(e.target.value)}
              />
              {search && (
                <button className="notif-search-clear" onClick={() => handleSearch("")}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              )}
            </div>
            <select
              className="notif-type-filter"
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value);
                fetchNotifications(1, activeTab, search, e.target.value);
              }}
            >
              {NOTIFICATION_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          {/* Tabs + Mark All */}
          <div className="notif-toolbar">
            <div className="notif-tabs">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  className={`notif-tab ${activeTab === tab.id ? "notif-tab--active" : ""}`}
                  onClick={() => setActiveTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            {unreadCount > 0 && (
              <button className="notif-mark-all" onClick={markAllAsRead}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 11 12 14 22 4" />
                  <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                </svg>
                Mark all as read
              </button>
            )}
          </div>

          <div className="notif-gap"></div>

          {/* Notification List */}
          <div className="notif-list">
            {loading ? (
              <div className="notif-empty">
                <div className="notif-spinner"></div>
                <p>Loading notifications...</p>
              </div>
            ) : error ? (
              <div className="notif-empty">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <p style={{ color: "#ef4444" }}>{error}</p>
                <button
                  onClick={() => fetchNotifications(1, activeTab, search)}
                  style={{ marginTop: 8, padding: "6px 16px", border: "1px solid #e5e7eb", borderRadius: 8, background: "#fff", cursor: "pointer", fontSize: 13 }}
                >
                  Try again
                </button>
              </div>
            ) : filtered.length === 0 ? (
              <div className="notif-empty">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
                <p>No notifications found.</p>
              </div>
            ) : (
              filtered.map((n) => (
                <div
                  key={n.id}
                  className={`notif-item ${n.is_read ? "notif-item--read" : ""} ${selected.has(n.id) ? "notif-item--selected" : ""}`}
                >
                  <label className="notif-checkbox" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selected.has(n.id)}
                      onChange={() => toggleSelect(n.id)}
                    />
                    <span className="notif-checkbox-mark" />
                  </label>

                  <Link to={getLinkPath(n)} style={{ display: "flex", gap: 12, alignItems: "flex-start", flex: 1, minWidth: 0, textDecoration: "none" }} onClick={() => !n.is_read && markAsRead(n.id)}>
                    <TypeIcon type={n.type} />

                    <div className="notif-content">
                      <h4 className="notif-item-title">{n.title || n.type}</h4>
                      <p className="notif-item-desc">
                        {n.sender && !n.message.includes(n.sender.name) ? `${n.sender.name} - ` : ""}
                        {n.message}
                      </p>
                    </div>

                    <div className="notif-meta">
                      <span className="notif-time">{timeAgo(n.created_at_raw)}</span>
                      {!n.is_read && <span className="notif-unread-dot"></span>}
                    </div>
                  </Link>
                </div>
              ))
            )}
          </div>

          {/* Pagination */}
          {lastPage > 1 && !loading && (
            <div className="notif-pagination">
              <button
                className="notif-page-btn"
                disabled={page <= 1}
                onClick={() => handlePageChange(page - 1)}
              >
                Previous
              </button>
              <span className="notif-page-info">
                Page {page} of {lastPage}
              </span>
              <button
                className="notif-page-btn"
                disabled={page >= lastPage}
                onClick={() => handlePageChange(page + 1)}
              >
                Next
              </button>
            </div>
          )}
        </div>

        {/* Account Status Sidebar */}
        <aside className="notif-sidebar">
          <div className="notif-sidebar-card">
            <h3 className="notif-sidebar-title">Account Status</h3>
            <div className="notif-sidebar-status">
              <span className="notif-sidebar-dot"></span>
              <span className="notif-sidebar-status-text">Active</span>
            </div>
            <div className="notif-sidebar-info">
              <div className="notif-sidebar-row">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
                <div>
                  <span className="notif-sidebar-label">Account Type</span>
                  <span className="notif-sidebar-value">{user?.role ? normalizeRole(user.role) : "Employee"}</span>
                </div>
              </div>
              <div className="notif-sidebar-row">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                <div>
                  <span className="notif-sidebar-label">Last Login</span>
                  <span className="notif-sidebar-value">Today</span>
                </div>
              </div>
            </div>
          </div>
        </aside>
        </div>
      </div>
    </DashboardLayout>
  );
}

export default Notifications;
