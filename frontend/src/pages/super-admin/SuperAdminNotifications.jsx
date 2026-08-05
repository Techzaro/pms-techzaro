import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "./api/superAdminApi";
import { formatDateTimeInline } from "../../utils/formatDateTime";
import { showDesktopNotification, getNotificationPermission } from "../../utils/browserNotification";
import "./SuperAdminNotifications.css";

const TYPE_ICONS = {
  subscription_renewed: { icon: "refresh", bg: "#dcfce7", color: "#16a34a" },
  organization_created: { icon: "check", bg: "#dcfce7", color: "#16a34a" },
  organization_updated: { icon: "edit", bg: "#dbeafe", color: "#2563eb" },
  organization_suspended: { icon: "x", bg: "#fee2e2", color: "#dc2626" },
  organization_activated: { icon: "check", bg: "#dcfce7", color: "#16a34a" },
  organization_deleted: { icon: "x", bg: "#fee2e2", color: "#dc2626" },
  organization_restored: { icon: "refresh", bg: "#dcfce7", color: "#16a34a" },
  plan_changed: { icon: "edit", bg: "#dbeafe", color: "#2563eb" },
  trial_activated: { icon: "check", bg: "#dcfce7", color: "#16a34a" },
  trial_expired: { icon: "x", bg: "#fee2e2", color: "#dc2626" },
};

function TypeIcon({ type }) {
  const cfg = TYPE_ICONS[type] || { icon: "bell", bg: "var(--bg-hover)", color: "var(--text-secondary)" };
  return (
    <div className="sanotif-icon" style={{ background: cfg.bg, color: cfg.color }}>
      {cfg.icon === "refresh" && (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
        </svg>
      )}
      {cfg.icon === "edit" && (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
      )}
      {cfg.icon === "task" && (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
        </svg>
      )}
      {cfg.icon === "check" && (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
      {cfg.icon === "x" && (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      )}
      {cfg.icon === "upload" && (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
        </svg>
      )}
      {cfg.icon === "calendar" && (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      )}
      {cfg.icon === "bell" && (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
      )}
    </div>
  );
}

const NOTIFICATION_TYPES = [
  { value: "", label: "All Types" },
  { value: "subscription_renewed", label: "Subscription Renewed" },
  { value: "organization_created", label: "Organization Created" },
  { value: "organization_updated", label: "Organization Updated" },
  { value: "organization_suspended", label: "Organization Suspended" },
  { value: "organization_activated", label: "Organization Activated" },
  { value: "plan_changed", label: "Plan Changed" },
  { value: "trial_activated", label: "Trial Activated" },
  { value: "trial_expired", label: "Trial Expired" },
];

function SuperAdminNotifications() {
  const navigate = useNavigate();
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

  // Desktop notification polling
  useEffect(() => {
    const checkForNew = async () => {
      if (getNotificationPermission() !== "granted" || !document.hidden) return;
      try {
        const params = lastSeenIdRef.current > 0 ? `?after_id=${lastSeenIdRef.current}` : "";
        const data = await api.getLatestNotifications(lastSeenIdRef.current || undefined);
        (data.notifications || []).forEach((n) => showDesktopNotification(n));
        if (data.notifications?.length > 0) {
          const maxId = Math.max(...data.notifications.map((n) => n.id));
          if (maxId > lastSeenIdRef.current) lastSeenIdRef.current = maxId;
        }
      } catch {}
    };
    checkForNew();
    const interval = setInterval(checkForNew, 15000);
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

  const fetchNotifications = useCallback(
    async (p = 1, filter = activeTab, q = search, type = typeFilter) => {
      setLoading(true);
      setError(null);
      try {
        const params = { page: p };
        if (filter === "unread") params.filter = "unread";
        else if (filter === "read") params.filter = "read";
        if (q) params.search = q;
        if (type) params.type = type;

        const data = await api.getNotifications(params);
        setNotifications(data.data || []);
        setPage(data.page || 1);
        setLastPage(data.last_page || 1);
        setTotal(data.total || 0);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    },
    [activeTab, search, typeFilter]
  );

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

  const handleSearch = (q) => {
    setSearch(q);
    if (q.length >= 2 || q.length === 0) fetchNotifications(1, activeTab, q);
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

  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const markAsRead = async (id) => {
    try {
      await api.markNotificationRead(id);
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: 1 } : n)));
    } catch {}
  };

  const markAllAsRead = async () => {
    try {
      await api.markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: 1 })));
    } catch {}
  };

  const getLinkPath = (n) => {
    if (n.link) {
      const cleanLink = n.link.replace(/^\//, "");
      return `/super-admin/${cleanLink}`;
    }
    return "/super-admin/organizations";
  };

  return (
    <div className="sanotif-page">
      {/* Header */}
      <div className="sanotif-header">
        <div className="sanotif-header-left">
          <div className="sanotif-header-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--text-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
          </div>
          <div>
            <h1 className="sanotif-title">Notifications</h1>
            <p className="sanotif-subtitle">Stay updated with platform activity</p>
          </div>
        </div>
      </div>

      {/* Search + Type Filter */}
      <div className="sanotif-search-wrap">
        <div className="sanotif-search">
          <svg className="sanotif-search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="Search notifications..."
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
          />
          {search && (
            <button className="sanotif-search-clear" onClick={() => handleSearch("")}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>
        <div className="sanotif-type-dropdown" ref={typeDropdownRef}>
          <button
            className="sanotif-type-btn"
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
                  setTypeHighlightedIndex((prev) => (e.key === "ArrowDown" ? Math.min(prev + 1, NOTIFICATION_TYPES.length - 1) : Math.max(prev - 1, 0)));
                }
              } else if (e.key === "Enter" && typeFilterOpen && typeHighlightedIndex >= 0) {
                e.preventDefault();
                const t = NOTIFICATION_TYPES[typeHighlightedIndex];
                setTypeFilter(t.value);
                fetchNotifications(1, activeTab, search, t.value);
                setTypeFilterOpen(false);
              } else if (e.key === "Escape" && typeFilterOpen) {
                e.preventDefault();
                setTypeFilterOpen(false);
              }
            }}
          >
            <span>{NOTIFICATION_TYPES.find((t) => t.value === typeFilter)?.label || "All Types"}</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
          {typeFilterOpen && (
            <div className="sanotif-type-list" ref={typeListRef}>
              {NOTIFICATION_TYPES.map((t, idx) => (
                <button
                  key={t.value}
                  className={`sanotif-type-item ${typeFilter === t.value ? "sanotif-type-item--active" : ""} ${typeHighlightedIndex === idx ? "sanotif-type-item--highlighted" : ""}`}
                  onClick={() => {
                    setTypeFilter(t.value);
                    fetchNotifications(1, activeTab, search, t.value);
                    setTypeFilterOpen(false);
                  }}
                  onMouseEnter={() => setTypeHighlightedIndex(idx)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Tabs + Mark All */}
      <div className="sanotif-toolbar">
        <div className="sanotif-tabs">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`sanotif-tab ${activeTab === tab.id ? "sanotif-tab--active" : ""}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {unreadCount > 0 && (
          <button className="sanotif-mark-all" onClick={markAllAsRead}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 11 12 14 22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
            </svg>
            Mark all as read
          </button>
        )}
      </div>

      <div className="sanotif-gap"></div>

      {/* Notification List */}
      <div className="sanotif-list">
        {loading ? (
          <div className="sanotif-empty">
            <div className="sanotif-spinner"></div>
            <p>Loading notifications...</p>
          </div>
        ) : error ? (
          <div className="sanotif-empty">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--color-danger)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <p style={{ color: "var(--color-danger)" }}>{error}</p>
            <button onClick={() => fetchNotifications(1, activeTab, search)} className="sanotif-retry-btn">
              Try again
            </button>
          </div>
        ) : notifications.length === 0 ? (
          <div className="sanotif-empty">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--border-medium)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            <p>No notifications found.</p>
          </div>
        ) : (
          notifications.map((n) => (
            <div
              key={n.id}
              className={`sanotif-item ${n.is_read ? "sanotif-item--read" : "sanotif-item--unread"} ${selected.has(n.id) ? "sanotif-item--selected" : ""}`}
            >
              <label className="sanotif-checkbox" onClick={(e) => e.stopPropagation()}>
                <input type="checkbox" checked={selected.has(n.id)} onChange={() => toggleSelect(n.id)} />
                <span className="sanotif-checkbox-mark" />
              </label>

              <div
                className="sanotif-item-link"
                onClick={() => {
                  if (!n.is_read) markAsRead(n.id);
                  navigate(getLinkPath(n));
                }}
              >
                <TypeIcon type={n.type} />
                <div className="sanotif-content">
                  <h4 className="sanotif-item-title">{n.title || n.type}</h4>
                  <p className="sanotif-item-desc">{n.message}</p>
                </div>
                <div className="sanotif-meta">
                  <span className="sanotif-time">{formatDateTimeInline(n.created_at)}</span>
                  {!n.is_read && <span className="sanotif-unread-dot"></span>}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Pagination */}
      {lastPage > 1 && !loading && (
        <div className="sanotif-pagination">
          <button className="sanotif-page-btn" disabled={page <= 1} onClick={() => handlePageChange(page - 1)}>
            Previous
          </button>
          <span className="sanotif-page-info">Page {page} of {lastPage}</span>
          <button className="sanotif-page-btn" disabled={page >= lastPage} onClick={() => handlePageChange(page + 1)}>
            Next
          </button>
        </div>
      )}
    </div>
  );
}

export default SuperAdminNotifications;
