/**
 * Header - Application header bar for the PMS dashboard.
 * Contains: logo, global search (pages/projects/tasks/users), quick-create
 * buttons (+ Task, + Project), notification bell with unread badge, and a
 * user profile dropdown. Handles responsive behaviour (logo visibility,
 * sidebar toggle) and real-time notification polling.
 */

import { useEffect, useState, useRef, useCallback } from "react";
import { MdKeyboardArrowDown, MdNotifications, MdPerson, MdHistory, MdLogout, MdLock } from "react-icons/md";
import { useNavigate } from "react-router-dom";

import API_URL from "../../config/api";
import { authToken, getCurrentRole, getUser, setUser, clearSession, getToken, rolePath, normalizeRole } from "../../utils/auth";
import { subscribe } from "../../utils/eventBus";
import { requestNotificationPermission, showBrowserNotification } from "../../utils/browserNotification";
import { initFirebase } from "../../utils/firebase";
import { formatDateTimeInline } from "../../utils/formatDateTime";
import { getNotificationDestination } from "../../utils/navigation";
import "./Header.css";

import CreateTaskModal from "../CreateTaskModal";
import CreateProjectModal from "../CreateProjectModal";
import ChangePasswordModal from "../ChangePasswordModal";

/**
 * Header component – renders the top navigation bar.
 */
function Header() {
  const navigate = useNavigate();
  const searchRef = useRef(null);
  const notifRef = useRef(null);

  // ── State ──
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isSmallScreen, setIsSmallScreen] = useState(window.innerWidth <= 1200);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const prevCountRef = useRef(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);

  // Request browser notification permission and initialise Firebase on mount
  useEffect(() => {
    requestNotificationPermission();
    initFirebase();
  }, []);

  // ── Search state & debounce ──
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [searchResults, setSearchResults] = useState({ pages: [], projects: [], tasks: [], users: [] });
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);

  /** Returns the list of navigable pages with keywords for local search. */
  const getPageLinks = () => [
    { name: "Dashboard", path: rolePath("dashboard"), keywords: "dashboard home" },
    { name: "Projects", path: rolePath("projects"), keywords: "projects list" },
    { name: "Tasks Assigned to You", path: rolePath("tasks"), keywords: "my tasks assigned" },
    { name: "Tasks Assigned by You", path: rolePath("taskby"), keywords: "tasks created by me" },
    { name: "Deliverables", path: rolePath("deliveries"), keywords: "deliveries deliverables" },
    { name: "Calendar", path: rolePath("calender"), keywords: "calendar events schedule" },
    { name: "Manage Users", path: rolePath("manage-users"), keywords: "users manage" },
    { name: "Manage Team", path: rolePath("manage-team"), keywords: "team manage" },
    { name: "Reports", path: rolePath("reports"), keywords: "reports analytics" },
    { name: "History", path: rolePath("history"), keywords: "history activity log" },
  ];

  // Listen for sidebar open/close to control logo visibility
  useEffect(() => {
    const handler = (e) => setSidebarOpen(e.detail.open);
    window.addEventListener("sidebar-state", handler);
    return () => window.removeEventListener("sidebar-state", handler);
  }, []);

  // Track viewport width for responsive behaviour
  useEffect(() => {
    const onResize = () => setIsSmallScreen(window.innerWidth <= 1200);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Broadcast profile dropdown state so other components can react
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("modal-state", { detail: { open: isProfileOpen } }));
  }, [isProfileOpen]);

  const showFullLogo = sidebarOpen || !isSmallScreen;

  /** User info loaded from local storage on first render. */
  const [user, setUserState] = useState(() => {
    const stored = getUser();
    return {
      name: stored?.name || "User",
      email: stored?.email || "user@example.com",
      role: stored?.role || "Member",
      avatar: stored?.avatar || null,
    };
  });

  const toggleProfileModal = () =>
    setIsProfileOpen((prev) => !prev);

  // Debounce search input – only trigger after 300ms of inactivity
  useEffect(() => {
    if (searchQuery.trim().length < 2) {
      setDebouncedQuery("");
      return;
    }
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fire search when debounced value changes
  useEffect(() => {
    if (debouncedQuery.trim().length < 2) {
      setSearchResults({ pages: [], projects: [], tasks: [], users: [] });
      setShowSearchDropdown(false);
      return;
    }
    handleSearch(debouncedQuery);
  }, [debouncedQuery]);

  /**
   * Performs a combined search across local page links and remote APIs
   * (projects, tasks, users). Results are limited to 5 per category.
   */
  const handleSearch = async (query) => {

    const q = query.toLowerCase();

    // 1. Match navigable pages locally
    const matchedPages = getPageLinks().filter(
      (p) => p.name.toLowerCase().includes(q) || p.keywords.includes(q)
    );

    let matchedProjects = [];
    let matchedTasks = [];
    let matchedUsers = [];

    // 2. Fetch and filter remote data in parallel
    try {
      const token = authToken();
      const headers = { Accept: "application/json", Authorization: token ? `Bearer ${token}` : "" };

      const [projRes, taskRes, userRes] = await Promise.allSettled([
        fetch(`${API_URL}/projects`, { headers, skipLoader: true }),
        fetch(`${API_URL}/my-tasks`, { headers, skipLoader: true }),
        fetch(`${API_URL}/users`, { headers, skipLoader: true }),
      ]);

      if (projRes.status === "fulfilled" && projRes.value.ok) {
        const projData = await projRes.value.json();
        const projList = projData.projects ?? projData ?? [];
        matchedProjects = projList
          .filter((p) => p.title?.toLowerCase().includes(q))
          .slice(0, 5)
          .map((p) => ({ id: p.id, name: p.title, path: rolePath(`projects/project-details/${p.id}`) }));
      }

      if (taskRes.status === "fulfilled" && taskRes.value.ok) {
        const taskData = await taskRes.value.json();
        const taskList = taskData.tasks ?? taskData ?? [];
        matchedTasks = taskList
          .filter((t) => t.name?.toLowerCase().includes(q) || t.title?.toLowerCase().includes(q))
          .slice(0, 5)
          .map((t) => ({ id: t.id, name: t.name || t.title, path: rolePath(`tasks/task-details/${t.id}`) }));
      }

      if (userRes.status === "fulfilled" && userRes.value.ok) {
        const userData = await userRes.value.json();
        const userList = userData.users ?? userData ?? [];
        matchedUsers = userList
          .filter((u) => u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q))
          .slice(0, 5)
          .map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, path: rolePath(`manage-users/user-profile/${u.id}`) }));
      }
    } catch {
      // API not available, show only page results
    }

    setSearchResults({ pages: matchedPages, projects: matchedProjects, tasks: matchedTasks, users: matchedUsers });
    setShowSearchDropdown(true);
  };

  /** Navigate to the selected result and reset the search bar. */
  const handleSearchSelect = (path) => {
    setShowSearchDropdown(false);
    setSearchQuery("");
    let from = "";
    if (path.includes("/tasks/")) from = "tasks";
    else if (path.includes("/projects/")) from = "projects";
    else if (path.includes("/deliveries/")) from = "deliveries";
    else if (path.includes("/manage-users/")) from = "manage-users";
    else if (path.includes("/manage-team/")) from = "manage-team";
    navigate(`${path}${from ? `?from=${from}` : ""}`, { state: { from } });
  };

  // Close search dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setShowSearchDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Fetch current user data from the API on mount
  useEffect(() => {

    const token = authToken();

    if (!token) return;

    fetch(`${API_URL}/user`, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      skipLoader: true,
    })
      .then((res) => res.json())

      .then((data) => {

        if (data && data.name) {

          setUserState({
            name: data.name,
            email: data.email,
            role: data.role,
            professional_email: data.professional_email,
            avatar: data.avatar || null,
          });

          const role = getCurrentRole();
          setUser(role, { id: data.id, name: data.name, email: data.email, role: data.role, professional_email: data.professional_email, avatar: data.avatar || null });
        }
      })

      .catch(() => {});
  }, []);

  /** Fetch unread notification count; triggers a browser notification on increase. */
  const fetchNotifications = useCallback(() => {
    const token = authToken();
    if (!token) return;
    fetch(`${API_URL}/notifications/unread-count?t=${Date.now()}`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      skipLoader: true,
    })
      .then((res) => (res.ok ? res.json() : { unread_count: 0 }))
      .then((data) => {
        const newCount = data.unread_count || 0;
        setUnreadCount((prev) => {
          if (newCount > prev && prev > 0) {
            showBrowserNotification('New PMS Notification', {
              body: `You have ${newCount} unread notification${newCount > 1 ? 's' : ''}`,
              url: window.location.href,
            });
          }
          return newCount;
        });
      })
      .catch(() => {});
  }, []);

  // Poll for unread notifications + subscribe to data-change events + window events
  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 15000);
    const unsub = subscribe('data:changed', fetchNotifications);
    const handleNotifRead = () => fetchNotifications();
    window.addEventListener('notification-read', handleNotifRead);

    const handleUserUpdate = () => {
      const stored = getUser();
      if (stored) {
        setUserState(prev => ({ ...prev, name: stored.name, email: stored.email, role: stored.role, avatar: stored.avatar || null }));
      }
    };
    window.addEventListener('user-updated', handleUserUpdate);

    return () => {
      clearInterval(interval);
      unsub();
      window.removeEventListener('notification-read', handleNotifRead);
      window.removeEventListener('user-updated', handleUserUpdate);
    };
  }, [fetchNotifications]);

  /** Toggle the notification panel and fetch the full list when opening. */
  const openNotifications = async () => {
    const token = authToken();
    if (!token) return;
    setShowNotifications((prev) => {
      if (!prev) {
        fetch(`${API_URL}/notifications`, {
          headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
          skipLoader: true,
        })
          .then((res) => (res.ok ? res.json() : { data: [] }))
          .then((data) => setNotifications(data?.data || data || []))
          .catch(() => setNotifications([]));
      }
      return !prev;
    });
  };

  /** Mark a single notification as read and update local state. */
  const markAsRead = async (id) => {
    const token = authToken();
    if (!token) return;
    await fetch(`${API_URL}/notifications/${id}/read`, {
      method: "POST",
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      skipLoader: true,
      _notifHandled: true,
    });
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, is_read: true } : n));
    setUnreadCount((prev) => Math.max(0, prev - 1));
    fetchNotifications();
    window.dispatchEvent(new Event("notification-read"));
  };

  /** Mark all notifications as read. */
  const markAllAsRead = async () => {
    const token = authToken();
    if (!token) return;
    await fetch(`${API_URL}/notifications/read-all`, {
      method: "POST",
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      skipLoader: true,
      _notifHandled: true,
    });
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnreadCount(0);
    window.dispatchEvent(new Event("notification-read"));
  };

  // Close notification panel when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setShowNotifications(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <>

      {/* ── Left: Menu toggle + Logo ── */}
      <div className="header-container">

        {/* LEFT */}
        <div className="header-left">

          <button
            className="header-menu-btn"
            onClick={() => window.dispatchEvent(new Event("toggle-sidebar"))}
            aria-label="Toggle sidebar"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M3 12H21" />
              <path d="M3 6H21" />
              <path d="M3 18H21" />
            </svg>
          </button>

          <div className="logo-box">
            <b>TX</b>
          </div>

          <div className={"logo-text" + (showFullLogo || isSmallScreen ? "" : " logo-text--hidden")}>
            <h3>Techxaro</h3>
            <span>PMS Portal</span>
          </div>

        </div>

        {/* ── Search bar with dropdown results ── */}
        <div className="header-search" ref={searchRef}>

          <i className="fa-solid fa-magnifying-glass search-icon"></i>

          <input
            type="text"
            className="form-control"
            placeholder="Search projects, tasks or employees..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => searchQuery.length >= 2 && setShowSearchDropdown(true)}
          />

          {showSearchDropdown && (
            <div className="search-dropdown">
              {searchResults.pages.length === 0 && searchResults.projects.length === 0 && searchResults.tasks.length === 0 && searchResults.users.length === 0 ? (
                <div className="search-dropdown-empty">No results found</div>
              ) : (
                <>
                  {searchResults.pages.length > 0 && (
                    <div className="search-dropdown-section">
                      <div className="search-dropdown-label">Pages</div>
                      {searchResults.pages.map((item) => (
                        <div key={item.path} className="search-dropdown-item" onClick={() => handleSearchSelect(item.path)}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/></svg>
                          <span>{item.name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {searchResults.projects.length > 0 && (
                    <div className="search-dropdown-section">
                      <div className="search-dropdown-label">Projects</div>
                      {searchResults.projects.map((item) => (
                        <div key={item.id} className="search-dropdown-item" onClick={() => handleSearchSelect(item.path)}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>
                          <span>{item.name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {searchResults.tasks.length > 0 && (
                    <div className="search-dropdown-section">
                      <div className="search-dropdown-label">Tasks</div>
                      {searchResults.tasks.map((item) => (
                        <div key={item.id} className="search-dropdown-item" onClick={() => handleSearchSelect(item.path)}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
                          <span>{item.name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {searchResults.users.length > 0 && (
                    <div className="search-dropdown-section">
                      <div className="search-dropdown-label">Users</div>
                      {searchResults.users.map((item) => (
                        <div key={item.id} className="search-dropdown-item" onClick={() => handleSearchSelect(item.path)}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                          <div>
                            <span>{item.name}</span>
                            <small style={{ color: "#9ca3af", marginLeft: 6, fontSize: 11 }}>{item.email}</small>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

        </div>

        {/* ── Right: Create buttons, notifications, user menu ── */}
        <div className="header-right">

          {/* Quick-create task button */}

          <button
            className="task-btn1"
            onClick={() =>
              setShowTaskModal(true)
            }
          >
            + Task
          </button>

          {/* Quick-create project button – visible to admin/manager only */}

          {["admin", "manager"].includes(getCurrentRole()) && (
          <button
            className="project-btn"
            onClick={() =>
              setShowProjectModal(true)
            }
          >
            + Project
          </button>
          )}

          {/* Notification bell with unread badge */}
          <div className="header-notif" ref={notifRef}>
            <button className="header-notif-link" onClick={openNotifications}>
              <div className="header-notif-icon-wrap">
                <MdNotifications fontSize={"22px"} color={unreadCount > 0 ? "#ef4444" : "#6b7280"} />
                {unreadCount > 0 && (
                  <span className="header-notif-badge">{unreadCount > 99 ? "99+" : unreadCount}</span>
                )}
              </div>
            </button>

            {showNotifications && (
              <div className="notif-panel">
                <div className="notif-panel-header">
                  <button className="notif-view-all-sm" onClick={() => { setShowNotifications(false); navigate(rolePath("notifications")); }}>
                    View All
                  </button>
                  <h4>Notifications</h4>
                  {unreadCount > 0 && (
                    <button className="notif-mark-all" onClick={markAllAsRead}>Mark all read</button>
                  )}
                </div>
                <div className="notif-panel-list">
                  {notifications.length === 0 ? (
                    <div className="notif-panel-empty">No notifications</div>
                  ) : (
                    notifications.slice(0, 7).map((n) => (
                      <div
                        key={n.id}
                        className={`notif-panel-item ${!n.is_read ? "notif-panel-item--unread" : "notif-panel-item--read"}`}
                        onClick={() => { markAsRead(n.id); setShowNotifications(false); navigate(getNotificationDestination(n)); }}
                      >
                        <div className={`notif-panel-dot ${!n.is_read ? "notif-panel-dot--unread" : ""}`} />
                        <div className="notif-panel-content">
                          <p className={`notif-panel-title ${!n.is_read ? "notif-panel-title--unread" : ""}`}>{n.title || n.type}</p>
                          <p className="notif-panel-msg">{n.message}</p>
                          <span className="notif-panel-time">{formatDateTimeInline(n.created_at)}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          <hr />

          {/* User info + profile dropdown */}

          <div
            className="user-info"
            onClick={toggleProfileModal}
          >

            <div className="user-avatar">
              {user.avatar ? (
                <img src={`${API_URL.replace('/api', '')}/storage/${user.avatar}`} alt={user.name} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
              ) : (
                user.name.charAt(0).toUpperCase()
              )}
            </div>

            <div className="user-text">

              <h6>{user.name}</h6>

              <span>{normalizeRole(user.role)}</span>

            </div>

            <div className="arrow-icon">
              <MdKeyboardArrowDown
                fontSize={"25px"}
              />
            </div>

            {isProfileOpen && (

              <div
                className="header-modal-card"
                onClick={(e) =>
                  e.stopPropagation()
                }
              >
                {/* Profile header: gradient with photo + name + role */}
                <div className="hmc-header">
                  <div className="hmc-avatar">
                    {user.avatar ? (
                      <img src={`${API_URL.replace('/api', '')}/storage/${user.avatar}`} alt={user.name} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                    ) : (
                      user.name.charAt(0).toUpperCase()
                    )}
                  </div>
                  <div className="hmc-user-text">
                    <h4 className="hmc-name">{user.name}</h4>
                    <span className="hmc-email">{user.professional_email || ""}</span>
                    <span className="hmc-role-text">{normalizeRole(user.role)}</span>
                  </div>
                </div>

                {/* Divider */}
                <div className="hmc-divider" />

                {/* Menu items */}
                <button className="hmc-menu-item" onClick={() => { setIsProfileOpen(false); navigate(rolePath("my-profile")); }}>
                  <MdPerson size={20} />
                  <span>My Profile</span>
                </button>
                <button className="hmc-menu-item" onClick={() => { setIsProfileOpen(false); setShowProfileModal(true); }}>
                  <MdLock size={20} />
                  <span>Change Password</span>
                </button>
                <button className="hmc-menu-item" onClick={() => { setIsProfileOpen(false); navigate(rolePath("history")); }}>
                  <MdHistory size={20} />
                  <span>My Activity</span>
                </button>
                <div className="hmc-logout-wrap">
                  <button className="hmc-logout-btn" onClick={async () => {
                    const role = getCurrentRole();
                    const token = getToken(role);
                    if (token) {
                      try {
                        await fetch(`${API_URL}/logout`, {
                          method: "POST",
                          headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
                          skipLoader: true,
                          _notifHandled: true,
                        });
                      } catch { /* ignore */ }
                    }
                    clearSession(role);
                    window.location.href = "/logged-out";
                  }}>
                    <MdLogout size={18} />
                    <span>Logout</span>
                  </button>
                </div>

              </div>
            )}

          </div>

        </div>

      </div>

      {/* ── Modals ── */}

      {/* Task creation modal */}

      {showTaskModal && (

        <CreateTaskModal
          onClose={() =>
            setShowTaskModal(false)
          }
        />
      )}

      {/* Project creation modal – admin/manager only */}

      {showProjectModal && (
        <div className="modal-overlay">
          <CreateProjectModal
            onClose={(created) => {
              setShowProjectModal(false);
            }}
          />
        </div>
      )}

      {showProfileModal && (
        <ChangePasswordModal onClose={() => setShowProfileModal(false)} />
      )}

    </>
  );
}

export default Header;