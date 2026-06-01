/**
 * ManageUsers page component.
 * Rendered when the user navigates to /manageusers or related route.
 */

import { useState, useEffect } from "react";
import { useCallback } from "react";
import { MdVisibility } from "react-icons/md";
import { IoSearchOutline } from "react-icons/io5";
import { CiCirclePlus } from "react-icons/ci";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "../components/layout/DashboardLayout";
import API_URL from "../config/api";
import "./ManageUsers.css";

/**
 * Perform the manage users.
 */

/**
 * Admin page for managing application users.
 */
function ManageUsers() {
  const [users, setUsers] = useState([]);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newUser, setNewUser] = useState({ fullName: "", email: "", password: "", role: "member" });
  const [loading, setLoading] = useState(false);
  const [savingUserId, setSavingUserId] = useState(null);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("");
  const [profileUser, setProfileUser] = useState(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editUser, setEditUser] = useState({ name: "", email: "", role: "member", contact_no: "", address: "", department: "", designation: "", employee_code: "" });

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("modal-state", { detail: { open: isAddModalOpen || isEditModalOpen } }));
  }, [isAddModalOpen, isEditModalOpen]);
  const [currentUserId, setCurrentUserId] = useState(() => {
    const savedId = localStorage.getItem("userId");
    return savedId ? Number(savedId) : null;
  });
  const [currentUserRole, setCurrentUserRole] = useState(localStorage.getItem("role") || "");

  // Inline icons/badges used by the user table
  const ResignIcon = ({ className = "" }) => (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <rect x="2" y="5" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3 7.5h18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <rect x="6" y="9" width="12" height="6" rx="1" fill="currentColor" />
    </svg>
  );

  const StatusBadge = ({ active }) => (
    <span className={`status-badge ${active ? "status-active" : "status-resigned"}`}>
      {active ? "Active" : "Resigned"}
    </span>
  );

  /**
   * Display a temporary message banner to the user.
   */

  /**
   * Display a temporary status message to the user.
   */
  const showMessage = (text, type = "success") => {
    setMessage(text);
    setMessageType(type);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setTimeout(() => {
      setMessage("");
      setMessageType("");
    }, 4000);
  };

  /**
   * Perform the auth headers.
   */

  /**
   * Handle auth headers.
   */
  const authHeaders = () => {
    const token = localStorage.getItem("token");
    return {
      "Content-Type": "application/json",
      Authorization: token ? `Bearer ${token}` : "",
    };
  };

  /**
   * Perform the fetch users.
   */

  /**
   * Fetch the list of users from the backend for assignment.
   */
  const fetchUsers = async () => {
    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/users`, {
        headers: {
          Accept: "application/json",
          ...authHeaders(),
        },
      });

      if (!res.ok) {
        throw new Error("Unable to load users");
      }

      const data = await res.json();
      const usersData = (data.users ?? data).map((user) => ({
        ...user,
        active: user.active !== false,
      }));
      setUsers(usersData);
    } catch (error) {
      console.error(error);
      showMessage("Unable to load users. Please login again if required.", "error");
    } finally {
      setLoading(false);
    }
  };

  const fetchCurrentUser = async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) return;

      const res = await fetch(`${API_URL}/user`, {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) return;

      const data = await res.json();
      if (data && data.id) {
        setCurrentUserId(data.id);
        setCurrentUserRole(data.role || "");
        localStorage.setItem("userId", data.id);
        localStorage.setItem("role", data.role);
      }
    } catch {
      // ignore errors here; user role is already from localStorage
    }
  };

  const navigate = useNavigate();

  useEffect(() => {
    const role = localStorage.getItem("role");
    const token = localStorage.getItem("token");

    // Allow both admins and managers to access this page.
    if (!token || (role !== "admin" && role !== "manager")) {
      navigate("/");
      return;
    }

    setCurrentUserId(localStorage.getItem("userId") ? Number(localStorage.getItem("userId")) : null);
    setCurrentUserRole(role);

    if (!localStorage.getItem("userId")) {
      fetchCurrentUser();
    }

    fetchUsers();
  }, [navigate]);

  /**
   * Perform the open modal.
   */

  /**
   * Handle open modal.
   */
  const openModal = () => setIsAddModalOpen(true);
  /**
   * Perform the close modal.
   */

  /**
   * Handle close modal.
   */
  const closeModal = () => setIsAddModalOpen(false);

  /**
   * Perform the handle change.
   */

  /**
   * Handle handle change.
   */
  const handleChange = (event) => {
    const { name, value } = event.target;
    setNewUser((prev) => ({ ...prev, [name]: value }));
  };

  /**
   * Perform the handle role change.
   */

  /**
   * Handle handle role change.
   */
  const handleRoleChange = (userId, newRole) => {
    setUsers((prev) =>
      prev.map((user) => (user.id === userId ? { ...user, role: newRole } : user))
    );
  };

  /**
   * Perform the handle update user.
   */

  /**
   * Handle handle update user.
   */
  const handleUpdateUser = async (user) => {
    if (!user.active) {
      showMessage("Resigned users cannot be updated.", "error");
      return;
    }

    setSavingUserId(user.id);

    try {
      const res = await fetch(`${API_URL}/users/${user.id}`, {
        method: "PUT",
        headers: {
          Accept: "application/json",
          ...authHeaders(),
        },
        body: JSON.stringify({ role: user.role }),
      });

      if (!res.ok) {
        throw new Error("Unable to update user");
      }

      const data = await res.json();
      setUsers((prev) => prev.map((item) => (item.id === user.id ? { ...item, role: data.user.role, active: data.user.active } : item)));
      showMessage("User role updated successfully.");
    } catch (error) {
      console.error(error);
      showMessage("Failed to update user role.", "error");
    } finally {
      setSavingUserId(null);
    }
  };

  const handleResignUser = async (userId) => {
    const confirmation = window.confirm("Resign this user? They will no longer be able to access the system.");
    if (!confirmation) {
      return;
    }

    try {
      const res = await fetch(`${API_URL}/users/${userId}`, {
        method: "PUT",
        headers: {
          Accept: "application/json",
          ...authHeaders(),
        },
        body: JSON.stringify({ active: false }),
      });

      if (!res.ok) {
        throw new Error("Unable to resign user");
      }

      const data = await res.json();
      setUsers((prev) => prev.map((item) => (item.id === userId ? { ...item, active: data.user.active } : item)));
      showMessage("User resigned successfully.");
    } catch (error) {
      console.error(error);
      showMessage("Failed to resign user.", "error");
    }
  };

  const getInitials = (name) => {
    return name
      .split(" ")
      .filter(Boolean)
      .map((w) => w[0].toUpperCase())
      .join("");
  };

  const renderUserRow = (user) => {
    const isSelf = currentUserId === user.id;
    const isTargetAdmin = user.role === "admin";
    const isActive = user.active !== false;
    const canModifyUser =
      isActive &&
      !isSelf &&
      !(currentUserRole === "manager" && isTargetAdmin);

    return (
      <tr key={user.id} className={!isActive ? "resigned-row" : ""}>
        <td style={{ textAlign: "left" }}>
          <div className="user-info">
            <span className="user-avatar">{getInitials(user.name)}</span>
            <div className="user-details">
              <span className="user-name">{user.name}</span>
              <span className="user-email">{user.email}</span>
            </div>
          </div>
        </td>

        <td>
          <span className={`role-badge role-${user.role}`}>
            {user.role === "team_lead" ? "Team Lead" : user.role.charAt(0).toUpperCase() + user.role.slice(1)}
          </span>
        </td>

        <td><StatusBadge active={isActive} /></td>

        <td>
          <div className="action-buttons">
            <button
              className="btn-view"
              onClick={() => setProfileUser(user)}
              aria-label="View user profile"
            >
              <MdVisibility size={24} />
            </button>

            <button
              className="btn-resign"
              onClick={() => handleResignUser(user.id)}
              disabled={!canModifyUser}
              aria-label="Resign user"
            >
              <ResignIcon className="resign-icon" />
            </button>
          </div>
        </td>
      </tr>
    );
  };

  /**
   * Perform the handle submit.
   */

  /**
   * Handle handle submit.
   */
  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!newUser.fullName.trim()) {
      showMessage("Please enter the full name.", "error");
      return;
    }

    if (!newUser.email.trim()) {
      showMessage("Please enter the email.", "error");
      return;
    }

    if (!newUser.password.trim()) {
      showMessage("Please enter the password.", "error");
      return;
    }



    try {
      const res = await fetch(`${API_URL}/users`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          ...authHeaders(),
        },
        body: JSON.stringify({
          name: newUser.fullName,
          email: newUser.email,
          password: newUser.password,
          role: newUser.role,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Unable to create user");
      }

      setUsers((prev) => [data.user, ...prev]);
      setNewUser({ fullName: "", email: "", password: "", role: "member" });
      closeModal();
      showMessage("User created successfully.");
    } catch (error) {
      console.error(error);
      showMessage(error.message || "User creation failed.", "error");
    }
  };

  const openEditModal = () => {
    setEditUser({
      name: profileUser.name || "",
      email: profileUser.email || "",
      role: profileUser.role || "member",
      contact_no: profileUser.contact_no || "",
      address: profileUser.address || "",
      department: profileUser.department || "",
      designation: profileUser.designation || "",
      employee_code: profileUser.employee_code || "",
    });
    setIsEditModalOpen(true);
  };

  const handleEditChange = (e) => {
    const { name, value } = e.target;
    setEditUser((prev) => ({ ...prev, [name]: value }));
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();

    if (!editUser.name.trim()) {
      showMessage("Please enter the full name.", "error");
      return;
    }
    if (!editUser.email.trim()) {
      showMessage("Please enter the email.", "error");
      return;
    }

    setSavingUserId(profileUser.id);

    try {
      const res = await fetch(`${API_URL}/users/${profileUser.id}`, {
        method: "PUT",
        headers: {
          Accept: "application/json",
          ...authHeaders(),
        },
        body: JSON.stringify({
          name: editUser.name,
          email: editUser.email,
          role: editUser.role,
          contact_no: editUser.contact_no || null,
          address: editUser.address || null,
          department: editUser.department || null,
          designation: editUser.designation || null,
          employee_code: editUser.employee_code || null,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Unable to update user");
      }

      setUsers((prev) =>
        prev.map((u) => (u.id === profileUser.id ? { ...u, ...editUser } : u))
      );
      setProfileUser((prev) => ({ ...prev, ...editUser }));
      setIsEditModalOpen(false);
      showMessage("User updated successfully.");
    } catch (error) {
      console.error(error);
      showMessage(error.message || "User update failed.", "error");
    } finally {
      setSavingUserId(null);
    }
  };

  return (
    <DashboardLayout>
      <div className="manage-users-page">
        <div className="manage-users-header">
          <div>
            <h1>User Management</h1>
            <p>Manage users, roles and access permissions.</p>
          </div>
          <button className="primary-button add-user-button" onClick={openModal}>
            <CiCirclePlus fontSize={"21px"} /> Add User
          </button>
        </div>

        <div className="bar">
          <div className="search-bar">
            <IoSearchOutline fontSize={"25px"} />
            <input type="text" placeholder="Search users by name or email....." />
          </div>
          <select className="bar-role">
            <option value="">Select Role</option>
            <option value="">Admin</option>
            <option value="">Manager</option>
            <option value="">Team-Lead</option>
            <option value="">Member</option>
          </select>
          <select className="bar-status">
            <option value="">Select Status</option>
            <option value="">Active</option>
            <option value="">Resigned</option>
          </select>
          <select className="bar-sort">
            <option value="">Sort By</option>
            <option value="">Ascending</option>
            <option value="">Dscending</option>
          </select>
        </div>

        {message && (
          <div className={`message ${messageType}`}>
            {message}
          </div>
        )}

        <div className="manage-users-table-card">
          <div className="table-card-header">
            <h2>Existing Users</h2>
          </div>

          <table className="manage-user-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="4" className="loading-row">
                    Loading users...
                  </td>
                </tr>
              ) : users.length ? (
                users.map(renderUserRow)
              ) : (
                <tr>
                  <td colSpan="4" className="empty-row">
                    No users found yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {isAddModalOpen && (
          <div className="user-modal-overlay">
            <div
              className="user-modal-content"
              style={{
                maxWidth: "1100px",
                width: "100%",
              }}
            >
              <div className="user-modal-header">
                <div>
                  <h2>Add New User</h2>
                  <p className="modal-subtitle">
                    Register a new user in the backend and assign their role.
                  </p>
                </div>
                <button className="user-modal-close" onClick={closeModal}>✕</button>
              </div>

              <form className="user-form" onSubmit={handleSubmit}>

                <div className="user-form-grid">
                  <div className="form-row">
                    <label htmlFor="fullName">Full Name</label>
                    <input type="text" id="fullName" name="fullName" value={newUser.fullName} onChange={handleChange} placeholder="Enter full name" />
                  </div>
                  <div className="form-row">
                    <label htmlFor="email">Email Address</label>
                    <input type="email" id="email" name="email" value={newUser.email} onChange={handleChange} placeholder="Enter email address" />
                  </div>
                  <div className="form-row">
                    <label>Contact No</label>
                    <input type="text" placeholder="Enter contact number" />
                  </div>
                  <div className="form-row">
                    <label>Address</label>
                    <input type="text" placeholder="Enter address" />
                  </div>
                  <div className="form-row">
                    <label>Designation</label>
                    <input type="text" placeholder="Enter designation" />
                  </div>
                  <div className="form-row">
                    <label>Department</label>
                    <input type="text" placeholder="Enter department" />
                  </div>
                  <div className="form-row">
                    <label>Employee Code</label>
                    <input type="text" placeholder="Enter employee code" />
                  </div>
                  <div className="form-row">
                    <label htmlFor="password">Password</label>
                    <input type="password" id="password" name="password" value={newUser.password} onChange={handleChange} placeholder="Create a password" />
                  </div>
                  <div className="form-row">
                    <label htmlFor="role">Role</label>
                    <select id="role" name="role" value={newUser.role} onChange={handleChange}>
                      <option value="admin">Admin</option>
                      <option value="manager">Manager</option>
                      <option value="team_lead">Team Lead</option>
                      <option value="member">Member</option>
                    </select>
                  </div>
                </div>

                {/* BUTTONS */}
                <div className="user-form-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={closeModal}
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    className="primary-button"
                  >
                    Create User
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

      {profileUser && (
        <div className="profile-modal-overlay">
          <div className="profile-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="profile-modal-header">
              <div className="profile-profile-card">
                <div className="profile-modal-avatar">{getInitials(profileUser.name)}</div>
                <div className="profile-profile-info">
                  <h2>{profileUser.name}</h2>
                  <p className="profile-modal-subtitle">{profileUser.email}</p>
                </div>
              </div>
              <button className="profile-modal-close" onClick={() => setProfileUser(null)}>✕</button>
            </div>

            <div className="profile-modal-body">
              <div className="profile-details-grid">

                <div className="profile-card-block">
                  <span className="profile-label">Full Name</span>
                  <span className="profile-value">{profileUser.name}</span>
                </div>

                <div className="profile-card-block">
                  <span className="profile-label">Email Address</span>
                  <span className="profile-value">{profileUser.email}</span>
                </div>

                <div className="profile-card-block">
                  <span className="profile-label">Designation</span>
                  <span className="profile-value">{profileUser.designation || "Software Engineer"}</span>
                </div>

                <div className="profile-card-block">
                  <span className="profile-label">Team Role</span>
                  <span className="profile-value">
                    {profileUser.role === "team_lead" ? "Team Lead" : profileUser.role.charAt(0).toUpperCase() + profileUser.role.slice(1)}
                  </span>
                </div>

                <div className="profile-card-block">
                  <span className="profile-label">Department</span>
                  <span className="profile-value">{profileUser.department || "Development"}</span>
                </div>

                <div className="profile-card-block">
                  <span className="profile-label">Employee Code</span>
                  <span className="profile-value">{profileUser.employee_code || "EMP-2026-0042"}</span>
                </div>

                <div className="profile-card-block">
                  <span className="profile-label">Contact Number</span>
                  <span className="profile-value">{profileUser.contact_no || "+92 300 1234567"}</span>
                </div>

                <div className="profile-card-block">
                  <span className="profile-label">Status</span>
                  <span className="profile-value">{profileUser.active !== false ? "Active" : "Resigned"}</span>
                </div>

                <div className="profile-card-block profile-card-block-wide">
                  <span className="profile-label">Address</span>
                  <span className="profile-value">{profileUser.address || "123 Main Street, Lahore, Pakistan"}</span>
                </div>

              </div>
            </div>

            <div className="profile-modal-footer">
              <button className="profile-edit-btn" onClick={openEditModal}>Edit</button>
            </div>
          </div>
        </div>
      )}

      {isEditModalOpen && profileUser && (
        <div className="user-modal-overlay">
          <div
            className="user-modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: "1100px", width: "100%" }}
          >
            <div className="user-modal-header">
              <div>
                <h2>Edit User</h2>
                <p className="modal-subtitle">Update user details.</p>
              </div>
              <button className="user-modal-close" onClick={() => setIsEditModalOpen(false)}>✕</button>
            </div>

            <form className="user-form" onSubmit={handleEditSubmit}>
              <div className="user-form-grid">
                <div className="form-row">
                  <label htmlFor="edit-name">Full Name</label>
                  <input type="text" id="edit-name" name="name" value={editUser.name} onChange={handleEditChange} placeholder="Enter full name" />
                </div>
                <div className="form-row">
                  <label htmlFor="edit-email">Email Address</label>
                  <input type="email" id="edit-email" name="email" value={editUser.email} onChange={handleEditChange} placeholder="Enter email address" />
                </div>
                <div className="form-row">
                  <label htmlFor="edit-contact">Contact No</label>
                  <input type="text" id="edit-contact" name="contact_no" value={editUser.contact_no} onChange={handleEditChange} placeholder="Enter contact number" />
                </div>
                <div className="form-row">
                  <label htmlFor="edit-address">Address</label>
                  <input type="text" id="edit-address" name="address" value={editUser.address} onChange={handleEditChange} placeholder="Enter address" />
                </div>
                <div className="form-row">
                  <label htmlFor="edit-designation">Designation</label>
                  <input type="text" id="edit-designation" name="designation" value={editUser.designation} onChange={handleEditChange} placeholder="Enter designation" />
                </div>
                <div className="form-row">
                  <label htmlFor="edit-department">Department</label>
                  <input type="text" id="edit-department" name="department" value={editUser.department} onChange={handleEditChange} placeholder="Enter department" />
                </div>
                <div className="form-row">
                  <label htmlFor="edit-employee-code">Employee Code</label>
                  <input type="text" id="edit-employee-code" name="employee_code" value={editUser.employee_code} onChange={handleEditChange} placeholder="Enter employee code" />
                </div>
                <div className="form-row">
                  <label htmlFor="edit-role">Role</label>
                  <select id="edit-role" name="role" value={editUser.role} onChange={handleEditChange}>
                    <option value="admin">Admin</option>
                    <option value="manager">Manager</option>
                    <option value="team_lead">Team Lead</option>
                    <option value="member">Member</option>
                  </select>
                </div>
              </div>

              <div className="user-form-actions">
                <button type="button" className="secondary-button" onClick={() => setIsEditModalOpen(false)}>Cancel</button>
                <button type="submit" className="primary-button" disabled={savingUserId === profileUser.id}>
                  {savingUserId === profileUser.id ? "Saving..." : "Update User"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      </div>
    </DashboardLayout>
  );
}

export default ManageUsers;