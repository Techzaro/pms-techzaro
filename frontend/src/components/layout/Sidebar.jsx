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
  MdEvent,
  MdBarChart,
  MdKeyboardArrowDown,
  MdHistory,
  MdSettings,
  MdEditNote,
  MdDifference,
  MdMenuBook,
  MdChat,
  MdStorage,
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
  const { slug } = useParams();
  const rolePrefix = `/org/${slug}`;

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

    const isSettingsRoute =
      isActive("audit-logs") ||
      isActive("settings/notifications") ||
      isActive("settings/personalization") ||
      isActive("branding") ||
      isActive("subscription");

    if (isSettingsRoute) {
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
          <div className={`sidebar-dropdown-group ${tasksOpen || isActive("tasks") || isActive("taskby") || isActive("self-tasks") || isActive("all-tasks") || location.pathname.startsWith(`${rolePrefix}/tasks/task-details/`) ? "open active" : ""}`}>
            <div
              className="sidebar-dropdown-header"
              onClick={toggleTasks}
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
          <div className={`sidebar-dropdown-group ${subtasksOpen || isActive("deliveries") || isActive("deliveries-by-you") || isActive("self-deliveries") || isActive("all-deliverables") || location.pathname.startsWith(`${rolePrefix}/deliveries/deliverable-details/`) ? "open active" : ""}`}>
            <div
              className="sidebar-dropdown-header"
              onClick={toggleSubtasks}
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

          {/* Drafts link */}
          <Link
            to={rolePath("drafts")}
            className={`sidebar-link ${isActiveOrStart("drafts") ? "active" : ""}`}
            onClick={(e) => e.stopPropagation()}
          >
            <MdEditNote />
            <span>Drafts</span>
          </Link>

          {/* Templates link */}
          <Link
            to={rolePath("templates")}
            className={`sidebar-link ${isActiveOrStart("templates") ? "active" : ""}`}
            onClick={(e) => e.stopPropagation()}
          >
            <MdDifference />
            <span>Templates</span>
          </Link>

          {/* Calendar link */}
          <Link
            to={rolePath("calendar")}
            className={`sidebar-link ${isActive("calendar") || isActive("calender") ? "active" : ""}`}
            onClick={(e) => e.stopPropagation()}
          >
            <MdCalendarToday />
            <span>Calendar</span>
          </Link>

          {/* Events link */}
          <Link
            to={rolePath("events")}
            className={`sidebar-link ${isActive("events") ? "active" : ""}`}
            onClick={(e) => e.stopPropagation()}
          >
            <MdEvent />
            <span>Events</span>
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
            <div className={`sidebar-dropdown-group ${reportsOpen || isActive("reports") || isActive("team-members-report") || location.pathname.startsWith(`${rolePrefix}/reports/team-members/`) || location.pathname.startsWith(`${rolePrefix}/reports/user-performance/`) ? "open active" : ""}`}>
              <div
                className="sidebar-dropdown-header"
                onClick={toggleReports}
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

          {/* Knowledge Base link – positioned directly underneath Reports */}
          {user.role !== "guest" && (
            <Link
              to={rolePath("knowledge-base")}
              className={`sidebar-link ${isActiveOrStart("knowledge-base") ? "active" : ""}`}
              onClick={(e) => e.stopPropagation()}
            >
              <MdMenuBook />
              <span>Knowledge Base</span>
            </Link>
          )}

          {/* Settings dropdown – click to toggle like Tasks */}
          <div className={`sidebar-dropdown-group ${settingsOpen || isActive("audit-logs") || isActive("settings/notifications") || isActive("branding") || isActive("subscription") || isActive("organization-details") ? "open active" : ""}`}>
            <div
              className="sidebar-dropdown-header"
              onClick={() => setSettingsOpen((p) => !p)}
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
                {(user.role === "admin" || user.role === "manager") && (
                  <Link
                    to={rolePath("audit-logs")}
                    className={`sidebar-sub-link ${isActive("audit-logs") ? "active" : ""}`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    Application Logs
                  </Link>
                )}
                {(user.role === "admin" || user.role === "manager") && (
                  <Link
                    to={rolePath("feedback")}
                    className={`sidebar-sub-link ${isActive("feedback") ? "active" : ""}`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    User Feedback
                  </Link>
                )}
                <Link
                  to={rolePath("settings/notifications")}
                  className={`sidebar-sub-link ${isActive("settings/notifications") ? "active" : ""}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  Notification Preferences
                </Link>
                <Link
                  to={rolePath("settings/personalization")}
                  className={`sidebar-sub-link ${isActive("settings/personalization") ? "active" : ""}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  Personalization
                </Link>
                {(user.role === "admin") && (
                  <Link
                    to={rolePath("organization-details")}
                    className={`sidebar-sub-link ${isActive("organization-details") ? "active" : ""}`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    Organization Details
                  </Link>
                )}
                {(user.role === "admin") && (
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