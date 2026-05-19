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
} from "react-icons/md";

import "./Sidebar.css";

import ProfileModal from "../ProfileModal";

/**
 * Sidebar navigation component used in dashboard layout.
 */

function Sidebar() {

  const [isProfileModalOpen, setIsProfileModalOpen] =
    useState(false);
    
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

  /**
   * OPEN PROFILE MODAL
   */

  const openProfileModal = () =>
    setIsProfileModalOpen(true);

  /**
   * CLOSE PROFILE MODAL
   */

  const closeProfileModal = () => {
    setIsProfileModalOpen(false);
  };

  return (

    <div className="sidebar">

      {/* TOP LINKS */}

      <div>

        <Link
          to="/admin"
          className={`sidebar-link ${
            location.pathname === "/admin"
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
            location.pathname === "/deliveries"
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
            location.pathname === "/projects" ||
            location.pathname.startsWith(
              "/projects/"
            )
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
            location.pathname === "/tasks"
              ? "active"
              : ""
          }`}
        >
          <MdTask />
          Tasks
        </Link>

        <hr />

        {user.role === "admin" && (

          <Link
            to="/manage-users"
            className={`sidebar-link ${
              location.pathname ===
              "/manage-users"
                ? "active"
                : ""
            }`}
          >
            <MdPerson />
            Manage Users
          </Link>
        )}

        <Link
          to="/manage-team"
          className={`sidebar-link ${
            location.pathname ===
            "/manage-team"
              ? "active"
              : ""
          }`}
        >
          <MdPeople />
          Manage Team
        </Link>

      </div>

      {/* BOTTOM */}

      <div className="sidebar-bottom">

        <button
          className="sidebar-link profile-link"
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

      {/* PROFILE MODAL */}

      {isProfileModalOpen && (
        <ProfileModal
          user={user}
          onClose={closeProfileModal}
        />
      )}

    </div>
  );
}

export default Sidebar;