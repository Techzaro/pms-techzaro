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
  MdLogout,
  MdMenu,
  MdClose,
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
      <button className="sidebar-toggle" onClick={toggleMobile} aria-label="Toggle sidebar">
        {isMobileOpen ? <MdClose size={24} /> : <MdMenu size={24} />}
      </button>

      <div className={`sidebar ${isMobileOpen ? "sidebar--open" : ""}`}>

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
