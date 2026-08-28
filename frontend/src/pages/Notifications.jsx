/**
 * Notifications page component.
 *
 * Displays a paginated, filterable list of the current user's notifications.
 * Supports filtering by read/unread status and notification type, searching,
 * bulk selection, and marking individual or all notifications as read.
 * A right sidebar shows the user's account status summary.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import DashboardLayout from "../components/layout/DashboardLayout";
import Breadcrumb from "../components/Breadcrumb";
import { authToken, rolePath, getUser, normalizeRole } from "../utils/auth";
import { getNotificationDestination } from "../utils/navigation";
import { formatDateTimeInline } from "../utils/formatDateTime";
import { useAutoRefresh } from "../utils/useAutoRefresh";
import { publish } from "../utils/eventBus";
import { showDesktopNotification, getNotificationPermission } from "../utils/browserNotification";
import API_URL from "../config/api";
import "./Notifications.css";

/** Map of notification type keys to their display icon, background and colour. */
const TYPE_ICONS = {
  project_updated: { icon: "edit", bg: "var(--color-blue-bg)", color: "var(--color-primary)" },
  project_reopened: { icon: "refresh", bg: "var(--color-warning-bg)", color: "var(--color-warning)" },
  project_access_granted: { icon: "check", bg: "var(--color-success-bg)", color: "var(--color-success)" },
  project_access_removed: { icon: "x", bg: "var(--color-danger-bg)", color: "var(--color-danger)" },
  user_updated: { icon: "edit", bg: "var(--color-blue-bg)", color: "var(--color-primary)" },
  task_assigned: { icon: "task", bg: "var(--color-primary-bg)", color: "var(--color-primary)" },
  task_updated: { icon: "edit", bg: "var(--color-blue-bg)", color: "var(--color-primary)" },
  task_submitted: { icon: "upload", bg: "var(--color-blue-bg)", color: "var(--color-primary)" },
  task_completed: { icon: "done", bg: "var(--color-success-bg)", color: "var(--color-success)" },
  task_approved: { icon: "check", bg: "var(--color-success-bg)", color: "var(--color-success)" },
  task_rejected: { icon: "x", bg: "var(--color-danger-bg)", color: "var(--color-danger)" },
  task_reopened: { icon: "refresh", bg: "var(--color-warning-bg)", color: "var(--color-warning)" },
  deliverable_assigned: { icon: "deliverable", bg: "var(--color-primary-bg)", color: "var(--color-primary)" },
  deliverable_updated: { icon: "edit", bg: "var(--color-blue-bg)", color: "var(--color-primary)" },
  deliverable_submitted: { icon: "upload", bg: "var(--color-blue-bg)", color: "var(--color-primary)" },
  deliverable_approved: { icon: "check", bg: "var(--color-success-bg)", color: "var(--color-success)" },
  deliverable_rejected: { icon: "x", bg: "var(--color-danger-bg)", color: "var(--color-danger)" },
  deliverable_reopened: { icon: "refresh", bg: "var(--color-warning-bg)", color: "var(--color-warning)" },
  deliverable_added: { icon: "deliverable", bg: "var(--color-primary-bg)", color: "var(--color-primary)" },
  event_created: { icon: "calendar", bg: "var(--color-primary-bg)", color: "var(--color-primary)" },
  event_updated: { icon: "calendar", bg: "var(--color-blue-bg)", color: "var(--color-primary)" },
  event_cancelled: { icon: "calendar", bg: "var(--color-danger-bg)", color: "var(--color-danger)" },
  event_reminder: { icon: "alarm", bg: "var(--color-warning-bg)", color: "var(--color-warning)" },
  chat_message: { icon: "chat", bg: "var(--color-success-bg)", color: "var(--color-success)" },
};

/** Renders the appropriate SVG icon for a given notification type. */
function TypeIcon({ type }) {
  const cfg = TYPE_ICONS[type] || { icon: "bell", bg: "var(--bg-hover)", color: "var(--text-secondary)" };

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
      {cfg.icon === "chat" && (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      )}
    </div>
  );
}

/** Main Notifications page — fetches, filters and renders the user's notification feed. */
function Notifications() {
  const { t } = useTranslation();
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
  const [typeFilterOpen, setTypeFilterOpen] = useState(false);
  const [typeHighlightedIndex, setTypeHighlightedIndex] = useState(-1);
  const typeDropdownRef = useRef(null);
  const typeListRef = useRef(null);
  const lastSeenIdRef = useRef(0);

  const NOTIFICATION_TYPES = [
    { value: "", label: t("All Types", { defaultValue: "All Types" }) },
    { value: "user_updated", label: t("Profile Updated", { defaultValue: "Profile Updated" }) },
    { value: "project_updated", label: t("Project Updated", { defaultValue: "Project Updated" }) },
    { value: "project_reopened", label: t("Project Reopened", { defaultValue: "Project Reopened" }) },
    { value: "project_access_granted", label: t("Project Access Granted", { defaultValue: "Project Access Granted" }) },
    { value: "project_access_removed", label: t("Project Access Removed", { defaultValue: "Project Access Removed" }) },
    { value: "task_assigned", label: t("Task Assigned", { defaultValue: "Task Assigned" }) },
    { value: "task_updated", label: t("Task Updated", { defaultValue: "Task Updated" }) },
    { value: "task_submitted", label: t("Task Submitted", { defaultValue: "Task Submitted" }) },
    { value: "task_completed", label: t("Task Completed", { defaultValue: "Task Completed" }) },
    { value: "task_approved", label: t("Task Approved", { defaultValue: "Task Approved" }) },
    { value: "task_rejected", label: t("Task Declined", { defaultValue: "Task Declined" }) },
    { value: "task_reopened", label: t("Task Reopened", { defaultValue: "Task Reopened" }) },
    { value: "deliverable_assigned", label: t("Subtask Assigned", { defaultValue: "Subtask Assigned" }) },
    { value: "deliverable_updated", label: t("Subtask Updated", { defaultValue: "Subtask Updated" }) },
    { value: "deliverable_submitted", label: t("Subtask Submitted", { defaultValue: "Subtask Submitted" }) },
    { value: "deliverable_approved", label: t("Subtask Approved", { defaultValue: "Subtask Approved" }) },
    { value: "deliverable_rejected", label: t("Subtask Declined", { defaultValue: "Subtask Declined" }) },
    { value: "deliverable_reopened", label: t("Subtask Reopened", { defaultValue: "Subtask Reopened" }) },
    { value: "deliverable_added", label: t("Subtask Added", { defaultValue: "Subtask Added" }) },
    { value: "event_created", label: t("Event Created", { defaultValue: "Event Created" }) },
    { value: "event_updated", label: t("Event Updated", { defaultValue: "Event Updated" }) },
    { value: "event_cancelled", label: t("Event Cancelled", { defaultValue: "Event Cancelled" }) },
    { value: "event_reminder", label: t("Event Reminder", { defaultValue: "Event Reminder" }) },
    { value: "chat_message", label: t("Chat Message", { defaultValue: "Chat Message" }) },
  ];

  // Desktop notification polling - shows new notifications as desktop notifications
  useEffect(() => {
    const token = authToken();
    if (!token) return;

    const checkForNewNotifications = async () => {
      if (getNotificationPermission() !== 'granted') return;
      if (!document.hidden) return; // Only show desktop notifications when tab is in background
      try {
        const params = new URLSearchParams();
        if (lastSeenIdRef.current > 0) {
          params.set('after_id', lastSeenIdRef.current);
        }
        const url = `${API_URL}/notifications/latest?t=${Date.now()}${params.toString() ? '&' + params.toString() : ''}`;
        const res = await fetch(url, {
          headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
          skipLoader: true,
        });
        if (res.ok) {
          const data = await res.json();
          const newNotifs = data.notifications || [];
          newNotifs.forEach((n) => {
            showDesktopNotification(n);
          });
          // Update last seen ID
          if (newNotifs.length > 0) {
            const maxId = Math.max(...newNotifs.map(n => n.id));
            if (maxId > lastSeenIdRef.current) {
              lastSeenIdRef.current = maxId;
            }
          }
        }
      } catch {}
    };

    // Initial check
    checkForNewNotifications();
    const interval = setInterval(checkForNewNotifications, 15000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (typeFilterOpen) {
      const idx = NOTIFICATION_TYPES.findIndex((t) => t.value === typeFilter);
      setTypeHighlightedIndex(idx >= 0 ? idx : 0);
    } else {
      setTypeHighlightedIndex(-1);
    }
  }, [typeFilterOpen]);

  useEffect(() => {
    if (typeHighlightedIndex >= 0 && typeListRef.current) {
      const el = typeListRef.current.children[typeHighlightedIndex];
      if (el) el.scrollIntoView({ block: "nearest" });
    }
  }, [typeHighlightedIndex]);

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
      if (!res.ok) throw new Error(t("Failed to fetch notifications", { defaultValue: "Failed to fetch notifications" }));
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
  }, [activeTab, search, typeFilter, t]);

  useEffect(() => {
    fetchNotifications(1, activeTab, search);
  }, [activeTab]);

  useEffect(() => {
    if (!typeFilterOpen) return;
    const handleClickOutside = (e) => {
      if (typeDropdownRef.current && !typeDropdownRef.current.contains(e.target)) {
        setTypeFilterOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [typeFilterOpen]);

  useAutoRefresh(() => fetchNotifications(1, activeTab, search), {
    events: ["data:changed", "task:created", "task:updated", "task:deleted"],
  });

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
    { id: "all", label: t(`All ({{count}})`, { count: total, defaultValue: `All (${total})` }) },
    { id: "unread", label: t(`Unread ({{count}})`, { count: unreadCount, defaultValue: `Unread (${unreadCount})` }) },
    { id: "read", label: t(`Read ({{count}})`, { count: readCount, defaultValue: `Read (${readCount})` }) },
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
      const res = await fetch(`${API_URL}/notifications/${id}/read`, {
        method: "POST",
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
        skipLoader: true,
        _notifHandled: true,
      });
      if (res.ok) {
        setNotifications((prev) =>
          prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
        );
        publish("data:changed");
        window.dispatchEvent(new Event("notification-read"));
      }
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
        _notifHandled: true,
      });
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      publish("data:changed");
      window.dispatchEvent(new Event("notification-read"));
    } catch {}
  };

  const getLinkPath = (n) => {
    return getNotificationDestination(n);
  };

  return (
    <DashboardLayout hideRightSidebar={true}>
      <Breadcrumb items={[{ label: t("Notifications", { defaultValue: "Notifications" }) }]} />
      <br />
      <div className="notif-layout">
        {/* Header - spans full width */}
  
        <div className="notif-layout-row">
              <div className="notif-header">
          <div className="notif-header-left">
            <div className="notif-header-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--text-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
            </div>
            <div>
              <h1 className="notif-title">{t("Notifications", { defaultValue: "Notifications" })}</h1>
              <p className="notif-subtitle">{t("Stay updated with your latest activities", { defaultValue: "Stay updated with your latest activities" })}</p>
            </div>
          </div>
        </div>
        <div className="notif-page">
          {/* Search + Type Filter */}
          <div className="notif-search-wrap">
            <div className="notif-search">
                <svg className="notif-search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                placeholder={t("Search by notification title or message...", { defaultValue: "Search by notification title or message..." })}
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
            <div className="notif-type-dropdown" ref={typeDropdownRef}>
              <button
                className="notif-type-btn"
                onClick={() => {
                  const idx = NOTIFICATION_TYPES.findIndex((t) => t.value === typeFilter);
                  setTypeHighlightedIndex(idx >= 0 ? idx : 0);
                  setTypeFilterOpen((o) => !o);
                }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                    e.preventDefault();
                    if (!typeFilterOpen) {
                      const idx = NOTIFICATION_TYPES.findIndex((t) => t.value === typeFilter);
                      setTypeHighlightedIndex(idx >= 0 ? idx : 0);
                      setTypeFilterOpen(true);
                    } else {
                      setTypeHighlightedIndex((prev) => {
                        if (e.key === "ArrowDown") return Math.min(prev + 1, NOTIFICATION_TYPES.length - 1);
                        return Math.max(prev - 1, 0);
                      });
                    }
                  } else if (e.key === "Enter" && typeFilterOpen && typeHighlightedIndex >= 0) {
                  } else if (e.key === "Enter" && typeFilterOpen && typeHighlightedIndex >= 0) {
                    e.preventDefault();
                    const tVal = NOTIFICATION_TYPES[typeHighlightedIndex];
                    setTypeFilter(tVal.value);
                    fetchNotifications(1, activeTab, search, tVal.value);
                    setTypeFilterOpen(false);
                  } else if (e.key === "Escape" && typeFilterOpen) {
                    e.preventDefault();
                    setTypeFilterOpen(false);
                  }
                }}
              >
                <span>{NOTIFICATION_TYPES.find((t) => t.value === typeFilter)?.label || t("All Types", { defaultValue: "All Types" })}</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
              {typeFilterOpen && (
                <div className="notif-type-list" ref={typeListRef}>
                  {NOTIFICATION_TYPES.map((tVal, idx) => (
                    <button
                      key={tVal.value}
                      className={`notif-type-item ${typeFilter === tVal.value ? "notif-type-item--active" : ""} ${typeHighlightedIndex === idx ? "notif-type-item--highlighted" : ""}`}
                      onClick={() => {
                        setTypeFilter(tVal.value);
                        fetchNotifications(1, activeTab, search, tVal.value);
                        setTypeFilterOpen(false);
                      }}
                      onMouseEnter={() => setTypeHighlightedIndex(idx)}
                    >
                      {tVal.label}
                    </button>
                  ))}
                </div>
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
            {unreadCount > 0 && (
              <button className="notif-mark-all" onClick={markAllAsRead}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 11 12 14 22 4" />
                  <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                </svg>
                {t("Mark all as read", { defaultValue: "Mark all as read" })}
              </button>
            )}
          </div>

          <div className="notif-gap"></div>

          {/* Notification List */}
          <div className="notif-list">
            {loading ? (
              <div className="notif-empty">
                <div className="notif-spinner"></div>
                <p>{t("Loading notifications...", { defaultValue: "Loading notifications..." })}</p>
              </div>
            ) : error ? (
              <div className="notif-empty">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--color-danger)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <p style={{ color: "var(--color-danger)" }}>{error}</p>
                <button
                  onClick={() => fetchNotifications(1, activeTab, search)}
                  style={{ marginTop: 8, padding: "6px 16px", border: "1px solid var(--border-color)", borderRadius: 8, background: "var(--bg-card)", cursor: "pointer", fontSize: 13 }}
                >
                  {t("Try again", { defaultValue: "Try again" })}
                </button>
              </div>
            ) : filtered.length === 0 ? (
              <div className="notif-empty">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--border-medium)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
                <p>{t("No notifications found.", { defaultValue: "No notifications found." })}</p>
              </div>
            ) : (
              filtered.map((n) => (
                <div
                  key={n.id}
                  className={`notif-item ${n.is_read ? "notif-item--read" : "notif-item--unread"} ${selected.has(n.id) ? "notif-item--selected" : ""}`}
                >
                  <label className="notif-checkbox" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selected.has(n.id)}
                      onChange={() => toggleSelect(n.id)}
                    />
                    <span className="notif-checkbox-mark" />
                  </label>

                  <Link
                    to={n.type === "chat_message" ? "#" : getLinkPath(n)}
                    style={{ display: "flex", gap: 12, alignItems: "flex-start", flex: 1, minWidth: 0, textDecoration: "none" }}
                    onClick={(e) => {
                      if (!n.is_read) markAsRead(n.id);
                      if (n.type === "chat_message") {
                        e.preventDefault();
                        window.dispatchEvent(new CustomEvent("chat-widget-open", { detail: { conversationId: n.related_id } }));
                      }
                    }}
                  >
                    <TypeIcon type={n.type} />

                    <div className="notif-content">
                      <h4 className="notif-item-title">{t(n.title || n.type, { defaultValue: n.title || n.type })}</h4>
                      <p className="notif-item-desc">
                        {n.sender && !n.message.includes(n.sender.name) ? `${n.sender.name} - ` : ""}
                        {n.message}
                      </p>
                    </div>

                    <div className="notif-meta">
                      <span className="notif-time">{formatDateTimeInline(n.created_at_raw)}</span>
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
                {t("Previous", { defaultValue: "Previous" })}
              </button>
              <span className="notif-page-info">
                {t("Page {{page}} of {{lastPage}}", { page, lastPage, defaultValue: `Page ${page} of ${lastPage}` })}
              </span>
              <button
                className="notif-page-btn"
                disabled={page >= lastPage}
                onClick={() => handlePageChange(page + 1)}
              >
                {t("Next", { defaultValue: "Next" })}
              </button>
            </div>
          )}
        </div>
        </div>
         {/* Account Status Sidebar */}
        <aside className="notif-sidebar">
          <div className="notif-sidebar-card">
            <h3 className="notif-sidebar-title">{t("Account Status", { defaultValue: "Account Status" })}</h3>
            <div className="notif-sidebar-status">
              <span className="notif-sidebar-dot"></span>
              <span className="notif-sidebar-status-text">{t("Active", { defaultValue: "Active" })}</span>
            </div>
            <div className="notif-sidebar-info">
              <div className="notif-sidebar-row">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
                <div>
                  <span className="notif-sidebar-label">{t("Account Type", { defaultValue: "Account Type" })}</span>
                  <span className="notif-sidebar-value">{user?.role ? t(normalizeRole(user.role), { defaultValue: normalizeRole(user.role) }) : t("Employee", { defaultValue: "Employee" })}</span>
                </div>
              </div>
              <div className="notif-sidebar-row">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                <div>
                  <span className="notif-sidebar-label">{t("Last Login", { defaultValue: "Last Login" })}</span>
                  <span className="notif-sidebar-value">{t("Today", { defaultValue: "Today" })}</span>
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
