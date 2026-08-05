/**
 * Header - Application header bar for the PMS dashboard.
 * Contains: logo, global search (pages/projects/tasks/users), quick-create
 * buttons (+ Task, + Project), notification bell with unread badge, and a
 * user profile dropdown. Handles responsive behaviour (logo visibility,
 * sidebar toggle) and real-time notification polling.
 */

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { MdKeyboardArrowDown, MdNotifications, MdPerson, MdHistory, MdLogout, MdLock, MdDarkMode, MdLightMode } from "react-icons/md";
import { useNavigate } from "react-router-dom";

import API_URL from "../../config/api";
import { authToken, getCurrentRole, getUser, setUser, clearSession, logoutUser, getToken, rolePath, normalizeRole } from "../../utils/auth";
import { subscribe } from "../../utils/eventBus";
import { requestNotificationPermissionAsync, showDesktopNotification, getNotificationPermission } from "../../utils/browserNotification";
import { initFirebase } from "../../utils/firebase";
import { formatDateTimeInline } from "../../utils/formatDateTime";
import { getNotificationDestination } from "../../utils/navigation";
import { useTheme } from "../../context/ThemeContext.jsx";
import "./Header.css";

import CreateTaskModal from "../CreateTaskModal";
import CreateProjectModal from "../CreateProjectModal";
import CreateDeliverableModel from "./CreateDeliverableModel";

/**
 * Header component – renders the top navigation bar.
 */
function Header() {
  const navigate = useNavigate();
  const searchRef = useRef(null);
  const notifRef = useRef(null);
  const notifPanelRef = useRef(null);
  const profileRef = useRef(null);
  const searchDropdownRef = useRef(null);
  const notifListRef = useRef(null);
  const profileMenuRef = useRef(null);
  const { theme, toggleTheme } = useTheme();

  // ── State ──
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [showSubtaskModal, setShowSubtaskModal] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isSmallScreen, setIsSmallScreen] = useState(window.innerWidth <= 1200);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const initialPollDoneRef = useRef(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifPermission, setNotifPermission] = useState(() => getNotificationPermission());

  // Initialise Firebase on mount
  useEffect(() => {
    initFirebase();
  }, []);

  // ── Search state & debounce ──
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [searchResults, setSearchResults] = useState({ pages: [], projects: [], tasks: [], users: [] });
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [searchHighlightIndex, setSearchHighlightIndex] = useState(-1);
  const [notifHighlightIndex, setNotifHighlightIndex] = useState(-1);
  const [profileHighlightIndex, setProfileHighlightIndex] = useState(-1);

  /** Returns the list of navigable pages with keywords for local search. */
  const getPageLinks = () => [
    { name: "Dashboard", path: rolePath("dashboard"), keywords: "dashboard home" },
    { name: "Projects", path: rolePath("projects"), keywords: "projects list" },
    { name: "Tasks Assigned to You", path: rolePath("tasks"), keywords: "my tasks assigned" },
    { name: "Tasks Assigned by You", path: rolePath("taskby"), keywords: "tasks created by me" },
    { name: "Subtasks", path: rolePath("deliveries"), keywords: "deliveries subtasks" },
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

  /** Request notification permission on user click (required by browsers) */
  const handleEnableNotifications = async () => {
    const current = getNotificationPermission();

    if (current === 'denied') {
      // Browser ne permission deny kar di hai - manually settings mein jaake enable karna padega
      alert(
        'Desktop notifications are blocked by your browser.\n\n' +
        'To enable them:\n' +
        '1. Click the lock/icon in the address bar\n' +
        '2. Set Notifications to "Allow"\n' +
        '3. Refresh this page'
      );
      return;
    }

    const result = await requestNotificationPermissionAsync();
    setNotifPermission(result);
    if (result === 'granted') {
      console.log('[PMS Notifications] Desktop notifications enabled!');
    }
  };

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
   * (projects, tasks, users, deliverables via new search endpoint).
   * Results are limited to 5 per category.
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
    let matchedDeliverables = [];

    // 2. Use the dedicated search endpoint for entities
    try {
      const token = authToken();
      const headers = { Accept: "application/json", Authorization: token ? `Bearer ${token}` : "" };

      const [searchRes, userRes] = await Promise.allSettled([
        fetch(`${API_URL}/search?q=${encodeURIComponent(query)}`, { headers, skipLoader: true }),
        fetch(`${API_URL}/users`, { headers, skipLoader: true }),
      ]);

      if (searchRes.status === "fulfilled" && searchRes.value.ok) {
        const data = await searchRes.value.json();
        matchedProjects = (data.projects || [])
          .slice(0, 5)
          .map((p) => ({ id: p.id, name: p.title, code: p.business_id, path: rolePath(`projects/project-details/${p.id}`) }));
        matchedTasks = (data.tasks || [])
          .slice(0, 5)
          .map((t) => ({ id: t.id, name: t.title, code: t.business_id, path: rolePath(`tasks/task-details/${t.id}`) }));
        matchedDeliverables = (data.deliverables || [])
          .slice(0, 5)
          .map((d) => ({ id: d.id, name: d.title, code: d.business_id, path: rolePath(`deliveries/deliverable-details/${d.id}`) }));
      }

      if (userRes.status === "fulfilled" && userRes.value.ok) {
        const userData = await userRes.value.json();
        const userList = userData.users ?? userData ?? [];
        matchedUsers = userList
          .filter((u) => u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q))
          .slice(0, 5)
          .map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, department: u.department, path: rolePath(`manage-users/user-profile/${u.id}`) }));
      }
    } catch {
      // API not available, show only page results
    }

    setSearchResults({ pages: matchedPages, projects: matchedProjects, tasks: matchedTasks, deliverables: matchedDeliverables, users: matchedUsers });
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

  const flatSearchItems = useMemo(() => {
    const items = [];
    searchResults.pages.forEach(p => items.push({ type: 'page', ...p }));
    searchResults.projects.forEach(p => items.push({ type: 'project', ...p }));
    searchResults.tasks.forEach(t => items.push({ type: 'task', ...t }));
    (searchResults.deliverables || []).forEach(d => items.push({ type: 'deliverable', ...d }));
    searchResults.users.forEach(u => items.push({ type: 'user', ...u }));
    return items;
  }, [searchResults]);

  const isSearchItemHighlighted = (item) => searchHighlightIndex >= 0 && flatSearchItems[searchHighlightIndex]?.path === item.path;
  const setSearchItemHighlight = (item) => setSearchHighlightIndex(flatSearchItems.findIndex(si => si.path === item.path));

  useEffect(() => {
    setSearchHighlightIndex(-1);
  }, [searchQuery]);

  useEffect(() => {
    if (searchHighlightIndex >= 0 && searchDropdownRef.current) {
      const items = searchDropdownRef.current.querySelectorAll('.search-dropdown-item');
      items[searchHighlightIndex]?.scrollIntoView({ block: 'nearest' });
    }
  }, [searchHighlightIndex]);

  useEffect(() => {
    setNotifHighlightIndex(-1);
  }, [showNotifications]);

  useEffect(() => {
    if (notifHighlightIndex >= 0 && notifListRef.current) {
      const items = notifListRef.current.querySelectorAll('.notif-panel-item');
      items[notifHighlightIndex]?.scrollIntoView({ block: 'nearest' });
    }
  }, [notifHighlightIndex]);

  useEffect(() => {
    setProfileHighlightIndex(-1);
  }, [isProfileOpen]);

  useEffect(() => {
    if (profileHighlightIndex >= 0 && profileMenuRef.current) {
      const items = profileMenuRef.current.querySelectorAll('.hmc-menu-item, .hmc-logout-btn');
      items[profileHighlightIndex]?.scrollIntoView({ block: 'nearest' });
    }
  }, [profileHighlightIndex]);

  const handleSearchKeyDown = (e) => {
    const items = flatSearchItems;
    if (e.key === 'ArrowDown') {
      if (items.length === 0) return;
      e.preventDefault();
      setSearchHighlightIndex(prev => (prev + 1) % items.length);
    } else if (e.key === 'ArrowUp') {
      if (items.length === 0) return;
      e.preventDefault();
      setSearchHighlightIndex(prev => (prev - 1 + items.length) % items.length);
    } else if (e.key === 'Enter') {
      if (searchHighlightIndex >= 0 && items[searchHighlightIndex]) {
        e.preventDefault();
        handleSearchSelect(items[searchHighlightIndex].path);
      }
    } else if (e.key === 'Escape') {
      setShowSearchDropdown(false);
      setSearchHighlightIndex(-1);
    }
  };

  const handleNotifKeyDown = (e) => {
    const items = notifications.slice(0, 7);
    if (items.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setNotifHighlightIndex(prev => (prev + 1) % items.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setNotifHighlightIndex(prev => (prev - 1 + items.length) % items.length);
    } else if (e.key === 'Enter' && notifHighlightIndex >= 0 && items[notifHighlightIndex]) {
      e.preventDefault();
      const n = items[notifHighlightIndex];
      markAsRead(n.id);
      setShowNotifications(false);
      navigate(getNotificationDestination(n));
    } else if (e.key === 'Escape') {
      setShowNotifications(false);
      setNotifHighlightIndex(-1);
    }
  };

  const handleProfileKeyDown = (e) => {
    const count = 4;
    if (e.key === 'ArrowDown') {
      if (!isProfileOpen) { setIsProfileOpen(true); return; }
      e.preventDefault();
      setProfileHighlightIndex(prev => (prev + 1) % count);
    } else if (e.key === 'ArrowUp') {
      if (!isProfileOpen) return;
      e.preventDefault();
      setProfileHighlightIndex(prev => (prev - 1 + count) % count);
    } else if (e.key === 'Enter' && isProfileOpen && profileHighlightIndex >= 0) {
      e.preventDefault();
      if (profileMenuRef.current) {
        const btns = profileMenuRef.current.querySelectorAll('.hmc-menu-item, .hmc-logout-btn');
        btns[profileHighlightIndex]?.click();
      }
    } else if (e.key === 'Escape') {
      setIsProfileOpen(false);
      setProfileHighlightIndex(-1);
    }
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

  /** Fetch unread notification count; triggers desktop notifications on increase. */
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
          const perm = getNotificationPermission();
          if (newCount > prev && perm === 'granted' && initialPollDoneRef.current && document.hidden) {
            fetch(`${API_URL}/notifications/latest?t=${Date.now()}`, {
              headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
              skipLoader: true,
            })
              .then((res) => (res.ok ? res.json() : { notifications: [] }))
              .then((notifData) => {
                const latestNotifs = notifData.notifications || [];
                latestNotifs.forEach((n) => {
                  showDesktopNotification(n);
                });
              })
              .catch(() => {});
          }
          initialPollDoneRef.current = true;
          return newCount;
        });
      })
      .catch(() => {});
  }, []);

  // Subscribe to data-change events + window events (NO local poll — DashboardLayout handles global poll)
  useEffect(() => {
    fetchNotifications();
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

  // Close notification panel when clicking outside (checking both bell icon & notification panel)
  useEffect(() => {
    const handleClickOutside = (e) => {
      const isOutsideBell = !notifRef.current || !notifRef.current.contains(e.target);
      const isOutsidePanel = !notifPanelRef.current || !notifPanelRef.current.contains(e.target);
      if (isOutsideBell && isOutsidePanel) {
        setShowNotifications(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Close profile dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setIsProfileOpen(false);
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
            placeholder="Search projects, tasks or team members..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => searchQuery.length >= 2 && setShowSearchDropdown(true)}
            onKeyDown={handleSearchKeyDown}
          />

          {showSearchDropdown && (
            <div className="search-dropdown" ref={searchDropdownRef}>
              {searchResults.pages.length === 0 && searchResults.projects.length === 0 && searchResults.tasks.length === 0 && searchResults.deliverables.length === 0 && searchResults.users.length === 0 ? (
                <div className="search-dropdown-empty">No results found</div>
              ) : (
                <>
                  {searchResults.pages.length > 0 && (
                    <div className="search-dropdown-section">
                      <div className="search-dropdown-label">Pages</div>
                      {searchResults.pages.map((item) => (
                        <div key={item.path} className={`search-dropdown-item${isSearchItemHighlighted(item) ? ' search-dropdown-item--highlighted' : ''}`} onClick={() => handleSearchSelect(item.path)} onMouseEnter={() => setSearchItemHighlight(item)}>
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
                        <div key={item.id} className={`search-dropdown-item${isSearchItemHighlighted(item) ? ' search-dropdown-item--highlighted' : ''}`} onClick={() => handleSearchSelect(item.path)} onMouseEnter={() => setSearchItemHighlight(item)}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>
                          <div>
                            <span>{item.name}</span>
                            {item.code && <span style={{ fontSize: 11, color: "#10b981", fontWeight: 700, marginLeft: 6 }}>{item.code}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {searchResults.tasks.length > 0 && (
                    <div className="search-dropdown-section">
                      <div className="search-dropdown-label">Tasks</div>
                      {searchResults.tasks.map((item) => (
                        <div key={item.id} className={`search-dropdown-item${isSearchItemHighlighted(item) ? ' search-dropdown-item--highlighted' : ''}`} onClick={() => handleSearchSelect(item.path)} onMouseEnter={() => setSearchItemHighlight(item)}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
                          <div>
                            <span>{item.name}</span>
                            {item.code && <span style={{ fontSize: 11, color: "#f59e0b", fontWeight: 700, marginLeft: 6 }}>{item.code}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {searchResults.deliverables.length > 0 && (
                    <div className="search-dropdown-section">
                      <div className="search-dropdown-label">Subtasks</div>
                      {searchResults.deliverables.map((item) => (
                        <div key={item.id} className={`search-dropdown-item${isSearchItemHighlighted(item) ? ' search-dropdown-item--highlighted' : ''}`} onClick={() => handleSearchSelect(item.path)} onMouseEnter={() => setSearchItemHighlight(item)}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2" strokeLinecap="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
                          <div>
                            <span>{item.name}</span>
                            {item.code && <span style={{ fontSize: 11, color: "#8b5cf6", fontWeight: 700, marginLeft: 6 }}>{item.code}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {searchResults.users.length > 0 && (
                    <div className="search-dropdown-section">
                      <div className="search-dropdown-label">Users</div>
                      {searchResults.users.map((item) => (
                        <div key={item.id} className={`search-dropdown-item${isSearchItemHighlighted(item) ? ' search-dropdown-item--highlighted' : ''}`} onClick={() => handleSearchSelect(item.path)} onMouseEnter={() => setSearchItemHighlight(item)}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                          <div>
                            <span>{item.name}</span>
                            {item.role && <span style={{ fontSize: 11, color: "#94a3b8", marginLeft: 6 }}>({item.role.replace("_", " ")})</span>}
                            {item.department && <span style={{ fontSize: 10, fontWeight: 500, color: "var(--color-primary)", background: "var(--color-primary-bg)", padding: "1px 5px", borderRadius: 4, marginLeft: 4 }}>{item.department}</span>}
                            <br />
                            <small style={{ color: "#9ca3af", fontSize: 11 }}>{item.email}</small>
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
        <div className="header-right" style={{ position: "relative" }}>

          {/* Quick-create task button – not for guests */}

          {getCurrentRole() !== "guest" && (
          <button
            className="task-btn1"
            title="Create Task"
            onClick={() =>
              setShowTaskModal(true)
            }
          >
            <span className="quick-btn-full">+ Task</span>
            <span className="quick-btn-short">+T</span>
          </button>
          )}

          {getCurrentRole() !== "guest" && (
          <button
            className="task-btn1"
            style={{ background: "#7c3aed" }}
            title="Create Subtask"
            onClick={() =>
              setShowSubtaskModal(true)
            }
          >
            <span className="quick-btn-full">+ Subtask</span>
            <span className="quick-btn-short">+S</span>
          </button>
          )}

          {/* Quick-create project button – visible to admin/manager only */}

          {["admin", "manager"].includes(getCurrentRole()) && (
          <button
            className="project-btn"
            title="Create Project"
            onClick={() =>
              setShowProjectModal(true)
            }
          >
            <span className="quick-btn-full">+ Project</span>
            <span className="quick-btn-short">+P</span>
          </button>
          )}

          {/* Enable desktop notifications button - only shows when permission not granted */}
          {notifPermission !== 'granted' && 'Notification' in window && (
            <button
              className="header-notif-link"
              onClick={handleEnableNotifications}
              title={notifPermission === 'denied' ? 'Notifications blocked - click for instructions' : 'Enable desktop notifications'}
              style={{ cursor: 'pointer', padding: '6px 10px', borderRadius: 8, border: notifPermission === 'denied' ? '1px solid #f87171' : '1px solid #fbbf24', background: notifPermission === 'denied' ? '#fee2e2' : '#fef3c7', color: notifPermission === 'denied' ? '#991b1b' : '#92400e', fontSize: 12, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4 }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={notifPermission === 'denied' ? '#991b1b' : '#92400e'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {notifPermission === 'denied' ? (
                  <>
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </>
                ) : (
                  <>
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                  </>
                )}
              </svg>
              {notifPermission === 'denied' ? 'Notifications Blocked' : 'Enable Notifications'}
            </button>
          )}

          {/* Notification bell with unread badge */}
          <div className="header-notif" ref={notifRef}>
            <button className="header-notif-link" onClick={openNotifications} onKeyDown={handleNotifKeyDown}>
              <div className="header-notif-icon-wrap">
                <MdNotifications fontSize={"22px"} color={unreadCount > 0 ? "#ef4444" : "#6b7280"} />
                {unreadCount > 0 && (
                  <span className="header-notif-badge">{unreadCount > 99 ? "99+" : unreadCount}</span>
                )}
              </div>
            </button>
          </div>

          {/* Theme toggle button */}
          <button className="theme-toggle-btn" onClick={toggleTheme} title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}>
            {theme === "dark" ? <MdLightMode fontSize="20px" /> : <MdDarkMode fontSize="20px" />}
          </button>

          <hr />

          {/* User info + profile dropdown */}

          <div
            className="user-info"
            ref={profileRef}
            onClick={toggleProfileModal}
            onKeyDown={handleProfileKeyDown}
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
              {user.department && <span style={{ fontSize: 11, fontWeight: 500, color: "var(--color-primary)", background: "var(--color-primary-bg)", padding: "1px 6px", borderRadius: 4, marginLeft: 6 }}>{user.department}</span>}

            </div>

            <div className="arrow-icon">
              <MdKeyboardArrowDown
                fontSize={"25px"}
              />
            </div>

            {isProfileOpen && (

              <div
                className="header-modal-card"
                ref={profileMenuRef}
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
                    {user.department && <span style={{ fontSize: 11, fontWeight: 500, color: "var(--color-primary)", background: "var(--color-primary-bg)", padding: "1px 6px", borderRadius: 4, marginLeft: 6 }}>{user.department}</span>}
                  </div>
                </div>

                {/* Divider */}
                <div className="hmc-divider" />

                {/* Menu items */}
                <button className={`hmc-menu-item${profileHighlightIndex === 0 ? ' hmc-menu-item--highlighted' : ''}`} onClick={() => { setIsProfileOpen(false); navigate(rolePath("my-profile")); }} onMouseEnter={() => setProfileHighlightIndex(0)}>
                  <MdPerson size={20} />
                  <span>My Profile</span>
                </button>
                <button className={`hmc-menu-item${profileHighlightIndex === 1 ? ' hmc-menu-item--highlighted' : ''}`} onClick={() => { setIsProfileOpen(false); navigate(`${rolePath("my-profile")}?openPassword=true`); }} onMouseEnter={() => setProfileHighlightIndex(1)}>
                  <MdLock size={20} />
                  <span>Change Password</span>
                </button>
                <button className={`hmc-menu-item${profileHighlightIndex === 2 ? ' hmc-menu-item--highlighted' : ''}`} onClick={() => { setIsProfileOpen(false); navigate(rolePath("history")); }} onMouseEnter={() => setProfileHighlightIndex(2)}>
                  <MdHistory size={20} />
                  <span>My Activity</span>
                </button>
                <div className="hmc-logout-wrap">
                  <button className={`hmc-logout-btn${profileHighlightIndex === 3 ? ' hmc-menu-item--highlighted' : ''}`} onMouseEnter={() => setProfileHighlightIndex(3)} onClick={() => logoutUser()}>
                    <MdLogout size={18} />
                    <span>Logout</span>
                  </button>
                </div>

              </div>
            )}

          </div>

          {/* Floating Notification Panel aligned to far right of header-right */}
          {showNotifications && (
            <div className="notif-panel" ref={notifPanelRef}>
              <div className="notif-panel-header">
                <button className="notif-view-all-sm" onClick={() => { setShowNotifications(false); navigate(rolePath("notifications")); }}>
                  View All
                </button>
                <h4>Notifications</h4>
                {unreadCount > 0 && (
                  <button className="notif-mark-all" onClick={markAllAsRead}>Mark all read</button>
                )}
              </div>
              <div className="notif-panel-list" ref={notifListRef}>
                {notifications.length === 0 ? (
                  <div className="notif-panel-empty">No notifications</div>
                ) : (
                  notifications.slice(0, 7).map((n, idx) => (
                    <div
                      key={n.id}
                      className={`notif-panel-item ${!n.is_read ? "notif-panel-item--unread" : "notif-panel-item--read"}${notifHighlightIndex === idx ? ' notif-panel-item--highlighted' : ''}`}
                      onClick={() => { markAsRead(n.id); setShowNotifications(false); navigate(getNotificationDestination(n)); }}
                      onMouseEnter={() => setNotifHighlightIndex(idx)}
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

      {showSubtaskModal && (
        <CreateDeliverableModel
          onClose={() => setShowSubtaskModal(false)}
        />
      )}

    </>
  );
}

export default Header;