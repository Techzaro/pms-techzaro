import { useEffect, useState, useRef, useCallback } from "react";
import { MdKeyboardArrowDown, MdNotifications } from "react-icons/md";
import { Link, useNavigate } from "react-router-dom";

import API_URL from "../../config/api";
import { authToken, getCurrentRole, getUser, setUser, rolePath } from "../../utils/auth";
import { subscribe } from "../../utils/eventBus";
import { requestNotificationPermission, showBrowserNotification } from "../../utils/browserNotification";
import { initFirebase } from "../../utils/firebase";
import "./Header.css";

import CreateTaskModal from "../CreateTaskModal";
import CreateProjectModal from "../CreateProjectModal";

function Header() {
  const navigate = useNavigate();
  const searchRef = useRef(null);
  const notifRef = useRef(null);

  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isSmallScreen, setIsSmallScreen] = useState(window.innerWidth <= 1200);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const prevCountRef = useRef(0);
  const [showNotifications, setShowNotifications] = useState(false);

  useEffect(() => {
    requestNotificationPermission();
    initFirebase();
  }, []);

  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [searchResults, setSearchResults] = useState({ pages: [], projects: [], tasks: [], users: [] });
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);

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

  useEffect(() => {
    const handler = (e) => setSidebarOpen(e.detail.open);
    window.addEventListener("sidebar-state", handler);
    return () => window.removeEventListener("sidebar-state", handler);
  }, []);

  useEffect(() => {
    const onResize = () => setIsSmallScreen(window.innerWidth <= 1200);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("modal-state", { detail: { open: isProfileOpen } }));
  }, [isProfileOpen]);

  const showFullLogo = sidebarOpen || !isSmallScreen;

  const [user, setUserState] = useState(() => {
    const stored = getUser();
    return {
      name: stored?.name || "User",
      email: stored?.email || "user@example.com",
      role: stored?.role || "Member",
    };
  });

  const toggleProfileModal = () =>
    setIsProfileOpen((prev) => !prev);

  useEffect(() => {
    if (searchQuery.trim().length < 2) {
      setDebouncedQuery("");
      return;
    }
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    if (debouncedQuery.trim().length < 2) {
      setSearchResults({ pages: [], projects: [], tasks: [], users: [] });
      setShowSearchDropdown(false);
      return;
    }
    handleSearch(debouncedQuery);
  }, [debouncedQuery]);

  const handleSearch = async (query) => {

    const q = query.toLowerCase();

    const matchedPages = getPageLinks().filter(
      (p) => p.name.toLowerCase().includes(q) || p.keywords.includes(q)
    );

    let matchedProjects = [];
    let matchedTasks = [];
    let matchedUsers = [];

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

  const handleSearchSelect = (path) => {
    setShowSearchDropdown(false);
    setSearchQuery("");
    navigate(path);
  };

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setShowSearchDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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
          });

          const role = getCurrentRole();
          setUser(role, { name: data.name, email: data.email, role: data.role });
        }
      })

      .catch(() => {});
  }, []);

  const fetchNotifications = useCallback(() => {
    const token = authToken();
    if (!token) return;
    fetch(`${API_URL}/notifications/unread-count`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      skipLoader: true,
    })
      .then((res) => (res.ok ? res.json() : { count: 0 }))
      .then((data) => {
        const newCount = data.count || 0;
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

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 10000);
    const unsub = subscribe('data:changed', fetchNotifications);
    return () => { clearInterval(interval); unsub(); };
  }, [fetchNotifications]);

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

  const markAsRead = async (id) => {
    const token = authToken();
    if (!token) return;
    await fetch(`${API_URL}/notifications/${id}/read`, {
      method: "POST",
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      skipLoader: true,
    });
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, is_read: true } : n));
    setUnreadCount((prev) => Math.max(0, prev - 1));
  };

  const markAllAsRead = async () => {
    const token = authToken();
    if (!token) return;
    await fetch(`${API_URL}/notifications/read-all`, {
      method: "POST",
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      skipLoader: true,
    });
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnreadCount(0);
  };

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

        {/* SEARCH */}

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

        {/* RIGHT */}

        <div className="header-right">

          {/* TASK BUTTON */}

          <button
            className="task-btn"
            onClick={() =>
              setShowTaskModal(true)
            }
          >
            + Task
          </button>

          {/* PROJECT BUTTON */}

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

          {/* NOTIFICATIONS */}
          <div className="header-notif">
            <Link to={rolePath("notifications")} className="header-notif-link">
              <div className="header-notif-icon-wrap">
                <MdNotifications fontSize={"22px"} color="#6b7280" />
                {unreadCount > 0 && (
                  <span className="header-notif-badge">{unreadCount > 99 ? "99+" : unreadCount}</span>
                )}
              </div>
            </Link>
          </div>

          <hr />

          {/* USER */}

          <div
            className="user-info"
            onClick={toggleProfileModal}
          >

            <div className="user-avatar">
              {user.name
                .charAt(0)
                .toUpperCase()}
            </div>

            <div className="user-text">

              <h6>{user.name}</h6>

              <span>{user.role}</span>

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

                <div className="header-modal-top">

                  <h3>Your Profile</h3>

                  <p className="modal-subtitle">
                    Latest account details
                  </p>

                </div>

                <div className="header-modal-item">
                  <span>Name</span>

                  <strong>
                    {user.name}
                  </strong>
                </div>

                <div className="header-modal-item">
                  <span>Email</span>

                  <strong>
                    {user.email}
                  </strong>
                </div>

                <div className="header-modal-item">
                  <span>Role</span>

                  <strong>
                    {user.role}
                  </strong>
                </div>

              </div>
            )}

          </div>

        </div>

      </div>

      {/* TASK MODAL */}

      {showTaskModal && (

        <CreateTaskModal
          onClose={() =>
            setShowTaskModal(false)
          }
        />
      )}

      {/* PROJECT MODAL */}

      {showProjectModal && (
        <div className="modal-overlay" onClick={() => setShowProjectModal(false)}>
          <CreateProjectModal
            onClose={(created) => {
              setShowProjectModal(false);
            }}
          />
        </div>
      )}

    </>
  );
}

export default Header;