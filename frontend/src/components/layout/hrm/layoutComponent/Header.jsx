/**
 * Header - Application header bar for the HRM dashboard.
 * Contains: logo, global search (pages/employees/candidates/notices/
 * trainings), quick-create buttons (+ Employee, + Job Opening, + Notice),
 * notification bell with unread badge, and a user profile dropdown.
 * Handles responsive behaviour (logo visibility, sidebar toggle) and
 * real-time notification polling.
 *
 * Adapted from the PMS Header: the shell (logo, theme toggle, notif
 * panel, profile dropdown, keyboard nav) is unchanged so the two apps
 * still feel like the same product family — only the search entities
 * and quick-create actions were swapped to match the HR_SECTIONS defined
 * in Sidebar.jsx (Hiring / Workforce / Payroll / Engagement / Insights).
 *
 * Also renders a hover dropdown on the logo/text ("app switcher") that
 * mirrors the one added to the PMS Header, letting the user jump back
 * from the HRM portal to the PMS portal at /.
 */

import React, { useEffect, useState, useRef, useCallback, useMemo } from "react";
import {
  ChevronDown,
  Bell,
  User,
  Clock,
  LogOut,
  Lock,
  Moon,
  Sun,
  Briefcase,
  Grid,
} from "lucide-react";
import { useNavigate, Link } from "react-router-dom";

import API_URL from "../../../../config/api.js";
import { authToken, getCurrentRole, getUser, setUser, clearSession, getToken, rolePath, normalizeRole } from "../../../../utils/auth";
import { subscribe } from "../../../../utils/eventBus.js";
import { requestNotificationPermissionAsync, showDesktopNotification, getNotificationPermission } from "../../../../utils/browserNotification.js";
import { initFirebase } from "../../../../utils/firebase";
import { formatDateTimeInline } from "../../../../utils/formatDateTime";
import { getNotificationDestination } from "../../../../utils/navigation";
import { useTheme } from "../../../../context/ThemeContext.jsx";
import { useOrgBranding } from "../../../../hooks/useOrgBranding";
import "./Header.css";

// import CreateEmployeeModal from "../../../CreateEmployeeModal";
// import CreateJobOpeningModal from "../../../CreateJobOpeningModal";
// import CreateNoticeModal from "../../CreateNoticeModal.jsx";

/**
 * Header component – renders the top navigation bar.
 */
function Header() {
  const navigate = useNavigate();
  const searchRef = useRef(null);
  const notifRef = useRef(null);
  const profileRef = useRef(null);
  const searchDropdownRef = useRef(null);
  const notifListRef = useRef(null);
  const profileMenuRef = useRef(null);
  const logoSwitcherRef = useRef(null);
  const { theme, toggleTheme } = useTheme();
  const { data: branding } = useOrgBranding();

  // ── State ──
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [failedAvatarPath, setFailedAvatarPath] = useState(null);
  const [showEmployeeModal, setShowEmployeeModal] = useState(false);
  const [showJobOpeningModal, setShowJobOpeningModal] = useState(false);
  const [showNoticeModal, setShowNoticeModal] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isSmallScreen, setIsSmallScreen] = useState(window.innerWidth <= 1200);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const initialPollDoneRef = useRef(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifPermission, setNotifPermission] = useState(() => getNotificationPermission());
  /** Click / hover-triggered "switch portal" dropdown anchored on the logo/text. */
  const [showAppSwitcher, setShowAppSwitcher] = useState(false);
  const appSwitcherCloseTimer = useRef(null);
  /** True when the current primary input is a touch/pen (mobile/tablet). */
  const isTouchDevice = useRef(typeof window !== 'undefined' && window.matchMedia('(hover: none)').matches);

  // Initialise Firebase on mount
  useEffect(() => {
    initFirebase();
  }, []);

  // ── Search state & debounce ──
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [searchResults, setSearchResults] = useState({ pages: [], employees: [], candidates: [], notices: [], trainings: [] });
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [searchHighlightIndex, setSearchHighlightIndex] = useState(-1);
  const [notifHighlightIndex, setNotifHighlightIndex] = useState(-1);
  const [profileHighlightIndex, setProfileHighlightIndex] = useState(-1);

  /**
   * Returns the list of navigable pages with keywords for local search.
   * Mirrors the Dashboard link + HR_SECTIONS items in Sidebar.jsx exactly,
   * so anything a user can click in the sidebar is also reachable by typing.
   */
  const getPageLinks = () => [
    { name: "Dashboard", path: rolePath("dashboard"), keywords: "dashboard home overview" },
    { name: "Recruitment & Onboarding", path: rolePath("hrm/recruitment"), keywords: "hiring recruitment onboarding jobs candidates" },
    { name: "Offer Letters", path: rolePath("hrm/offer-letters"), keywords: "offer letters hiring" },
    { name: "Employee Documents", path: rolePath("hrm/documents"), keywords: "documents employee files workforce" },
    { name: "Attendance & Leave", path: rolePath("hrm/attendance"), keywords: "attendance leave time off workforce" },
    { name: "Performance & Evaluation", path: rolePath("hrm/performance"), keywords: "performance reviews evaluation workforce" },
    { name: "Assets / Items Issued", path: rolePath("hrm/assets"), keywords: "assets items issued equipment workforce" },
    { name: "Payroll & Salary", path: rolePath("hrm/payroll"), keywords: "payroll salary pay payslip" },
    { name: "Notice Board", path: rolePath("hrm/notice-board"), keywords: "notice board announcements engagement" },
    { name: "Training & Learning", path: rolePath("hrm/training"), keywords: "training learning courses engagement" },
    { name: "HR Reports & Analytics", path: rolePath("hrm/reports"), keywords: "reports analytics insights" },
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
      console.log('[HRM Notifications] Desktop notifications enabled!');
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
      setSearchResults({ pages: [], employees: [], candidates: [], notices: [], trainings: [] });
      setShowSearchDropdown(false);
      return;
    }
    handleSearch(debouncedQuery);
  }, [debouncedQuery]);

  /**
   * Performs a combined search across local page links and remote HR APIs
   * (employees, candidates, notices, trainings via the search endpoint).
   * Results are limited to 5 per category.
   *
   * Expected shape from GET /search?q=: { employees: [], candidates: [],
   * notices: [], trainings: [] } — same "one search endpoint" convention
   * the PMS Header used for projects/tasks/deliverables.
   */
  const handleSearch = async (query) => {

    const q = query.toLowerCase();

    // 1. Match navigable pages locally
    const matchedPages = getPageLinks().filter(
      (p) => p.name.toLowerCase().includes(q) || p.keywords.includes(q)
    );

    let matchedEmployees = [];
    let matchedCandidates = [];
    let matchedNotices = [];
    let matchedTrainings = [];

    // 2. Use the dedicated search endpoint for HR entities
    try {
      const token = authToken();
      const headers = { Accept: "application/json", Authorization: token ? `Bearer ${token}` : "" };

      const searchRes = await fetch(`${API_URL}/search?q=${encodeURIComponent(query)}`, { headers, skipLoader: true });

      if (searchRes.ok) {
        const data = await searchRes.json();
        matchedEmployees = (data.employees || [])
          .slice(0, 5)
          .map((e) => ({ id: e.id, name: e.name, code: e.employee_code, department: e.department, path: rolePath(`hrm/documents/${e.id}`) }));
        matchedCandidates = (data.candidates || [])
          .slice(0, 5)
          .map((c) => ({ id: c.id, name: c.name, code: c.position, path: rolePath(`hrm/recruitment/candidate-details/${c.id}`) }));
        matchedNotices = (data.notices || [])
          .slice(0, 5)
          .map((n) => ({ id: n.id, name: n.title, path: rolePath(`hrm/notice-board/${n.id}`) }));
        matchedTrainings = (data.trainings || [])
          .slice(0, 5)
          .map((t) => ({ id: t.id, name: t.title, code: t.status, path: rolePath(`hrm/training/${t.id}`) }));
      }
    } catch {
      // API not available, show only page results
    }

    setSearchResults({ pages: matchedPages, employees: matchedEmployees, candidates: matchedCandidates, notices: matchedNotices, trainings: matchedTrainings });
    setShowSearchDropdown(true);
  };

  /** Navigate to the selected result and reset the search bar. */
  const handleSearchSelect = (path) => {
    setShowSearchDropdown(false);
    setSearchQuery("");
    let from = "";
    if (path.includes("/hrm/recruitment/")) from = "recruitment";
    else if (path.includes("/hrm/documents/")) from = "documents";
    else if (path.includes("/hrm/notice-board/")) from = "notice-board";
    else if (path.includes("/hrm/training/")) from = "training";
    navigate(`${path}${from ? `?from=${from}` : ""}`, { state: { from } });
  };

  const flatSearchItems = useMemo(() => {
    const items = [];
    searchResults.pages.forEach(p => items.push({ type: 'page', ...p }));
    searchResults.employees.forEach(e => items.push({ type: 'employee', ...e }));
    searchResults.candidates.forEach(c => items.push({ type: 'candidate', ...c }));
    searchResults.notices.forEach(n => items.push({ type: 'notice', ...n }));
    searchResults.trainings.forEach(t => items.push({ type: 'training', ...t }));
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

  // Close the logo app-switcher dropdown when clicking/touching outside.
  useEffect(() => {
    const handleOutside = (e) => {
      if (logoSwitcherRef.current && !logoSwitcherRef.current.contains(e.target)) {
        setShowAppSwitcher(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('touchstart', handleOutside, { passive: true });
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
    };
  }, []);

  /** Opens the app-switcher dropdown immediately, cancelling any pending close. */
  const openAppSwitcher = () => {
    if (isTouchDevice.current || window.innerWidth <= 900) return;
    if (appSwitcherCloseTimer.current) {
      clearTimeout(appSwitcherCloseTimer.current);
      appSwitcherCloseTimer.current = null;
    }
    setShowAppSwitcher(true);
  };

  /** Closes the app-switcher dropdown after a short delay (desktop hover). */
  const closeAppSwitcherSoon = () => {
    if (isTouchDevice.current || window.innerWidth <= 900) return;
    appSwitcherCloseTimer.current = setTimeout(() => setShowAppSwitcher(false), 200);
  };

  /** Toggle open/close on click/tap — works reliably for both mouse and touch. */
  const toggleAppSwitcher = (e) => {
    if (e) {
      e.stopPropagation();
    }
    if (appSwitcherCloseTimer.current) {
      clearTimeout(appSwitcherCloseTimer.current);
      appSwitcherCloseTimer.current = null;
    }
    setShowAppSwitcher((prev) => !prev);
  };

  return (
    <>

      {/* ── Left: Menu toggle + Logo ── */}
      <div className="header-container" style={{ overflow: "visible" }}>

        {/* LEFT */}
        <div className="header-left" style={{ overflow: "visible" }}>

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

          {/* Logo + text – hovering (desktop) or tapping (mobile/tablet) opens
              a portal switcher that lets the user jump back to the PMS app. */}
          <div
            className="header-logo-switcher"
            ref={logoSwitcherRef}
            role="button"
            tabIndex={0}
            onMouseEnter={openAppSwitcher}
            onMouseLeave={closeAppSwitcherSoon}
            onClick={toggleAppSwitcher}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleAppSwitcher(e); } }}
          >
            <div className="logo-box">
              {branding?.logo_url ? (
                <img src={branding.logo_url} alt="Logo" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "12px" }} />
              ) : (
                <b>{(branding?.subtitle || "TX").substring(0, 2).toUpperCase()}</b>
              )}
            </div>

            <div className={"logo-text" + (showFullLogo || isSmallScreen ? "" : " logo-text--hidden")}>
              <h3>{branding?.subtitle || "Techxaro"}</h3>
              <span>{branding?.org_name ? `${branding.org_name} • HRM` : "HRM Portal"}</span>
            </div>

            <ChevronDown
              size={16}
              style={{
                marginLeft: 2,
                color: "var(--color-text-secondary, #6b7280)",
                transform: showAppSwitcher ? "rotate(180deg)" : "rotate(0deg)",
                transition: "transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                flexShrink: 0,
                display: "inline-block"
              }}
            />

            {showAppSwitcher && (
              <div
                className="header-app-switcher-dropdown"
                onMouseEnter={openAppSwitcher}
                onMouseLeave={closeAppSwitcherSoon}
                onClick={(e) => e.stopPropagation()}
              >

                <div className="app-switcher-header">
                  Switch Portal
                </div>

                <Link
                  to={rolePath("dashboard")}
                  onClick={(e) => { e.stopPropagation(); setShowAppSwitcher(false); }}
                  className="app-switcher-item"
                >
                  <Grid size={18} style={{ color: "var(--color-primary, #6366f1)", flexShrink: 0 }} />
                  <span>
                    Project Management
                    <br />
                    <span className="app-switcher-desc">
                      Projects, tasks, deliverables
                    </span>
                  </span>
                </Link>

                <div className="app-switcher-item app-switcher-item--active">
                  <Briefcase size={18} style={{ color: "var(--color-primary, #6366f1)", flexShrink: 0 }} />
                  <span>
                    HR Management
                    <br />
                    <span className="app-switcher-desc app-switcher-desc--active">
                      You're here
                    </span>
                  </span>
                </div>
              </div>
            )}
          </div>

        </div>

        {/* ── Search bar with dropdown results ── */}
        <div className="header-search" ref={searchRef}>

          <i className="fa-solid fa-magnifying-glass search-icon"></i>

          <input
            type="text"
            className="form-control"
            placeholder="Search employees, candidates, notices..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => searchQuery.length >= 2 && setShowSearchDropdown(true)}
            onKeyDown={handleSearchKeyDown}
          />

          {showSearchDropdown && (
            <div className="search-dropdown" ref={searchDropdownRef}>
              {searchResults.pages.length === 0 && searchResults.employees.length === 0 && searchResults.candidates.length === 0 && searchResults.notices.length === 0 && searchResults.trainings.length === 0 ? (
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
                  {searchResults.employees.length > 0 && (
                    <div className="search-dropdown-section">
                      <div className="search-dropdown-label">Employees</div>
                      {searchResults.employees.map((item) => (
                        <div key={item.id} className={`search-dropdown-item${isSearchItemHighlighted(item) ? ' search-dropdown-item--highlighted' : ''}`} onClick={() => handleSearchSelect(item.path)} onMouseEnter={() => setSearchItemHighlight(item)}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                          <div>
                            <span>{item.name}</span>
                            {item.code && <span style={{ fontSize: 11, color: "#10b981", fontWeight: 700, marginLeft: 6 }}>{item.code}</span>}
                            {item.department && <span style={{ fontSize: 10, fontWeight: 500, color: "var(--color-primary)", background: "var(--color-primary-bg)", padding: "1px 5px", borderRadius: 4, marginLeft: 6 }}>{item.department}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {searchResults.candidates.length > 0 && (
                    <div className="search-dropdown-section">
                      <div className="search-dropdown-label">Candidates</div>
                      {searchResults.candidates.map((item) => (
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
                  {searchResults.notices.length > 0 && (
                    <div className="search-dropdown-section">
                      <div className="search-dropdown-label">Notices</div>
                      {searchResults.notices.map((item) => (
                        <div key={item.id} className={`search-dropdown-item${isSearchItemHighlighted(item) ? ' search-dropdown-item--highlighted' : ''}`} onClick={() => handleSearchSelect(item.path)} onMouseEnter={() => setSearchItemHighlight(item)}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0ea5e9" strokeWidth="2" strokeLinecap="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
                          <span>{item.name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {searchResults.trainings.length > 0 && (
                    <div className="search-dropdown-section">
                      <div className="search-dropdown-label">Training</div>
                      {searchResults.trainings.map((item) => (
                        <div key={item.id} className={`search-dropdown-item${isSearchItemHighlighted(item) ? ' search-dropdown-item--highlighted' : ''}`} onClick={() => handleSearchSelect(item.path)} onMouseEnter={() => setSearchItemHighlight(item)}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2" strokeLinecap="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>
                          <div>
                            <span>{item.name}</span>
                            {item.code && <span style={{ fontSize: 11, color: "#8b5cf6", fontWeight: 700, marginLeft: 6 }}>{item.code}</span>}
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

          {/* Quick-create: post a job opening – recruiter/admin/manager only */}
          {["admin", "manager", "recruiter"].includes(getCurrentRole()) && (
          <button
            className="task-btn1"
            onClick={() => setShowJobOpeningModal(true)}
          >
            <Briefcase size={16} style={{ marginRight: 4, verticalAlign: -2 }} /> + Job Opening
          </button>
          )}

          {/* Quick-create: add employee – admin/manager (HR) only */}
          {["admin", "manager"].includes(getCurrentRole()) && (
          <button
            className="task-btn1"
            style={{ background: "#10b981" }}
            onClick={() => setShowEmployeeModal(true)}
          >
            + Employee
          </button>
          )}

          {/* Quick-create: post a notice – admin/manager only */}
          {["admin", "manager"].includes(getCurrentRole()) && (
          <button
            className="project-btn"
            onClick={() => setShowNoticeModal(true)}
          >
            <Bell size={16} style={{ marginRight: 4, verticalAlign: -2 }} /> + Notice
          </button>
          )}

          {/* Enable desktop notifications button - only shows when permission not granted */}
          {notifPermission !== 'granted' && 'Notification' in window && (
            <button
              className="header-notif-link desktop-notification-prompt"
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
                <Bell size={22} color={unreadCount > 0 ? "#ef4444" : "#6b7280"} />
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

          {/* Theme toggle button */}
          <button className="theme-toggle-btn" onClick={toggleTheme} title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}>
            {theme === "dark" ? <Sun size={20} /> : <Moon size={20} />}
          </button>

          <hr />

        </div>

        {/* User info is a direct header child so it always owns a visible
            column and cannot be pushed out by search or notification actions. */}

        <div
            className="user-info hrm-header-profile-trigger"
            ref={profileRef}
            onClick={toggleProfileModal}
            onKeyDown={handleProfileKeyDown}
            role="button"
            tabIndex={0}
            aria-label={`Open profile menu for ${user.name}`}
            aria-expanded={isProfileOpen}
          >

            <div className="user-avatar hrm-header-profile-avatar">
              {user.avatar && failedAvatarPath !== user.avatar ? (
                <img
                  src={`${API_URL.replace('/api', '')}/storage/${user.avatar}`}
                  alt={user.name}
                  onError={() => setFailedAvatarPath(user.avatar)}
                  style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }}
                />
              ) : (
                <User className="hrm-profile-fallback-icon" size={20} strokeWidth={2.4} aria-hidden="true" />
              )}
            </div>

            <div className="user-text">

              <h6>{user.name}</h6>

              <span>{normalizeRole(user.role)}</span>
              {user.department && <span style={{ fontSize: 11, fontWeight: 500, color: "var(--color-primary)", background: "var(--color-primary-bg)", padding: "1px 6px", borderRadius: 4, marginLeft: 6 }}>{user.department}</span>}

            </div>

            <div className="arrow-icon">
              <ChevronDown
                size={25}
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
                    {user.avatar && failedAvatarPath !== user.avatar ? (
                      <img
                        src={`${API_URL.replace('/api', '')}/storage/${user.avatar}`}
                        alt={user.name}
                        onError={() => setFailedAvatarPath(user.avatar)}
                        style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }}
                      />
                    ) : (
                      <User className="hrm-profile-fallback-icon" size={28} strokeWidth={2.4} aria-hidden="true" />
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
                  <User size={20} />
                  <span>My Profile</span>
                </button>
                <button className={`hmc-menu-item${profileHighlightIndex === 1 ? ' hmc-menu-item--highlighted' : ''}`} onClick={() => { setIsProfileOpen(false); navigate(`${rolePath("my-profile")}?openPassword=true`); }} onMouseEnter={() => setProfileHighlightIndex(1)}>
                  <Lock size={20} />
                  <span>Change Password</span>
                </button>
                <button className={`hmc-menu-item${profileHighlightIndex === 2 ? ' hmc-menu-item--highlighted' : ''}`} onClick={() => { setIsProfileOpen(false); navigate(rolePath("history")); }} onMouseEnter={() => setProfileHighlightIndex(2)}>
                  <Clock size={20} />
                  <span>My Activity</span>
                </button>
                <div className="hmc-logout-wrap">
                  <button className={`hmc-logout-btn${profileHighlightIndex === 3 ? ' hmc-menu-item--highlighted' : ''}`} onMouseEnter={() => setProfileHighlightIndex(3)} onClick={async () => {
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
                    <LogOut size={18} />
                    <span>Logout</span>
                  </button>
                </div>

              </div>
            )}

        </div>

      </div>

      {/* ── Modals ── */}

      {/* Job opening creation modal */}
      {showJobOpeningModal && (
        <CreateJobOpeningModal onClose={() => setShowJobOpeningModal(false)} />
      )}

      {/* Employee creation modal */}
      {showEmployeeModal && (
        <div className="modal-overlay">
          <CreateEmployeeModal onClose={() => setShowEmployeeModal(false)} />
        </div>
      )}

      {/* Notice creation modal */}
      {showNoticeModal && (
        <CreateNoticeModal onClose={() => setShowNoticeModal(false)} />
      )}

    </>
  );
}

export default Header;
