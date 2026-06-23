/**
 * Sidebar component.
 */

import { Link, useLocation, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import API_URL from "../../config/api";
import { authToken, getCurrentRole, getUser, setUser, clearSession, getToken, rolePath, getUrlRole } from "../../utils/auth";

import {
  MdDashboard,
  MdTask,
  MdAssignment,
  MdOutlineDescription,
  MdPerson,
  MdPeople,
  MdCalendarToday,
  MdBarChart,
  MdLogout,
  MdKeyboardArrowDown,
} from "react-icons/md";

import "./Sidebar.css";

function Sidebar() {

  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const [isTabletExpanded, setIsTabletExpanded] = useState(false);
  const [tasksOpen, setTasksOpen] = useState(() => sessionStorage.getItem("tasksOpen") === "true");
  const toggleTasks = () => {
    setTasksOpen((prev) => {
      const next = !prev;
      sessionStorage.setItem("tasksOpen", next);
      return next;
    });
  };

  const [deliverablesOpen, setDeliverablesOpen] = useState(() => sessionStorage.getItem("deliverablesOpen") === "true");
  const toggleDeliverables = () => {
    setDeliverablesOpen((prev) => {
      const next = !prev;
      sessionStorage.setItem("deliverablesOpen", next);
      return next;
    });
  };

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

  const isActive = (page) => location.pathname === `${rolePrefix}/${page}`;
  const isActiveOrStart = (page) => location.pathname === `${rolePrefix}/${page}` || location.pathname.startsWith(`${rolePrefix}/${page}/`);
  const isTaskDetailPage = location.pathname.startsWith(`${rolePrefix}/tasks/task-details/`);
  const getTaskFrom = () => {
    if (location.state?.from) return location.state.from;
    return new URLSearchParams(location.search).get("from");
  };
  const isDeliverableDetailPage = location.pathname.startsWith(`${rolePrefix}/deliveries/deliverable-details/`);
  const getDeliverableFrom = () => {
    if (location.state?.from) return location.state.from;
    return new URLSearchParams(location.search).get("from");
  };

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
          setUserState({ name: data.name, email: data.email, role: data.role });
          const role = getCurrentRole();
          setUser(role, { id: data.id, name: data.name, email: data.email, role: data.role });
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setIsMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const isTasksRoute =
      isActive("tasks") ||
      isActive("taskby") ||
      isActive("self-tasks") ||
      location.pathname.startsWith(`${rolePrefix}/tasks/task-details/`);

    if (isTasksRoute) {
      setTasksOpen(true);
      sessionStorage.setItem("tasksOpen", true);
    } else {
      setTasksOpen(false);
      sessionStorage.setItem("tasksOpen", false);
    }

    const isDeliverablesRoute =
      isActive("deliveries") ||
      isActive("deliveries-by-you") ||
      isActive("self-deliveries") ||
      location.pathname.startsWith(`${rolePrefix}/deliveries/deliverable-details/`);

    if (isDeliverablesRoute) {
      setDeliverablesOpen(true);
      sessionStorage.setItem("deliverablesOpen", true);
    } else {
      setDeliverablesOpen(false);
      sessionStorage.setItem("deliverablesOpen", false);
    }
  }, [location.pathname]);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("sidebar-state", { detail: { open: isMobileOpen } }));
  }, [isMobileOpen]);

  useEffect(() => {
    const handler = () => setIsMobileOpen(prev => !prev);
    window.addEventListener("toggle-sidebar", handler);
    return () => window.removeEventListener("toggle-sidebar", handler);
  }, []);

  const toggleMobile = () => setIsMobileOpen(prev => !prev);

  const toggleTablet = () => setIsTabletExpanded(prev => !prev);

  const handleMouseLeave = () => {
    if (window.innerWidth <= 1200 && window.innerWidth >= 769) {
      setIsTabletExpanded(false);
    }
  };

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

        <div className="sidebar-mobile-header">
          <button className="sidebar-close-btn" onClick={toggleMobile} aria-label="Close sidebar">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6L6 18" />
              <path d="M6 6L18 18" />
            </svg>
          </button>
          <div className="sidebar-logo-box">
            <b>TX</b>
          </div>
          <div className="sidebar-logo-text">
            <h3>Techxaro</h3>
            <span>PMS Portal</span>
          </div>
        </div>

        <div>

          <Link
            to={rolePath("dashboard")}
            className={`sidebar-link ${isActive("dashboard") ? "active" : ""}`}
            onClick={(e) => e.stopPropagation()}
          >
            <MdDashboard />
            <span>Dashboard</span>
          </Link>

          {/* DELIVERABLES DROPDOWN */}
          <div className={`sidebar-link ${isActive("deliveries") || isActive("deliveries-by-you") || isActive("self-deliveries") || location.pathname.startsWith(`${rolePrefix}/deliveries/deliverable-details/`) ? "active" : ""}`} style={{ cursor: "default", flexDirection: "column", alignItems: "stretch" }}>
            <div
              onClick={toggleDeliverables}
              style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", padding: "4px 0" }}
            >
              <MdAssignment />
              <span style={{ flex: 1 }}>Deliverables</span>
              <MdKeyboardArrowDown
                size={18}
                style={{
                  transition: "transform 0.2s",
                  transform: deliverablesOpen ? "rotate(180deg)" : "rotate(0deg)",
                }}
              />
            </div>
            {deliverablesOpen && (
              <div className="sidebar-sub-links">
                <Link
                  to={rolePath("deliveries")}
                  className={`sidebar-sub-link ${isActive("deliveries") || (isDeliverableDetailPage && getDeliverableFrom() === "deliveries") ? "active" : ""}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  Assigned To You
                </Link>
                <Link
                  to={rolePath("deliveries-by-you")}
                  className={`sidebar-sub-link ${isActive("deliveries-by-you") || (isDeliverableDetailPage && getDeliverableFrom() === "deliveries-by-you") ? "active" : ""}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  Assigned By You
                </Link>
                <Link
                  to={rolePath("self-deliveries")}
                  className={`sidebar-sub-link ${isActive("self-deliveries") || (isDeliverableDetailPage && getDeliverableFrom() === "self-deliveries") ? "active" : ""}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  Self Deliverables
                </Link>
              </div>
            )}
          </div>

          <Link
            to={rolePath("projects")}
            className={`sidebar-link ${isActiveOrStart("projects") ? "active" : ""}`}
            onClick={(e) => e.stopPropagation()}
          >
            <MdOutlineDescription />
            <span>Projects</span>
          </Link>

          {/* TASKS DROPDOWN */}
          <div className={`sidebar-link ${isActive("tasks") || isActive("taskby") || isActive("self-tasks") || location.pathname.startsWith(`${rolePrefix}/tasks/task-details/`) ? "active" : ""}`} style={{ cursor: "default", flexDirection: "column", alignItems: "stretch" }}>
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
              </div>
            )}
          </div>

          <Link
            to={rolePath("calender")}
            className={`sidebar-link ${isActiveOrStart("calender") ? "active" : ""}`}
          >
            <MdCalendarToday />
            Calendar
          </Link>

          <hr />

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

          <Link
            to={user.role === "admin" || user.role === "manager" ? rolePath("reports") : rolePath("reports/user-performance/me")}
            className={`sidebar-link ${isActive("reports") || location.pathname.startsWith(`${rolePrefix}/reports/user-performance/`) ? "active" : ""}`}
          >
            <MdBarChart />
            Reports
          </Link>

        </div>

        <div className="sidebar-bottom">

          <Link
            to={rolePath("my-profile")}
            className={`sidebar-link profile-link ${isActive("my-profile") ? "active" : ""}`}
            onClick={(e) => e.stopPropagation()}
          >
            <MdPerson />
            <span>Profile</span>
          </Link>

          <Link
            to="/"
            className="sidebar-link logout-link"
            onClick={async (e) => {
              e.preventDefault();
              e.stopPropagation();
              const role = getCurrentRole();
              const token = getToken(role);
              if (token) {
                try {
                  await fetch(`${API_URL}/logout`, {
                    method: "POST",
                    headers: {
                      Accept: "application/json",
                      Authorization: `Bearer ${token}`,
                    },
                    skipLoader: true,
                  });
                } catch {
                  // ignore logout API errors
                }
              }
              clearSession(role);
              window.location.href = "/";
            }}
          >
            <MdLogout />
            <span>Logout</span>
          </Link>

        </div>

      </div>

      {isMobileOpen && <div className="sidebar-backdrop" onClick={toggleMobile} />}
      {isTabletExpanded && <div className="sidebar-tablet-backdrop" onClick={toggleTablet} />}
    </>
  );
}

export default Sidebar;
