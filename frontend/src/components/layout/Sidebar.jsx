/**
 * Sidebar component.
 */

import { Link, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";

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
} from "react-icons/md";

import "./Sidebar.css";

import ProfileModal from "../ProfileModal";

function Sidebar() {

  const [isProfileModalOpen, setIsProfileModalOpen] =
    useState(false);
    
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const [user, setUser] = useState({
    name:
      localStorage.getItem("name") || "User",

    email:
      localStorage.getItem("email") ||
      "user@example.com",

    role:
      localStorage.getItem("role") ||
      "Member",
  });

  const location = useLocation();

  useEffect(() => {

    const token =
      localStorage.getItem("token");

    if (!token) return;

    fetch("http://127.0.0.1:8000/api/user", {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
    })
      .then((res) => res.json())
      .then((data) => {

        if (data && data.name) {

          setUser({
            name: data.name,
            email: data.email,
            role: data.role,
          });

          localStorage.setItem(
            "userId",
            data.id
          );

          localStorage.setItem(
            "name",
            data.name
          );

          localStorage.setItem(
            "email",
            data.email
          );

          localStorage.setItem(
            "role",
            data.role
          );
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
    window.dispatchEvent(new CustomEvent("sidebar-state", { detail: { open: isMobileOpen } }));
  }, [isMobileOpen]);

  useEffect(() => {
    const handler = () => setIsMobileOpen(prev => !prev);
    window.addEventListener("toggle-sidebar", handler);
    return () => window.removeEventListener("toggle-sidebar", handler);
  }, []);

  const openProfileModal = () =>
    setIsProfileModalOpen(true);

  const closeProfileModal = () => {
    setIsProfileModalOpen(false);
  };

  const toggleMobile = () => setIsMobileOpen(prev => !prev);

  return (
    <>
      <div className={`sidebar ${isMobileOpen ? "sidebar--open" : ""}`}>

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
              !isProfileModalOpen && (
                location.pathname === "/admin/dashboard" ||
                location.pathname === "/manager/dashboard" ||
                location.pathname === "/teamlead/dashboard" ||
                location.pathname === "/member/dashboard"
              )
                ? "active"
                : ""
            }`}
          >
            <MdDashboard />
            Dashboard
          </Link>

          <Link
            to="/deliveries"
            className={`sidebar-link ${
              !isProfileModalOpen && (location.pathname === "/deliveries" ||
              location.pathname.startsWith("/deliverable-details/") ||
              location.pathname.startsWith("/deliverable/"))
                ? "active"
                : ""
            }`}
          >
            <MdAssignment />
            Deliverables
          </Link>

          <Link
            to="/projects"
            className={`sidebar-link ${
              !isProfileModalOpen && (location.pathname === "/projects" ||
              location.pathname.startsWith(
                "/projects/"
              ))
                ? "active"
                : ""
            }`}
          >
            <MdOutlineDescription />
            Projects
          </Link>

          <Link
            to="/tasks"
            className={`sidebar-link ${
              !isProfileModalOpen && (location.pathname === "/tasks" ||
              location.pathname === "/taskby" ||
              location.pathname === "/taskdetails" ||
              location.pathname === "/details" ||
              location.pathname.startsWith("/details/") ||
              location.pathname.startsWith("/taskdetails/"))
                ? "active"
                : ""
            }`}
          >
            <MdTask />
            Tasks
          </Link>

          <Link
            to="/calender"
            className={`sidebar-link ${
              !isProfileModalOpen && (location.pathname === "/calender" ||
              location.pathname.startsWith("/calender/"))
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
                !isProfileModalOpen && location.pathname ===
                "/manage-users"
                  ? "active"
                  : ""
              }`}
            >
              <MdPerson />
              Manage Users
            </Link>
          )}

          {(user.role === "admin" || user.role === "manager") && (
            <Link
              to="/manage-team"
              className={`sidebar-link ${
                !isProfileModalOpen && location.pathname ===
                "/manage-team"
                  ? "active"
                  : ""
              }`}
            >
              <MdPeople />
              Manage Team
            </Link>
          )}

          <Link
            to="/reports"
            className={`sidebar-link ${
              !isProfileModalOpen && location.pathname ===
              "/reports"
                ? "active"
                : ""
            }`}
          >
            <MdBarChart />
            Reports
          </Link>

        </div>

        <div className="sidebar-bottom">

          <button
            className={`sidebar-link profile-link ${
              isProfileModalOpen ? "active" : ""
            }`}
            onClick={openProfileModal}
          >
            <MdPerson />
            Profile
          </button>

          <Link
            to="/"
            className="sidebar-link logout-link"
          >
            <MdLogout />
            Logout Account
          </Link>

        </div>

      </div>

      {isMobileOpen && <div className="sidebar-backdrop" onClick={toggleMobile} />}

      {isProfileModalOpen && (
        <ProfileModal
          user={user}
          onClose={closeProfileModal}
        />
      )}
    </>
  );
}

export default Sidebar;
