import { useState, useCallback, useEffect } from "react";
import { Link } from "react-router-dom";
import DashboardLayout from "../components/layout/DashboardLayout";
import { authToken, rolePath, getUser } from "../utils/auth";
import API_URL from "../config/api";
import "./Notifications.css";

const MOCK_NOTIFICATIONS = [
  {
    id: 1,
    type: "task_created",
    title: "Task Created",
    description: 'You created a new task "Database Optimization"',
    time: "2h ago",
    is_read: false,
    icon_bg: "#ede9fe",
    icon_color: "#7c3aed",
  },
  {
    id: 2,
    type: "task_status",
    title: "API Integration",
    description: 'API Integration moved to Review by AhRaza',
    time: "2h ago",
    is_read: false,
    icon_bg: "#dbeafe",
    icon_color: "#2563eb",
  },
  {
    id: 3,
    type: "project_created",
    title: "New Project",
    description: 'You created a new project "PMS Techxaro"',
    time: "2h ago",
    is_read: true,
    icon_bg: "#ecfdf5",
    icon_color: "#059669",
  },
  {
    id: 4,
    type: "task_created",
    title: "Task Created",
    description: 'You created a new task "Database Optimization"',
    time: "3min",
    is_read: true,
    icon_bg: "#ede9fe",
    icon_color: "#7c3aed",
    show_actions: true,
  },
  {
    id: 5,
    type: "team_added",
    title: "Added in Team",
    description: 'Ahzan added you in a new team "PMS Techxaro"',
    time: "2min",
    is_read: true,
    icon_bg: "#fef3c7",
    icon_color: "#d97706",
  },
  {
    id: 6,
    type: "task_done",
    title: "Task Done",
    description: 'You completed a task "Database Optimization"',
    time: "2min",
    is_read: true,
    icon_bg: "#d1fae5",
    icon_color: "#059669",
  },
  {
    id: 7,
    type: "task_created",
    title: "Task Created",
    description: 'You created a new task "Database Optimization"',
    time: "4min",
    is_read: true,
    icon_bg: "#ede9fe",
    icon_color: "#7c3aed",
    dimmed: true,
  },
  {
    id: 8,
    type: "task_completion",
    title: "Task For Completion",
    description: 'You sent the task "Database Optimization" to Ahzan for completion',
    time: "6min",
    is_read: true,
    icon_bg: "#fee2e2",
    icon_color: "#dc2626",
    dimmed: true,
  },
  {
    id: 9,
    type: "task_created",
    title: "Task Created",
    description: 'You created a new task "Database Optimization"',
    time: "2days ago",
    is_read: true,
    icon_bg: "#ede9fe",
    icon_color: "#7c3aed",
    dimmed: true,
  },
];

function Notifications() {
  const user = getUser();
  const [notifications, setNotifications] = useState(MOCK_NOTIFICATIONS);
  const [activeTab, setActiveTab] = useState("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(new Set());

  const tabs = [
    { id: "all", label: `All (${notifications.length})` },
    { id: "unread", label: `Unread (${notifications.filter((n) => !n.is_read).length})` },
    { id: "read", label: `Read (${notifications.filter((n) => n.is_read).length})` },
  ];

  const filtered = notifications.filter((n) => {
    const matchesTab =
      activeTab === "all" ||
      (activeTab === "unread" && !n.is_read) ||
      (activeTab === "read" && n.is_read);
    const matchesSearch =
      !search ||
      n.title.toLowerCase().includes(search.toLowerCase()) ||
      n.description.toLowerCase().includes(search.toLowerCase());
    return matchesTab && matchesSearch;
  });

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

  const markAsRead = (id) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    );
  };

  const markAllAsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  };

  const deleteNotification = (id) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const archiveSelected = () => {
    setNotifications((prev) => prev.filter((n) => !selected.has(n.id)));
    setSelected(new Set());
  };

  return (
    <DashboardLayout hideRightSidebar={true}>
      <div className="notif-layout">
        <div className="notif-page">
        {/* Header */}
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

        {/* Search */}
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
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button className="notif-search-clear" onClick={() => setSearch("")}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>
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
          <button className="notif-mark-all" onClick={markAllAsRead}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 11 12 14 22 4" />
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
            </svg>
            Mark all as read
          </button>
        </div>

        {/* Notification List */}
        <div className="notif-list">
          {filtered.length === 0 ? (
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
                className={`notif-item ${n.is_read ? "notif-item--read" : ""} ${n.dimmed ? "notif-item--dimmed" : ""} ${selected.has(n.id) ? "notif-item--selected" : ""}`}
              >
                <label className="notif-checkbox" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selected.has(n.id)}
                    onChange={() => toggleSelect(n.id)}
                  />
                  <span className="notif-checkbox-mark" />
                </label>

                <div className="notif-icon" style={{ background: n.icon_bg, color: n.icon_color }}>
                  {n.type === "task_created" && (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                  )}
                  {n.type === "task_status" && (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                  )}
                  {n.type === "project_created" && (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="7" height="7" />
                      <rect x="14" y="3" width="7" height="7" />
                      <rect x="3" y="14" width="7" height="7" />
                      <rect x="14" y="14" width="7" height="7" />
                    </svg>
                  )}
                  {n.type === "team_added" && (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                  )}
                  {n.type === "task_done" && (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                  {n.type === "task_completion" && (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                  )}
                </div>

                <div className="notif-content" onClick={() => markAsRead(n.id)}>
                  <h4 className="notif-item-title">{n.title}</h4>
                  <p className="notif-item-desc">{n.description}</p>
                </div>

                <div className="notif-meta">
                  <span className="notif-time">{n.time}</span>
                  <div className="notif-actions">
                    <button className="notif-action-btn" title="Archive" onClick={() => archiveSelected()}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="21 8 21 21 3 21 3 8" />
                        <rect x="1" y="3" width="22" height="5" />
                        <line x1="10" y1="12" x2="14" y2="12" />
                      </svg>
                    </button>
                    <button className="notif-action-btn notif-action-btn--danger" title="Delete" onClick={() => deleteNotification(n.id)}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
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
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              <div>
                <span className="notif-sidebar-label">Member Since</span>
                <span className="notif-sidebar-value">Jun 14, 2026</span>
              </div>
            </div>
            <div className="notif-sidebar-row">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              <div>
                <span className="notif-sidebar-label">Last Login</span>
                <span className="notif-sidebar-value">Today, 9:10 AM</span>
              </div>
            </div>
            <div className="notif-sidebar-row">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              <div>
                <span className="notif-sidebar-label">Account Type</span>
                <span className="notif-sidebar-value">{user?.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1) : "Employee"}</span>
              </div>
            </div>
          </div>
        </div>
      </aside>
    </div>
    </DashboardLayout>
  );
}

export default Notifications;
