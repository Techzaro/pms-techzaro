import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { MdEdit, MdArrowBack } from "react-icons/md";
import DashboardLayout from "../components/layout/DashboardLayout";
import API_URL from "../config/api";
import "./UserProfile.css";
import "./ManageUsers.css";

function UserProfile() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const [profileData, setProfileData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editUser, setEditUser] = useState({
    name: "",
    email: "",
    role: "member",
    contact_no: "",
    address: "",
    department: "",
    designation: "",
    employee_code: "",
  });
  const [editErrors, setEditErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("");

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

  const authHeaders = () => {
    const token = localStorage.getItem("token");
    return {
      "Content-Type": "application/json",
      Authorization: token ? `Bearer ${token}` : "",
    };
  };

  const showMessage = (text, type = "success") => {
    setMessage(text);
    setMessageType(type);
    setTimeout(() => {
      setMessage("");
      setMessageType("");
    }, 4000);
  };

  const fetchProfile = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/users/${userId}/profile`, {
        headers: { Accept: "application/json", ...authHeaders() },
      });
      if (!res.ok) throw new Error("Unable to load user profile");
      const data = await res.json();
      setProfileData(data);
    } catch (err) {
      setError(err.message || "Failed to load profile");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const role = localStorage.getItem("role");
    const token = localStorage.getItem("token");
    if (!token || (role !== "admin" && role !== "manager")) {
      navigate("/");
      return;
    }
    fetchProfile();
  }, [userId, navigate]);

  const getInitials = (name) => {
    if (!name) return "?";
    return name
      .split(" ")
      .filter(Boolean)
      .map((w) => w[0].toUpperCase())
      .join("");
  };

  const openEditModal = () => {
    const u = profileData.user;
    const deptVal = u.department || "";
    const isCustomDept = !DEPARTMENTS.slice(0, -1).includes(deptVal) && deptVal !== "";
    const desgVal = u.designation || "";
    const isCustomDesg = !DESIGNATIONS.slice(0, -1).includes(desgVal) && desgVal !== "";

    setEditUser({
      name: u.name || "",
      email: u.email || "",
      role: u.role || "member",
      contact_no: u.contact_no || "",
      address: u.address || "",
      department: isCustomDept ? "__custom__" : deptVal,
      departmentCustom: isCustomDept ? deptVal : "",
      designation: isCustomDesg ? "__custom__" : desgVal,
      designationCustom: isCustomDesg ? desgVal : "",
      employee_code: u.employee_code || "",
    });
    setEditErrors({});
    setIsEditModalOpen(true);
  };

  const handleEditChange = (e) => {
    const { name, value } = e.target;
    setEditUser((prev) => ({ ...prev, [name]: value }));
    if (editErrors[name]) {
      setEditErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  };

  const validateEditForm = () => {
    const errors = {};
    if (!editUser.name.trim()) errors.name = "Full Name is required.";
    if (!editUser.email.trim()) {
      errors.email = "Email Address is required.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(editUser.email.trim())) {
      errors.email = "Please enter a valid email address.";
    }
    if (!editUser.contact_no.trim()) errors.contact_no = "Contact Number is required.";
    if (!editUser.address.trim()) errors.address = "Address is required.";
    if (!editUser.department) {
      errors.department = "Department is required.";
    } else if (editUser.department === "__custom__" && !editUser.departmentCustom.trim()) {
      errors.departmentCustom = "Custom Department is required.";
    }
    if (!editUser.designation) {
      errors.designation = "Designation is required.";
    } else if (editUser.designation === "__custom__" && !editUser.designationCustom.trim()) {
      errors.designationCustom = "Custom Designation is required.";
    }
    if (!editUser.employee_code.trim()) errors.employee_code = "Employee Code is required.";
    return errors;
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    const errors = validateEditForm();
    setEditErrors(errors);
    if (Object.keys(errors).length > 0) return;

    const finalDepartment =
      editUser.department === "__custom__" ? editUser.departmentCustom : editUser.department;
    const finalDesignation =
      editUser.designation === "__custom__" ? editUser.designationCustom : editUser.designation;

    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/users/${userId}`, {
        method: "PUT",
        headers: { Accept: "application/json", ...authHeaders() },
        body: JSON.stringify({
          name: editUser.name,
          email: editUser.email,
          role: editUser.role,
          contact_no: editUser.contact_no || null,
          address: editUser.address || null,
          department: finalDepartment || null,
          designation: finalDesignation || null,
          employee_code: editUser.employee_code || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Unable to update user");

      setProfileData((prev) => ({
        ...prev,
        user: {
          ...prev.user,
          name: editUser.name,
          email: editUser.email,
          role: editUser.role,
          contact_no: editUser.contact_no,
          address: editUser.address,
          department: finalDepartment,
          designation: finalDesignation,
          employee_code: editUser.employee_code,
        },
      }));
      setIsEditModalOpen(false);
      showMessage("User updated successfully.");
    } catch (err) {
      showMessage(err.message || "User update failed.", "error");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout hideRightSidebar={true}>
        <div className="user-profile-page">
          <div className="profile-loading">Loading profile...</div>
        </div>
      </DashboardLayout>
    );
  }

  if (error) {
    return (
      <DashboardLayout hideRightSidebar={true}>
        <div className="user-profile-page">
          <div className="profile-error">
            <p>{error}</p>
            <button className="primary-button" onClick={() => navigate("/manage-users")}>
              Go Back
            </button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const { user, account } = profileData;
  const isResigned = user.active === false;

  return (
    <DashboardLayout hideRightSidebar={true}>
<div className="flex">
      <div className="user-profile-page">
        <div className="profile-header">
          <h1>User Profile</h1>
          <p>View and manage your personal information and account settings.</p>
        </div>

        {message && <div className={`profile-message ${messageType}`}>{message}</div>}
        {isResigned && (
          <div className="resigned-banner">
            This account has been resigned and cannot be modified.
          </div>
        )}
        <div className="profile-layout">
          {/* LEFT SIDE */}
          <div className="profile-left">
            {/* User Card */}
            <div className="profile-user-card">
              <div className="profile-user-left">
                <div className="profile-avatar">
                  {getInitials(user.name)}
                </div>
                <div className="profile-user-info">
                  <h2>{user.name}</h2>
                  <span className="profile-designation">{user.designation || user.role === "team_lead" ? "Team Lead" : user.role.charAt(0).toUpperCase() + user.role.slice(1)}</span>
                </div>
              </div>
            </div>

            {/* Personal Information */}
            <div className="profile-info-card">
              <div className="info-card-header">
                <h3>Personal Information</h3>
                <button
                  className="btn-edit"
                  onClick={openEditModal}
                  disabled={isResigned}
                  title={isResigned ? "Resigned users cannot be edited" : "Edit user"}
                >
                  <MdEdit size={16} /> {isResigned ? "Resigned" : "Edit"}
                </button>
              </div>
              <div className="info-card-body">
                <div className="info-row">
                  <span className="info-label">Full Name</span>
                  <span className="info-value">{user.name || "---"}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Department</span>
                  <span className="info-value">{user.department || "---"}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Email Address</span>
                  <span className="info-value">{user.email || "---"}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Role</span>
                  <span className="info-value">
                    {user.role === "team_lead"
                      ? "Team Lead"
                      : user.role.charAt(0).toUpperCase() + user.role.slice(1)}
                  </span>
                </div>
                <div className="info-row">
                  <span className="info-label">Employee Code</span>
                  <span className="info-value">{user.employee_code || "---"}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Phone Number</span>
                  <span className="info-value">{user.contact_no || "---"}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Location</span>
                  <span className="info-value">{user.address || "---"}</span>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT SIDE - Account Status */}
          <div className="profile-right">
            <div className="account-status-card">
              <h3>Account Status</h3>
              <div className="status-list">
                <div className="status-item">
                  <span className={`status-dot ${user.active ? "dot-active" : "dot-inactive"}`}></span>
                  <span className="status-text">{user.active ? "Active" : "Resigned"}</span>
                </div>
                <div className="status-item">
                  <span className="status-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                  </span>
                  <div className="status-info">
                    <span className="status-label">Member Since</span>
                    <span className="status-value">
                      {user.created_at ? new Date(user.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "---"}
                    </span>
                  </div>
                </div>
                <div className="status-item">
                  <span className="status-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                  </span>
                  <div className="status-info">
                    <span className="status-label">Last Login</span>
                    <span className="status-value">
                      {user.last_login_at
                        ? new Date(user.last_login_at).toLocaleString("en-US", {
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                            hour12: true,
                          })
                        : "Never logged in"}
                    </span>
                  </div>
                </div>
                <div className="status-item">
                  <span className="status-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 21h18"></path><path d="M9 8h1"></path><path d="M9 12h1"></path><path d="M9 16h1"></path><path d="M14 8h1"></path><path d="M14 12h1"></path><path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16"></path></svg>
                  </span>
                  <div className="status-info">
                    <span className="status-label">Account Type</span>
                    <span className="status-value">Employee</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
</div>
        {/* EDIT MODAL */}
        {isEditModalOpen && (
          <div className="user-modal-overlay" onClick={() => setIsEditModalOpen(false)}>
            <div
              className="user-modal-content"
              style={{ maxWidth: "1100px", width: "100%" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="user-modal-header">
                <div>
                  <h2>Edit User</h2>
                  <p className="modal-subtitle">Update user details.</p>
                </div>
                <button className="user-modal-close" onClick={() => setIsEditModalOpen(false)}>
                  &#10005;
                </button>
              </div>

              <form className="user-form" onSubmit={handleEditSubmit}>
                <div className="user-form-grid">
                  <div className="form-row">
                    <label htmlFor="edit-name">Full Name</label>
                    <input
                      type="text"
                      id="edit-name"
                      name="name"
                      value={editUser.name}
                      onChange={handleEditChange}
                      placeholder="Enter full name"
                      className={editErrors.name ? "field-error" : ""}
                    />
                    {editErrors.name && <span className="field-error-text">{editErrors.name}</span>}
                  </div>
                  <div className="form-row">
                    <label htmlFor="edit-email">Email Address</label>
                    <input
                      type="email"
                      id="edit-email"
                      name="email"
                      value={editUser.email}
                      onChange={handleEditChange}
                      placeholder="Enter email address"
                      className={editErrors.email ? "field-error" : ""}
                    />
                    {editErrors.email && <span className="field-error-text">{editErrors.email}</span>}
                  </div>
                  <div className="form-row">
                    <label htmlFor="edit-contact">Contact No</label>
                    <input
                      type="text"
                      id="edit-contact"
                      name="contact_no"
                      value={editUser.contact_no}
                      onChange={handleEditChange}
                      placeholder="Enter contact number"
                      className={editErrors.contact_no ? "field-error" : ""}
                    />
                    {editErrors.contact_no && <span className="field-error-text">{editErrors.contact_no}</span>}
                  </div>
                  <div className="form-row">
                    <label htmlFor="edit-address">Address</label>
                    <input
                      type="text"
                      id="edit-address"
                      name="address"
                      value={editUser.address}
                      onChange={handleEditChange}
                      placeholder="Enter address"
                      className={editErrors.address ? "field-error" : ""}
                    />
                    {editErrors.address && <span className="field-error-text">{editErrors.address}</span>}
                  </div>
                  <div className="form-row">
                    <label htmlFor="edit-department">Department</label>
                    <select
                      id="edit-department"
                      name="department"
                      value={editUser.department}
                      onChange={handleEditChange}
                      className={editErrors.department ? "field-error" : ""}
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
                    {editErrors.department && <span className="field-error-text">{editErrors.department}</span>}
                  </div>
                  {editUser.department === "__custom__" && (
                    <div className="form-row">
                      <label htmlFor="edit-departmentCustom">Custom Department</label>
                      <input
                        type="text"
                        id="edit-departmentCustom"
                        name="departmentCustom"
                        value={editUser.departmentCustom}
                        onChange={handleEditChange}
                        placeholder="Enter custom department"
                        className={editErrors.departmentCustom ? "field-error" : ""}
                      />
                      {editErrors.departmentCustom && <span className="field-error-text">{editErrors.departmentCustom}</span>}
                    </div>
                  )}
                  <div className="form-row">
                    <label htmlFor="edit-designation">Designation</label>
                    <select
                      id="edit-designation"
                      name="designation"
                      value={editUser.designation}
                      onChange={handleEditChange}
                      className={editErrors.designation ? "field-error" : ""}
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
                    {editErrors.designation && <span className="field-error-text">{editErrors.designation}</span>}
                  </div>
                  {editUser.designation === "__custom__" && (
                    <div className="form-row">
                      <label htmlFor="edit-designationCustom">Custom Designation</label>
                      <input
                        type="text"
                        id="edit-designationCustom"
                        name="designationCustom"
                        value={editUser.designationCustom}
                        onChange={handleEditChange}
                        placeholder="Enter custom designation"
                        className={editErrors.designationCustom ? "field-error" : ""}
                      />
                      {editErrors.designationCustom && <span className="field-error-text">{editErrors.designationCustom}</span>}
                    </div>
                  )}
                  <div className="form-row">
                    <label htmlFor="edit-employee-code">Employee Code</label>
                    <input
                      type="text"
                      id="edit-employee-code"
                      name="employee_code"
                      value={editUser.employee_code}
                      onChange={handleEditChange}
                      placeholder="Enter employee code"
                      className={editErrors.employee_code ? "field-error" : ""}
                    />
                    {editErrors.employee_code && <span className="field-error-text">{editErrors.employee_code}</span>}
                  </div>
                  <div className="form-row">
                    <label htmlFor="edit-role">Role</label>
                    <select
                      id="edit-role"
                      name="role"
                      value={editUser.role}
                      onChange={handleEditChange}
                    >
                      <option value="admin">Admin</option>
                      <option value="manager">Manager</option>
                      <option value="team_lead">Team Lead</option>
                      <option value="member">Member</option>
                    </select>
                  </div>
                </div>

                <div className="user-form-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => setIsEditModalOpen(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="primary-button"
                    disabled={saving}
                  >
                    {saving ? "Saving..." : "Update User"}
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

export default UserProfile;
