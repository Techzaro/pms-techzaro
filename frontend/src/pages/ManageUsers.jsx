/**
 * ManageUsers page component.
 * Rendered when the user navigates to /manageusers or related route.
 */

import { useState, useEffect } from "react";
import { useCallback } from "react";
import { MdEdit } from "react-icons/md";
import { IoSearchOutline } from "react-icons/io5";
import { CiCirclePlus } from "react-icons/ci";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "../components/layout/DashboardLayout";
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

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("modal-state", { detail: { open: isAddModalOpen } }));
  }, [isAddModalOpen]);
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

  const ResignedBadge = () => (
    <span className="resigned-badge" aria-hidden>RESIGNED</span>
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
      const res = await fetch("http://127.0.0.1:8000/api/users", {
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

      const res = await fetch("http://127.0.0.1:8000/api/user", {
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
      const res = await fetch(`http://127.0.0.1:8000/api/users/${user.id}`, {
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
      const res = await fetch(`http://127.0.0.1:8000/api/users/${userId}`, {
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
            <span className="user-name">{user.name}</span>
            <span className="user-email">{user.email}</span>
          </div>
        </td>

        <td>
          <select
            className="role-select"
            value={user.role}
            onChange={(e) => handleRoleChange(user.id, e.target.value)}
            disabled={!canModifyUser}
          >
            <option value="admin">Admin</option>
            <option value="manager">Manager</option>
            <option value="team_lead">Team Lead</option>
            <option value="member">Member</option>
          </select>
        </td>

        <td>{!isActive ? <ResignedBadge /> : "Active"}</td>

        <td>
          <div className="action-buttons">
            <button
              className="btn-update"
              onClick={() => handleUpdateUser(user)}
              disabled={savingUserId === user.id || !canModifyUser}
              aria-label="Update user role"
            >
              <MdEdit size={24} />
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
      const res = await fetch("http://127.0.0.1:8000/api/users", {
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
              </div>

              <form className="user-form" onSubmit={handleSubmit}>

                {/* MAIN TWO COLUMNS */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "24px",
                  }}
                >

                  {/* LEFT SIDE */}
                  <div>
                    <div className="user-form-grid">
                      <div className="form-row">
                        <label htmlFor="fullName">Full Name</label>
                        <input
                          type="text"
                          id="fullName"
                          name="fullName"
                          value={newUser.fullName}
                          onChange={handleChange}
                          placeholder="Enter full name"
                        />
                      </div>

                      <div className="form-row">
                        <label htmlFor="email">Email Address</label>
                        <input
                          type="email"
                          id="email"
                          name="email"
                          value={newUser.email}
                          onChange={handleChange}
                          placeholder="Enter email address"
                        />
                      </div>
                      {/* CONTACT */}
                      <div className="form-row">
                        <label>Contact No</label>

                        <input
                          type="text"
                          placeholder="Enter contact number"
                        />
                      </div>

                      {/* ADDRESS */}
                      <div className="form-row">
                        <label>Address</label>

                        <input
                          type="text"
                          placeholder="Enter address"
                        />
                      </div>
                    </div>

                    <div className="user-form-grid">
                      <div className="form-row">
                        <label htmlFor="password">Password</label>
                        <input
                          type="password"
                          id="password"
                          name="password"
                          value={newUser.password}
                          onChange={handleChange}
                          placeholder="Create a password"
                        />
                      </div>

                    </div>
                  </div>

                  {/* RIGHT SIDE */}
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "18px",
                    }}
                  >
                    {/* DESTINATION */}
                    <div className="form-row">
                      <label>Destination Name</label>

                      <select>
                        <option>Select Destination</option>
                        <option>Lahore</option>
                        <option>Karachi</option>
                        <option>Islamabad</option>
                      </select>
                    </div>

                    {/* DEPARTMENT */}
                    <div className="form-row">
                      <label>Department Name</label>

                      <select>
                        <option>Select Department</option>
                        <option>Development</option>
                        <option>Design</option>
                        <option>Marketing</option>
                      </select>
                    </div>

                    {/* TEAM LEAD */}
                    <div className="form-row">
                      <label>Team Lead Name</label>

                      <select>
                        <option>Select Team Lead</option>
                        <option>Ahmad</option>
                        <option>Ali</option>
                        <option>Sarah</option>
                      </select>
                    </div>
                    <div className="form-row">
                      <label htmlFor="role">Role</label>

                      <select
                        id="role"
                        name="role"
                        value={newUser.role}
                        onChange={handleChange}
                      >
                        <option value="admin">Admin</option>
                        <option value="manager">Manager</option>
                        <option value="team_lead">
                          Team Lead
                        </option>
                        <option value="member">Member</option>
                      </select>
                    </div>

                    {/* EMPLOYEE CODE */}
                    <div className="form-row">
                      <label>Employee Code</label>

                      <input
                        type="text"
                        placeholder="Enter employee code"
                      />
                    </div>
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
      </div>
    </DashboardLayout>
  );
}

export default ManageUsers;