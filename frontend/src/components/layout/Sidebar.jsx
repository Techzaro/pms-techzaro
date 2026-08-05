/**
 * Sidebar - Main navigation sidebar for the PMS dashboard.
 * Renders role-based navigation links (dashboard, projects, tasks,
 * subtasks, calendar, reports, users, team) with collapsible
 * dropdowns. Supports three viewport modes:
 *   - Desktop (>1200px): always visible, icon+text
 *   - Tablet (769-1200px): collapsible on hover/click
 *   - Mobile (≤768px): overlay drawer toggled via hamburger menu
 * Persists dropdown open/closed state in sessionStorage and
 * auto-expands relevant sections based on the current route.
 */

import { Link, useLocation, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import API_URL from "../../config/api";
import { authToken, getCurrentRole, getUser, setUser, rolePath, getUrlRole, getTenantSlug } from "../../utils/auth";
import { useOrgBranding } from "../../hooks/useOrgBranding";

import {
  MdDashboard,
  MdTask,
  MdAssignment,
  MdOutlineDescription,
  MdPerson,
  MdPeople,
  MdCalendarToday,
  MdBarChart,
  MdKeyboardArrowDown,
  MdHistory,
  MdSettings,
  MdEditNote,
  MdOpenInNew,
} from "react-icons/md";

import "./Sidebar.css";

/**
 * Sidebar navigation component.
 */
function Sidebar() {
  const { data: branding } = useOrgBranding();

  // ── Viewport mode state ──
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const [isTabletExpanded, setIsTabletExpanded] = useState(false);

  // ── Collapsible dropdown state (persisted in sessionStorage) ──
  const [tasksOpen, setTasksOpen] = useState(() => sessionStorage.getItem("tasksOpen") === "true");
  const toggleTasks = () => {
    setTasksOpen((prev) => {
      const next = !prev;
      sessionStorage.setItem("tasksOpen", next);
      return next;
    });
  };

  const [subtasksOpen, setSubtasksOpen] = useState(() => sessionStorage.getItem("subtasksOpen") === "true");
  const toggleSubtasks = () => {
    setSubtasksOpen((prev) => {
      const next = !prev;
      sessionStorage.setItem("subtasksOpen", next);
      return next;
    });
  };

  const [reportsOpen, setReportsOpen] = useState(() => sessionStorage.getItem("reportsOpen") === "true");
  const toggleReports = () => {
    setReportsOpen((prev) => {
      const next = !prev;
      sessionStorage.setItem("reportsOpen", next);
      return next;
    });
  };

  const [settingsOpen, setSettingsOpen] = useState(false);

  /** Current user info – initialised from local storage. */
  const [user, setUserState] = useState(() => {
    const stored = getUser();
    return {
      name: stored?.name || "User",
      email: stored?.email || "user@example.com",
      role: stored?.role || "Member",
    };
  });

  const location = useLocation();
  const { role: urlRole } = useParams();
  const rolePrefix = `/${urlRole}`;

  // ── Route-matching helpers ──
  /** Exact match for a given page slug. */
  const isActive = (page) => location.pathname === `${rolePrefix}/${page}`;
  /** Exact or prefix match (for detail pages). */
  const isActiveOrStart = (page) => location.pathname === `${rolePrefix}/${page}` || location.pathname.startsWith(`${rolePrefix}/${page}/`);
  const isTaskDetailPage = location.pathname.startsWith(`${rolePrefix}/tasks/task-details/`);
  /** Determine the parent task list (from URL state or query param) for active-state highlighting. */
  const getTaskFrom = () => {
    if (location.state?.from) return location.state.from;
    const queryFrom = new URLSearchParams(location.search).get("from");
    if (queryFrom) return queryFrom;
    // Default to "tasks" (Assigned To You) when no from state is available
    return "tasks";
  };
  const isSubtaskDetailPage = location.pathname.startsWith(`${rolePrefix}/deliveries/deliverable-details/`);
  /** Determine the parent subtask list for active-state highlighting. */
  const getSubtaskFrom = () => {
    if (location.state?.from) return location.state.from;
    const queryFrom = new URLSearchParams(location.search).get("from");
    if (queryFrom) return queryFrom;
    // Default to "deliveries" (Assigned To You) when no from state is available
    return "deliveries";
  };

  // Fetch user data from API on mount
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
          setUserState({ name: data.name, email: data.email, role: data.role, avatar: data.avatar || null });
          const role = getCurrentRole();
          setUser(role, { id: data.id, name: data.name, email: data.email, role: data.role, avatar: data.avatar || null });
        }
      })
      .catch(() => {});
  }, []);

  // Auto-close mobile sidebar on route change
  useEffect(() => {
    setIsMobileOpen(false);
  }, [location.pathname]);

  // Auto-expand dropdowns that correspond to the current route
  useEffect(() => {
    // Tasks dropdown
    const isTasksRoute =
      isActive("tasks") ||
      isActive("taskby") ||
      isActive("self-tasks") ||
      isActive("all-tasks") ||
      location.pathname.startsWith(`${rolePrefix}/tasks/task-details/`);

    if (isTasksRoute) {
      setTasksOpen(true);
      sessionStorage.setItem("tasksOpen", true);
    } else {
      setTasksOpen(false);
      sessionStorage.setItem("tasksOpen", false);
    }

    const isSubtasksRoute =
      isActive("deliveries") ||
      isActive("deliveries-by-you") ||
      isActive("self-deliveries") ||
      isActive("all-deliverables") ||
      location.pathname.startsWith(`${rolePrefix}/deliveries/deliverable-details/`);

    if (isSubtasksRoute) {
      setSubtasksOpen(true);
      sessionStorage.setItem("subtasksOpen", true);
    } else {
      setSubtasksOpen(false);
      sessionStorage.setItem("subtasksOpen", false);
    }

    const isReportsRoute =
      isActive("reports") ||
      isActive("self-report") ||
      isActive("team-members-report") ||
      location.pathname.startsWith(`${rolePrefix}/reports/team-members/`) ||
      (user.role === "team_lead" || user.role === "teamlead") && location.pathname.startsWith(`${rolePrefix}/reports/user-performance/`);

    if (isReportsRoute) {
      setReportsOpen(true);
      sessionStorage.setItem("reportsOpen", true);
    } else {
      setReportsOpen(false);
      sessionStorage.setItem("reportsOpen", false);
    }

    // Settings dropdown
    if (isActive("audit-logs") || isActive("branding") || isActive("subscription")) {
      setSettingsOpen(true);
    }
  }, [location.pathname, location.state]);

  // Broadcast sidebar open/close state to the Header for logo visibility
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("sidebar-state", { detail: { open: isMobileOpen } }));
  }, [isMobileOpen]);

  // Listen for toggle-sidebar events dispatched by the Header hamburger button
  useEffect(() => {
    const handler = () => setIsMobileOpen(prev => !prev);
    window.addEventListener("toggle-sidebar", handler);
    return () => window.removeEventListener("toggle-sidebar", handler);
  }, []);

  const toggleMobile = () => setIsMobileOpen(prev => !prev);

  const toggleTablet = () => setIsTabletExpanded(prev => !prev);

  /** Collapse tablet sidebar when the mouse leaves (tablet viewport only). */
  const handleMouseLeave = () => {
    if (window.innerWidth <= 1200 && window.innerWidth >= 769) {
      setIsTabletExpanded(false);
    }
  };

  /** Expand tablet sidebar when clicking inside it (tablet viewport only). */
  const handleSidebarClick = (e) => {
    if (window.innerWidth <= 1200 && window.innerWidth >= 769) {
      e.stopPropagation();
      setIsTabletExpanded(true);
    }
  };

  return (
    <>
      <div
        className={`sidebar ${isMobileOpen ? "sidebar--open" : ""} ${isTabletExpanded ? "sidebar--tablet-expanded" : ""}`}
        onMouseLeave={handleMouseLeave}
        onClick={handleSidebarClick}
      >

        {/* Mobile-only header with close button and logo */}
        <div className="sidebar-mobile-header">
          <button className="sidebar-close-btn" onClick={toggleMobile} aria-label="Close sidebar">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6L6 18" />
              <path d="M6 6L18 18" />
            </svg>
          </button>
          <div className="sidebar-logo-box">
            {branding?.logo_url ? (
              <img src={branding.logo_url} alt="Logo" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "10px" }} />
            ) : (
              <b>{(branding?.subtitle || 'TX').substring(0, 2).toUpperCase()}</b>
            )}
          </div>
          <div className="sidebar-logo-text">
            <h3>{branding?.subtitle || 'PMS Portal'}</h3>
            <span>{branding?.org_name || 'Organization'}</span>
          </div>
        </div>

        <div>

          {/* Dashboard link */}
          <Link
            to={rolePath("dashboard")}
            className={`sidebar-link ${isActive("dashboard") ? "active" : ""}`}
            onClick={(e) => e.stopPropagation()}
          >
            <MdDashboard />
            <span>Dashboard</span>
          </Link>

          {/* Projects link */}
          <Link
            to={rolePath("projects")}
            className={`sidebar-link ${isActiveOrStart("projects") || (user.role === "guest" && location.pathname.startsWith(`${rolePrefix}/tasks/task-details/`)) ? "active" : ""}`}
            onClick={(e) => e.stopPropagation()}
          >
            <MdOutlineDescription />
            <span>Projects</span>
          </Link>

          {/* Tasks link for guest – simple link below Projects */}
          {user.role === "guest" && (
          <Link
            to={rolePath("guest-tasks")}
            className={`sidebar-link ${isActive("guest-tasks") && !location.pathname.startsWith(`${rolePrefix}/tasks/task-details/`) ? "active" : ""}`}
            onClick={(e) => e.stopPropagation()}
          >
            <MdTask />
            <span>Tasks</span>
          </Link>
          )}

          {/* Tasks dropdown – sub-links for assigned/by-you/self/all; hidden for guest */}
          {user.role !== "guest" && (
          <div className={`sidebar-link ${isActive("tasks") || isActive("taskby") || isActive("self-tasks") || isActive("all-tasks") || location.pathname.startsWith(`${rolePrefix}/tasks/task-details/`) ? "active" : ""}`} style={{ cursor: "default", flexDirection: "column", alignItems: "stretch" }}>
            <div
              onClick={toggleTasks}
              style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", padding: "4px 0" }}
            >
              <MdTask />
              <span style={{ flex: 1 }}>Tasks</span>
              <MdKeyboardArrowDown
                size={18}
                style={{
                  transition: "transform 0.2s",
                  transform: tasksOpen ? "rotate(180deg)" : "rotate(0deg)",
                }}
              />
            </div>
            {tasksOpen && (
              <div className="sidebar-sub-links">
                <Link
                  to={rolePath("tasks")}
                  className={`sidebar-sub-link ${isActive("tasks") || (isTaskDetailPage && getTaskFrom() === "tasks") ? "active" : ""}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  Assigned to You
                </Link>
                {user.role !== "guest" && (
                <>
                <Link
                  to={rolePath("taskby")}
                  className={`sidebar-sub-link ${isActive("taskby") || (isTaskDetailPage && getTaskFrom() === "taskby") ? "active" : ""}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  Assigned by You
                </Link>
                <Link
                  to={rolePath("self-tasks")}
                  className={`sidebar-sub-link ${isActive("self-tasks") || (isTaskDetailPage && getTaskFrom() === "self-tasks") ? "active" : ""}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  Self Tasks
                </Link>
                <Link
                  to={rolePath("all-tasks")}
                  className={`sidebar-sub-link ${isActive("all-tasks") || (isTaskDetailPage && getTaskFrom() === "all-tasks") ? "active" : ""}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  All Tasks
                </Link>
                </>
                )}
              </div>
            )}
          </div>
          )}

          {/* Subtasks dropdown – sub-links for assigned/by-you/self; hidden for guest */}
          {user.role !== "guest" && (
          <div className={`sidebar-link ${isActive("deliveries") || isActive("deliveries-by-you") || isActive("self-deliveries") || isActive("all-deliverables") || location.pathname.startsWith(`${rolePrefix}/deliveries/deliverable-details/`) ? "active" : ""}`} style={{ cursor: "default", flexDirection: "column", alignItems: "stretch" }}>
            <div
              onClick={toggleSubtasks}
              style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", padding: "4px 0" }}
            >
              <MdAssignment />
              <span style={{ flex: 1 }}>Subtasks</span>
              <MdKeyboardArrowDown
                size={18}
                style={{
                  transition: "transform 0.2s",
                  transform: subtasksOpen ? "rotate(180deg)" : "rotate(0deg)",
                }}
              />
            </div>
            {subtasksOpen && (
              <div className="sidebar-sub-links">
                <Link
                  to={rolePath("deliveries")}
                  className={`sidebar-sub-link ${isActive("deliveries") || (isSubtaskDetailPage && getSubtaskFrom() === "deliveries") ? "active" : ""}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  Assigned To You
                </Link>
                {user.role !== "guest" && (
                <>
                <Link
                  to={rolePath("deliveries-by-you")}
                  className={`sidebar-sub-link ${isActive("deliveries-by-you") || (isSubtaskDetailPage && getSubtaskFrom() === "deliveries-by-you") ? "active" : ""}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  Assigned By You
                </Link>
                <Link
                  to={rolePath("self-deliveries")}
                  className={`sidebar-sub-link ${isActive("self-deliveries") || (isSubtaskDetailPage && getSubtaskFrom() === "self-deliveries") ? "active" : ""}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  Self Subtasks
                </Link>
                <Link
                  to={rolePath("all-deliverables")}
                  className={`sidebar-sub-link ${isActive("all-deliverables") || (isSubtaskDetailPage && getSubtaskFrom() === "all-deliverables") ? "active" : ""}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  All Sub-Tasks
                </Link>
                </>
                )}
              </div>
            )}
          </div>
          )}

          {/* Calendar link */}
          <Link
            to={rolePath("calender")}
            className={`sidebar-link ${isActiveOrStart("calender") ? "active" : ""}`}
          >
            <MdCalendarToday />
            Calendar
          </Link>

          {/* Drafts link */}
          <Link
            to={rolePath("drafts")}
            className={`sidebar-link ${isActiveOrStart("drafts") ? "active" : ""}`}
            onClick={(e) => e.stopPropagation()}
          >
            <MdEditNote />
            <span>Drafts</span>
          </Link>

          <hr />

          {/* Admin/Manager only – Users link */}
          {(user.role === "admin" || user.role === "manager") && (
            <Link
              to={rolePath("manage-users")}
              className={`sidebar-link ${isActive("manage-users") || location.pathname.startsWith(`${rolePrefix}/manage-users/user-profile/`) ? "active" : ""}`}
              onClick={(e) => e.stopPropagation()}
            >
              <MdPerson />
              <span>Users</span>
            </Link>
          )}

          {/* Admin/Manager only – Team link */}
          {(user.role === "admin" || user.role === "manager") && (
            <Link
              to={rolePath("manage-team")}
              className={`sidebar-link ${isActive("manage-team") ? "active" : ""}`}
              onClick={(e) => e.stopPropagation()}
            >
              <MdPeople />
              <span>Team</span>
            </Link>
          )}

          {/* Member/Team Lead – read-only Team link */}
          {(user.role === "member" || user.role === "team_lead" || user.role === "teamlead") && (
            <Link
              to={rolePath("my-team")}
              className={`sidebar-link ${isActive("my-team") ? "active" : ""}`}
              onClick={(e) => e.stopPropagation()}
            >
              <MdPeople />
              <span>Team</span>
            </Link>
          )}

          {/* Reports – dropdown for team_lead, simple link for others; hidden for guest */}
          {user.role !== "guest" && (user.role === "team_lead" || user.role === "teamlead") && (
            <div className={`sidebar-link ${isActive("reports") || isActive("team-members-report") || location.pathname.startsWith(`${rolePrefix}/reports/team-members/`) || location.pathname.startsWith(`${rolePrefix}/reports/user-performance/`) ? "active" : ""}`} style={{ cursor: "default", flexDirection: "column", alignItems: "stretch" }}>
              <div
                onClick={toggleReports}
                style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", padding: "4px 0" }}
              >
                <MdBarChart />
                <span style={{ flex: 1 }}>Reports</span>
                <MdKeyboardArrowDown
                  size={18}
                  style={{
                    transition: "transform 0.2s",
                    transform: reportsOpen ? "rotate(180deg)" : "rotate(0deg)",
                  }}
                />
              </div>
              {reportsOpen && (
                <div className="sidebar-sub-links">
                  <Link
                    to={rolePath("reports/user-performance/me")}
                    className={`sidebar-sub-link ${location.pathname.startsWith(`${rolePrefix}/reports/user-performance/me`) ? "active" : ""}`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    Self Report
                  </Link>
                  <Link
                    to={rolePath("team-members-report")}
                    className={`sidebar-sub-link ${isActive("team-members-report") ? "active" : ""}`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    Team Members Reports
                  </Link>
                </div>
              )}
            </div>
          )}

          {user.role !== "guest" && user.role !== "team_lead" && user.role !== "teamlead" && (
            <Link
              to={user.role === "member" ? rolePath("reports/user-performance/me") : rolePath("reports")}
              className={`sidebar-link ${isActive("reports") || location.pathname.startsWith(`${rolePrefix}/reports/team-members/`) || location.pathname.startsWith(`${rolePrefix}/reports/user-performance/`) ? "active" : ""}`}
            >
              <MdBarChart />
              Reports
            </Link>
          )}

          {/* Super Admin link – only for the platform owner tenant */}
          {getTenantSlug() === import.meta.env.VITE_SUPER_ADMIN_TENANT && user.role === "admin" && (
            <a
              href="/super-admin"
              target="_blank"
              rel="noopener noreferrer"
              className="sidebar-link"
              onClick={(e) => e.stopPropagation()}
            >
              <MdOpenInNew />
              <span>Organization</span>
            </a>
          )}

          {/* Settings dropdown – admin only */}
          {(user.role === "admin" || user.role === "manager") && (
            <div className={`sidebar-link ${isActive("audit-logs") || isActive("branding") || isActive("subscription") ? "active" : ""}`} style={{ cursor: "default", flexDirection: "column", alignItems: "stretch" }}>
              <div
                onClick={() => setSettingsOpen((p) => !p)}
                style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", padding: "4px 0" }}
              >
                <MdSettings fontSize={22} />
                <span style={{ flex: 1 }}>Settings</span>
                <MdKeyboardArrowDown
                  size={18}
                  style={{
                    transition: "transform 0.2s",
                    transform: settingsOpen ? "rotate(180deg)" : "rotate(0deg)",
                  }}
                />
              </div>
              {settingsOpen && (
                <div className="sidebar-sub-links">
                  {getTenantSlug() !== import.meta.env.VITE_SUPER_ADMIN_TENANT && (
                    <Link
                      to={rolePath("subscription")}
                      className={`sidebar-sub-link ${isActive("subscription") ? "active" : ""}`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      Subscription
                    </Link>
                  )}
                  <Link
                    to={rolePath("audit-logs")}
                    className={`sidebar-sub-link ${isActive("audit-logs") ? "active" : ""}`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    Application Logs
                  </Link>
                  {user.role === "admin" && (
                    <Link
                      to={rolePath("branding")}
                      className={`sidebar-sub-link ${isActive("branding") ? "active" : ""}`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      Branding
                    </Link>
                  )}
                </div>
              )}
            </div>
          )}


        </div>

      </div>

      {/* Mobile backdrop – clicking closes the sidebar */}
      {isMobileOpen && <div className="sidebar-backdrop" onClick={toggleMobile} />}
      {/* Tablet backdrop – clicking collapses the sidebar */}
      {isTabletExpanded && <div className="sidebar-tablet-backdrop" onClick={toggleTablet} />}
    </>
  );
}

export default Sidebar;
