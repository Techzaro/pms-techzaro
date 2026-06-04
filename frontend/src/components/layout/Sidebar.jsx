/**
 * Sidebar component.
 */

import { Link, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import API_URL from "../../config/api";
import { authToken, authHeaders, getCurrentRole, getUser, setUser, clearSession } from "../../utils/auth";

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

  const [user, setUserState] = useState(() => {
    const stored = getUser();
    return {
      name: stored?.name || "User",
      email: stored?.email || "user@example.com",
      role: stored?.role || "Member",
    };
  });

  const location = useLocation();

  useEffect(() => {

    const token = authToken();

    if (!token) return;

    fetch(`${API_URL}/user`, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
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
          setUser(role, { id: data.id, name: data.name, email: data.email, role: data.role });
        }
      })
      .catch(() => {
        // ignore errors
      });

  }, []);

  useEffect(() => {
    setIsMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const isTasksRoute =
      location.pathname === "/tasks" ||
      location.pathname === "/taskby" ||
      location.pathname === "/taskdetails" ||
      location.pathname === "/details" ||
      location.pathname.startsWith("/details/") ||
      location.pathname.startsWith("/taskdetails/");

    if (isTasksRoute) {
      setTasksOpen(true);
      sessionStorage.setItem("tasksOpen", true);
    } else {
      setTasksOpen(false);
      sessionStorage.setItem("tasksOpen", false);
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
            to={(() => {
              const role = user.role;
              if (role === "admin") return "/admin/dashboard";
              if (role === "manager") return "/manager/dashboard";
              if (role === "teamlead" || role === "team_lead") return "/teamlead/dashboard";
              return "/member/dashboard";
            })()}
            className={`sidebar-link ${
              location.pathname === "/admin/dashboard" ||
              location.pathname === "/manager/dashboard" ||
              location.pathname === "/teamlead/dashboard" ||
              location.pathname === "/member/dashboard"
                ? "active"
                : ""
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <MdDashboard />
            <span>Dashboard</span>
          </Link>

          <Link
            to="/deliveries"
            className={`sidebar-link ${
              location.pathname === "/deliveries" ||
              location.pathname.startsWith("/deliverable-details/") ||
              location.pathname.startsWith("/deliverable/")
                ? "active"
                : ""
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <MdAssignment />
            <span>Deliverables</span>
          </Link>

          <Link
            to="/projects"
            className={`sidebar-link ${
              location.pathname === "/projects" ||
              location.pathname.startsWith("/projects/")
                ? "active"
                : ""
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <MdOutlineDescription />
            <span>Projects</span>
          </Link>

          {/* TASKS DROPDOWN */}
          <div className={`sidebar-link ${location.pathname === "/tasks" || location.pathname === "/taskby" || location.pathname === "/taskdetails" || location.pathname === "/details" || location.pathname.startsWith("/details/") || location.pathname.startsWith("/taskdetails/") ? "active" : ""}`} style={{ cursor: "default", flexDirection: "column", alignItems: "stretch" }}>
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
                  to="/tasks"
                  className={`sidebar-sub-link ${location.pathname === "/tasks" ? "active" : ""}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  Assigned to You
                </Link>
                <Link
                  to="/taskby"
                  className={`sidebar-sub-link ${location.pathname === "/taskby" ? "active" : ""}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  Assigned by You
                </Link>
              </div>
            )}
          </div>

          <Link
            to="/calender"
            className={`sidebar-link ${
              location.pathname === "/calender" ||
              location.pathname.startsWith("/calender/")
                ? "active"
                : ""
            }`}
          >
            <MdCalendarToday />
            Calendar
          </Link>

          <hr />

          {(user.role === "admin" || user.role === "manager") && (
            <Link
              to="/manage-users"
              className={`sidebar-link ${
                location.pathname === "/manage-users" ||
                location.pathname.startsWith("/user-profile/")
                  ? "active"
                  : ""
              }`}
              onClick={(e) => e.stopPropagation()}
            >
              <MdPerson />
              <span>Users</span>
            </Link>
          )}

          {(user.role === "admin" || user.role === "manager") && (
            <Link
              to="/manage-team"
              className={`sidebar-link ${
                location.pathname === "/manage-team"
                  ? "active"
                  : ""
              }`}
              onClick={(e) => e.stopPropagation()}
            >
              <MdPeople />
              <span>Team</span>
            </Link>
          )}

          <Link
            to={user.role === "admin" || user.role === "manager" || user.role === "team_lead" ? "/reports" : "/user-performance/me"}
            className={`sidebar-link ${
              location.pathname === "/reports" || location.pathname.startsWith("/user-performance/")
                ? "active"
                : ""
            }`}
          >
            <MdBarChart />
            Reports
          </Link>

        </div>

        <div className="sidebar-bottom">

          <Link
            to="/my-profile"
            className={`sidebar-link profile-link ${
              location.pathname === "/my-profile" ? "active" : ""
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <MdPerson />
            <span>Profile</span>
          </Link>

          <Link
            to="/"
            className="sidebar-link logout-link"
            onClick={(e) => {
              e.stopPropagation();
              clearSession(getCurrentRole());
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
