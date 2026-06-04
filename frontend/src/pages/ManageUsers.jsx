/**
 * ManageUsers page component.
 * Rendered when the user navigates to /manageusers or related route.
 */

import { useState, useEffect } from "react";
import { MdVisibility } from "react-icons/md";
import { IoSearchOutline } from "react-icons/io5";
import { CiCirclePlus } from "react-icons/ci";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "../components/layout/DashboardLayout";
import API_URL from "../config/api";
import { authToken, getCurrentRole, getUser, setUser } from "../utils/auth";
import "./ManageUsers.css";

const DEPARTMENTS = [
  "Digital Marketing",
  "Website Development",
  "Graphic Design",
  "Data Entry",
  "Human Resource",
  "__custom__",
];

const DESIGNATIONS = [
  "SEO Link Builder Intern",
  "SEO Intern",
  "SEO Associate",
  "WordPress Developer Intern",
  "Web Developer Intern",
  "Graphic Design Intern",
  "Data Entry Operator",
  "SQA Intern",
  "HR",
  "__custom__",
];

function ManageUsers() {
  const [users, setUsers] = useState([]);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newUser, setNewUser] = useState({
    fullName: "",
    email: "",
    role: "member",
    contact_no: "",
    address: "",
    department: "",
    departmentCustom: "",
    designation: "",
    designationCustom: "",
    employee_code: "",
  });
  const [loading, setLoading] = useState(false);
  const [savingUserId, setSavingUserId] = useState(null);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("");
  const [addErrors, setAddErrors] = useState({});

  const [currentUserId, setCurrentUserId] = useState(() => {
    const user = getUser();
    return user?.id ? Number(user.id) : null;
  });
  const [currentUserRole, setCurrentUserRole] = useState(
    getCurrentRole() || ""
  );

  const ResignIcon = ({ className = "" }) => (
    <svg
      className={className}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
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

  const showMessage = (text, type = "success") => {
    setMessage(text);
    setMessageType(type);
    window.scrollTo({ top: 0, behavior: "smooth" });
    setTimeout(() => {
      setMessage("");
      setMessageType("");
    }, 4000);
  };

  const authHeaders = () => {
    const token = authToken();
    return {
      "Content-Type": "application/json",
      Authorization: token ? `Bearer ${token}` : "",
    };
  };

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/users`, {
        headers: { Accept: "application/json", ...authHeaders() },
      });
      if (!res.ok) throw new Error("Unable to load users");
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
      const token = authToken();
      if (!token) return;
      const res = await fetch(`${API_URL}/user`, {
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data && data.id) {
        setCurrentUserId(data.id);
        setCurrentUserRole(data.role || "");
        const role = getCurrentRole();
        setUser(role, { id: data.id, name: data.name, email: data.email, role: data.role });
      }
    } catch {
      // ignore
    }
  };

  const navigate = useNavigate();

  useEffect(() => {
    const role = getCurrentRole();
    const token = authToken();
    if (!token || (role !== "admin" && role !== "manager")) {
      navigate("/");
      return;
    }
    const user = getUser();
    setCurrentUserId(user?.id ? Number(user.id) : null);
    setCurrentUserRole(role);
    if (!user?.id) {
      fetchCurrentUser();
    }
    fetchUsers();
  }, [navigate]);

  const openModal = () => setIsAddModalOpen(true);

  const closeModal = () => {
    setIsAddModalOpen(false);
    setAddErrors({});
    setNewUser({
      fullName: "",
      email: "",
      role: "member",
      contact_no: "",
      address: "",
      department: "",
      departmentCustom: "",
      designation: "",
      designationCustom: "",
      employee_code: "",
    });
  };

  const validateAddForm = () => {
    const errors = {};
    if (!newUser.fullName.trim()) errors.fullName = "Full Name is required.";
    if (!newUser.email.trim()) {
      errors.email = "Email Address is required.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newUser.email.trim())) {
      errors.email = "Please enter a valid email address.";
    } else if (users.some((u) => u.email.toLowerCase() === newUser.email.trim().toLowerCase())) {
      errors.email = "This email is already registered.";
    }
    if (!newUser.contact_no.trim()) errors.contact_no = "Contact Number is required.";
    if (!newUser.address.trim()) errors.address = "Address is required.";
    if (!newUser.department) {
      errors.department = "Department is required.";
    } else if (newUser.department === "__custom__" && !newUser.departmentCustom.trim()) {
      errors.departmentCustom = "Custom Department is required.";
    }
    if (!newUser.designation) {
      errors.designation = "Designation is required.";
    } else if (newUser.designation === "__custom__" && !newUser.designationCustom.trim()) {
      errors.designationCustom = "Custom Designation is required.";
    }
    if (!newUser.employee_code.trim()) errors.employee_code = "Employee Code is required.";
    return errors;
  };

  const handleChange = (event) => {
    const { name, value } = event.target;
    setNewUser((prev) => ({ ...prev, [name]: value }));
    if (addErrors[name]) {
      setAddErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  };

  const handleUpdateUser = async (user) => {
    if (!user.active) {
      showMessage("Resigned users cannot be updated.", "error");
      return;
    }
    setSavingUserId(user.id);
    try {
      const res = await fetch(`${API_URL}/users/${user.id}`, {
        method: "PUT",
        headers: { Accept: "application/json", ...authHeaders() },
        body: JSON.stringify({ role: user.role }),
      });
      if (!res.ok) throw new Error("Unable to update user");
      const data = await res.json();
      setUsers((prev) =>
        prev.map((item) =>
          item.id === user.id
            ? { ...item, role: data.user.role, active: data.user.active }
            : item
        )
      );
      showMessage("User role updated successfully.");
    } catch (error) {
      console.error(error);
      showMessage("Failed to update user role.", "error");
    } finally {
      setSavingUserId(null);
    }
  };

  const handleResignUser = async (userId) => {
    const userToResign = users.find(u => u.id === userId);
    const userName = userToResign ? userToResign.name : "this user";

    const confirmation = window.confirm(
      `Are you sure you want to resign ${userName}? They will no longer be able to access the system.`
    );
    if (!confirmation) return;

    try {
      const res = await fetch(`${API_URL}/users/${userId}/resign`, {
        method: "PUT",
        headers: { Accept: "application/json", ...authHeaders() },
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Unable to resign user");
      }

      setUsers((prev) =>
        prev.map((item) =>
          item.id === userId ? { ...item, active: false } : item
        )
      );
      showMessage(data.message || "User resigned successfully.");
    } catch (error) {
      console.error(error);
      showMessage(error.message || "Failed to resign user.", "error");
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
      isActive && !isSelf && !(currentUserRole === "manager" && isTargetAdmin);

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
            {user.role === "team_lead"
              ? "Team Lead"
              : user.role.charAt(0).toUpperCase() + user.role.slice(1)}
          </span>
        </td>
        <td>
          <StatusBadge active={isActive} />
        </td>
        <td>
          <div className="action-buttons">
            <button
              className="btn-view"
              onClick={() => navigate(`/user-profile/${user.id}`)}
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

  const handleSubmit = async (event) => {
    event.preventDefault();

    const errors = validateAddForm();
    setAddErrors(errors);
    if (Object.keys(errors).length > 0) return;

    const finalDepartment =
      newUser.department === "__custom__" ? newUser.departmentCustom : newUser.department;
    const finalDesignation =
      newUser.designation === "__custom__" ? newUser.designationCustom : newUser.designation;

    try {
      const res = await fetch(`${API_URL}/users`, {
        method: "POST",
        headers: { Accept: "application/json", ...authHeaders() },
        body: JSON.stringify({
          name: newUser.fullName,
          email: newUser.email,
          role: newUser.role,
          contact_no: newUser.contact_no || null,
          address: newUser.address || null,
          department: finalDepartment || null,
          designation: finalDesignation || null,
          employee_code: newUser.employee_code || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Unable to create user");

      setUsers((prev) => [data.user, ...prev]);
      closeModal();
      showMessage(data.message || "User created successfully.");
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
            <option value="admin">Admin</option>
            <option value="manager">Manager</option>
            <option value="team_lead">Team-Lead</option>
            <option value="member">Member</option>
          </select>
          <select className="bar-status">
            <option value="">Select Status</option>
            <option value="active">Active</option>
            <option value="resigned">Resigned</option>
          </select>
          <select className="bar-sort">
            <option value="">Sort By</option>
            <option value="asc">Ascending</option>
            <option value="desc">Descending</option>
          </select>
        </div>

        {message && <div className={`message ${messageType}`}>{message}</div>}

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

        {/* ===================== ADD USER MODAL ===================== */}
        {isAddModalOpen && (
          <div className="user-modal-overlay" onClick={closeModal}>
            <div
              className="user-modal-content"
              style={{ maxWidth: "1100px", width: "100%" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="user-modal-header">
                <div>
                  <h2>Add New User</h2>
                  <p className="modal-subtitle">
                    Register a new user and automatically send login credentials via email.
                  </p>
                </div>
                <button className="user-modal-close" onClick={closeModal}>
                  &#10005;
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
                      className={addErrors.fullName ? "field-error" : ""}
                    />
                    {addErrors.fullName && <span className="field-error-text">{addErrors.fullName}</span>}
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
                      className={addErrors.email ? "field-error" : ""}
                    />
                    {addErrors.email && <span className="field-error-text">{addErrors.email}</span>}
                  </div>
                  <div className="form-row">
                    <label htmlFor="contact_no">Contact No</label>
                    <input
                      type="text"
                      id="contact_no"
                      name="contact_no"
                      value={newUser.contact_no}
                      onChange={handleChange}
                      placeholder="Enter contact number"
                      className={addErrors.contact_no ? "field-error" : ""}
                    />
                    {addErrors.contact_no && <span className="field-error-text">{addErrors.contact_no}</span>}
                  </div>
                  <div className="form-row">
                    <label htmlFor="address">Address</label>
                    <input
                      type="text"
                      id="address"
                      name="address"
                      value={newUser.address}
                      onChange={handleChange}
                      placeholder="Enter address"
                      className={addErrors.address ? "field-error" : ""}
                    />
                    {addErrors.address && <span className="field-error-text">{addErrors.address}</span>}
                  </div>
                  <div className="form-row">
                    <label htmlFor="department">Department</label>
                    <select
                      id="department"
                      name="department"
                      value={newUser.department}
                      onChange={handleChange}
                      className={addErrors.department ? "field-error" : ""}
                    >
                      <option value="">Select Department</option>
                      {DEPARTMENTS.map((d) =>
                        d === "__custom__" ? (
                          <option key="custom" value="__custom__">
                            Custom / Type Here
                          </option>
                        ) : (
                          <option key={d} value={d}>
                            {d}
                          </option>
                        )
                      )}
                    </select>
                    {addErrors.department && <span className="field-error-text">{addErrors.department}</span>}
                  </div>
                  {newUser.department === "__custom__" && (
                    <div className="form-row">
                      <label htmlFor="departmentCustom">Custom Department</label>
                      <input
                        type="text"
                        id="departmentCustom"
                        name="departmentCustom"
                        value={newUser.departmentCustom}
                        onChange={handleChange}
                        placeholder="Enter custom department"
                        className={addErrors.departmentCustom ? "field-error" : ""}
                      />
                      {addErrors.departmentCustom && <span className="field-error-text">{addErrors.departmentCustom}</span>}
                    </div>
                  )}
                  <div className="form-row">
                    <label htmlFor="designation">Designation</label>
                    <select
                      id="designation"
                      name="designation"
                      value={newUser.designation}
                      onChange={handleChange}
                      className={addErrors.designation ? "field-error" : ""}
                    >
                      <option value="">Select Designation</option>
                      {DESIGNATIONS.map((d) =>
                        d === "__custom__" ? (
                          <option key="custom" value="__custom__">
                            Custom / Type Here
                          </option>
                        ) : (
                          <option key={d} value={d}>
                            {d}
                          </option>
                        )
                      )}
                    </select>
                    {addErrors.designation && <span className="field-error-text">{addErrors.designation}</span>}
                  </div>
                  {newUser.designation === "__custom__" && (
                    <div className="form-row">
                      <label htmlFor="designationCustom">Custom Designation</label>
                      <input
                        type="text"
                        id="designationCustom"
                        name="designationCustom"
                        value={newUser.designationCustom}
                        onChange={handleChange}
                        placeholder="Enter custom designation"
                        className={addErrors.designationCustom ? "field-error" : ""}
                      />
                      {addErrors.designationCustom && <span className="field-error-text">{addErrors.designationCustom}</span>}
                    </div>
                  )}
                  <div className="form-row">
                    <label htmlFor="employee_code">Employee Code</label>
                    <input
                      type="text"
                      id="employee_code"
                      name="employee_code"
                      value={newUser.employee_code}
                      onChange={handleChange}
                      placeholder="Enter employee code"
                      className={addErrors.employee_code ? "field-error" : ""}
                    />
                    {addErrors.employee_code && <span className="field-error-text">{addErrors.employee_code}</span>}
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
