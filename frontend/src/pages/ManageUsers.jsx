/**
 * ManageUsers page component.
 * Rendered when the user navigates to /manageusers or related route.
 */

import { useState, useEffect } from "react";
import { MdAdd, MdCheckCircle, MdDelete, MdEdit } from "react-icons/md";
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
      setUsers(data.users ?? data);
    } catch (error) {
      console.error(error);
      showMessage("Unable to load users. Please login again if required.", "error");
    } finally {
      setLoading(false);
    }
  };

  const navigate = useNavigate();

  useEffect(() => {
    const role = localStorage.getItem("role");
    const token = localStorage.getItem("token");

    if (!token || role !== "admin") {
      navigate("/");
      return;
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
   * Perform the handle delete user.
   */

  /**
   * Handle handle delete user.
   */
  const handleDeleteUser = async (userId) => {
    if (!window.confirm("Delete this user?")) {
      return;
    }

    try {
      const res = await fetch(`http://127.0.0.1:8000/api/users/${userId}`, {
        method: "DELETE",
        headers: {
          Accept: "application/json",
          ...authHeaders(),
        },
      });

      if (!res.ok) {
        throw new Error("Unable to delete user");
      }

      setUsers((prev) => prev.filter((user) => user.id !== userId));
    } catch (error) {
      console.error(error);
      showMessage("Failed to delete user.", "error");
    }
  };

  /**
   * Perform the handle update user.
   */

  /**
   * Handle handle update user.
   */
  const handleUpdateUser = async (user) => {
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
      setUsers((prev) => prev.map((item) => (item.id === user.id ? { ...item, role: data.user.role } : item)));
      showMessage("User role updated successfully.");
    } catch (error) {
      console.error(error);
      showMessage("Failed to update user role.", "error");
    } finally {
      setSavingUserId(null);
    }
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
            <option value="">Admin</option>
            <option value="">Manager</option>
            <option value="">User</option>
          </select>
          <select className="bar-status">
            <option value="">Active</option>
            <option value="">Resigned</option>
          </select>
          <select className="bar-sort">
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
                users.map((user) => (
                  <tr key={user.id}>
                    {/* User Column */}
                    <td style={{ textAlign: "left" }}>
                      <div className="user-info">
                        <span className="user-name">{user.name}</span>
                        <span className="user-email">{user.email}</span>
                      </div>
                    </td>

                    {/* Role Column */}
                    <td>
                      <select
                        className="role-select"
                        value={user.role}
                        onChange={(e) =>
                          handleRoleChange(user.id, e.target.value)
                        }
                      >
                        <option value="admin">Admin</option>
                        <option value="manager">Manager</option>
                        <option value="team_lead">Team Lead</option>
                        <option value="member">Member</option>
                      </select>
                    </td>

                    {/* Status Column */}
                    <td>Active</td>

                    {/* Actions Column */}
                    <td>
                      <div className="action-buttons">
                        <button
                          className="btn-update"
                          onClick={() => handleUpdateUser(user)}
                          disabled={savingUserId === user.id}
                          aria-label="Update user role"
                        >
                          <MdEdit size={24} />
                        </button>

                        <button
                          className="btn-delete"
                          onClick={() => handleDeleteUser(user.id)}
                          aria-label="Delete user"
                        >
                          <MdDelete size={24} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
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
            <div className="user-modal-content">
              <div className="user-modal-header">
                <div>
                  <h2>Add New User</h2>
                  <p className="modal-subtitle">
                    Register a new user in the backend and assign their role.
                  </p>
                </div>
                <button onClick={closeModal} className="close-modal-button">
                  Close
                </button>
              </div>

              <form className="user-form" onSubmit={handleSubmit}>
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

                <div className="user-form-actions">
                  <button type="button" className="secondary-button" onClick={closeModal}>
                    Cancel
                  </button>
                  <button type="submit" className="primary-button">
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
