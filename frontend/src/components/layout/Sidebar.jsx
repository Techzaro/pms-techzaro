import { Link, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";

import {
  MdDashboard,
  MdTask,
  MdAssignment,
  MdOutlineDescription,
  MdHistory,
  MdBarChart,
  MdPerson,
  MdPeople,
  MdLogout,
  MdAdd,
  MdEdit
} from "react-icons/md";

import "./Sidebar.css";

function Sidebar() {
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [user, setUser] = useState({
    name: localStorage.getItem("name") || "User",
    email: localStorage.getItem("email") || "N/A",
    role: localStorage.getItem("role") || "Member",
  });
  const location = useLocation();

  useEffect(() => {
    const token = localStorage.getItem("token");
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
          localStorage.setItem("name", data.name);
          localStorage.setItem("email", data.email);
          localStorage.setItem("role", data.role);
        }
      })
      .catch(() => {
        // ignore and use fallback values
      });
  }, []);

  const openProfileModal = () => setIsProfileModalOpen(true);
  const closeProfileModal = () => {
    setIsProfileModalOpen(false);
    setNewPassword("");
    setConfirmPassword("");
  };

  const handlePasswordChange = async () => {
    if (!newPassword || !confirmPassword) {
      alert("Please enter and confirm your new password.");
      return;
    }

    if (newPassword !== confirmPassword) {
      alert("New password and confirm password do not match.");
      return;
    }

    try {
      const token = localStorage.getItem("token");
      const res = await fetch("http://127.0.0.1:8000/api/user/change-password", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ password: newPassword }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Failed to change password");
      }

      alert(data.message || "Password changed successfully.");
      closeProfileModal();
    } catch (error) {
      console.error(error);
      alert(error.message || "Failed to change password.");
    }
  };

  return (

    <div className="sidebar">

      <div>

        <Link to="/admin" className={`sidebar-link ${location.pathname === '/admin' ? 'active' : ''}`}>
          <MdDashboard /> Dashboard
        </Link>

        <Link to="/deliveries" className="sidebar-link">
          <MdAssignment /> Deliveriables
        </Link>

        <Link to="/projects" className={`sidebar-link ${location.pathname === '/projects' || location.pathname.startsWith('/projects/') ? 'active' : ''}`}>
          <MdOutlineDescription /> Projects
        </Link>

        <Link to="/tasks" className={`sidebar-link ${location.pathname === '/tasks' ? 'active' : ''}`}>
          <MdTask /> Tasks
        </Link>

        <hr />
        {user.role === "admin" && (
          <Link to="/manage-users" className={`sidebar-link ${location.pathname === '/manage-users' ? 'active' : ''}`}>
            <MdPerson /> Manage Users
          </Link>
        )}
        <Link to="/manage-team" className={`sidebar-link ${location.pathname === '/manage-team' ? 'active' : ''}`}>
          <MdPeople /> Manage Team
        </Link>

      </div>

      <div className="sidebar-bottom">

        <button className="sidebar-link profile-link" onClick={openProfileModal}>
          <MdPerson /> Profile
        </button>

        <Link to="/" className="sidebar-link logout-link">
          <MdLogout /> Logout Account
        </Link>

      </div>

      {isProfileModalOpen && (
        <div className="modal-overlay" onClick={closeProfileModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="user-modal-header">
              <div>
                <h2>My Profile</h2>
                <p className="modal-subtitle">Your account information</p>
              </div>
              <button className="close-modal-button" onClick={closeProfileModal}>Close</button>
            </div>

            <div className="profile-info">
              <p><strong>Name:</strong> {user.name}</p>
              <p><strong>Email:</strong> {user.email}</p>
              <p><strong>Role:</strong> {user.role}</p>
            </div>

            <div className="password-change">
              <label>New Password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password"
              />
              <label>Confirm Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
              />
              <button className="primary-button" onClick={handlePasswordChange}>Change Password</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default Sidebar;