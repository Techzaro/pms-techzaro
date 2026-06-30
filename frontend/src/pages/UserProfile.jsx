/**
 * UserProfile page component — admin/manager view of another user's profile.
 *
 * Displays the selected user's personal information, employment details,
 * email accounts, salary/bank data, uploaded documents and account status.
 * Provides an edit modal (accessible to admins and managers) for updating
 * user fields, uploading documents and changing system role.  Read-only for
 * non-admin roles unless editing their own profile.
 */

import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { MdEdit, MdArrowBack } from "react-icons/md";
import DashboardLayout from "../components/layout/DashboardLayout";
import Breadcrumb from "../components/Breadcrumb";
import { publish } from "../utils/eventBus";
import API_URL from "../config/api";
import { authToken, getCurrentRole, rolePath, getUser, normalizeRole } from "../utils/auth";
import { useNotification } from "../context/NotificationContext";
import "./UserProfile.css";
import "./ManageUsers.css";

/** Main UserProfile page — fetches and displays another user's full profile. */
function UserProfile() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const notify = useNotification();
  const [profileData, setProfileData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editUser, setEditUser] = useState({
    name: "",
    father_name: "",
    id_card_number: "",
    present_address: "",
    permanent_address: "",
    phone_number: "",
    emergency_contact_name: "",
    emergency_contact_relation: "",
    emergency_contact_phone: "",
    email: "",
    recovery_email: "",
    department: "",
    departmentCustom: "",
    designation: "",
    designationCustom: "",
    hired_for: "",
    employee_code: "",
    job_started_date: "",
    job_ended_date: "",
    role: "member",
    gross_salary: "",
    applied_via: "",
    bank_name: "",
    bank_account_number: "",
    bank_account_title: "",
  });
  const [editErrors, setEditErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [editFiles, setEditFiles] = useState({});
  const [filePreviews, setFilePreviews] = useState({});
  const [currentUserRole] = useState(() => getCurrentRole());

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

  /** Build auth headers for API requests. */
  const authHeaders = () => {
    const token = authToken();
    return {
      "Content-Type": "application/json",
      Authorization: token ? `Bearer ${token}` : "",
    };
  };

  /** Fetch the target user's profile data from the API. */
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
    const role = getCurrentRole();
    const token = authToken();
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

  /** Populate the edit form with current user data and open the modal. */
  const openEditModal = () => {
    const u = profileData.user;
    const deptVal = u.department || "";
    const isCustomDept = !DEPARTMENTS.slice(0, -1).includes(deptVal) && deptVal !== "";
    const desgVal = u.designation || "";
    const isCustomDesg = !DESIGNATIONS.slice(0, -1).includes(desgVal) && desgVal !== "";

    setEditUser({
      name: u.name || "",
      father_name: u.father_name || "",
      id_card_number: u.id_card_number || "",
      present_address: u.present_address || u.address || "",
      permanent_address: u.permanent_address || "",
      phone_number: u.phone_number || u.contact_no || "",
      emergency_contact_name: u.emergency_contact_name || "",
      emergency_contact_relation: u.emergency_contact_relation || "",
      emergency_contact_phone: u.emergency_contact_phone || "",
      email: u.email || "",
      recovery_email: u.recovery_email || "",
      department: isCustomDept ? "__custom__" : deptVal,
      departmentCustom: isCustomDept ? deptVal : "",
      designation: isCustomDesg ? "__custom__" : desgVal,
      designationCustom: isCustomDesg ? desgVal : "",
      hired_for: u.hired_for || "",
      employee_code: u.employee_code || "",
      job_started_date: u.job_started_date ? u.job_started_date.substring(0, 10) : "",
      job_ended_date: u.job_ended_date ? u.job_ended_date.substring(0, 10) : "",
      role: u.role || "member",
      gross_salary: u.gross_salary || "",
      applied_via: u.applied_via || "",
      bank_name: u.bank_name || "",
      bank_account_number: u.bank_account_number || "",
      bank_account_title: u.bank_account_title || "",
    });
    setEditErrors({});
    setEditFiles({});
    setFilePreviews({});
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

  /** Validate the edit form fields and return an errors object. */
  const validateEditForm = () => {
    const errors = {};
    if (!editUser.name.trim()) {
      errors.name = "Full Name is required.";
    } else if (!/^[a-zA-Z\s]+$/.test(editUser.name.trim())) {
      errors.name = "Full Name must contain only letters and spaces.";
    }
    if (!editUser.father_name.trim()) {
      errors.father_name = "Father Name is required.";
    } else if (!/^[a-zA-Z\s]+$/.test(editUser.father_name.trim())) {
      errors.father_name = "Father Name must contain only letters and spaces.";
    }
    if (!editUser.id_card_number.trim()) {
      errors.id_card_number = "ID Card Number is required.";
    } else if (!/^\d{13}$/.test(editUser.id_card_number.trim())) {
      errors.id_card_number = "CNIC must be exactly 13 digits.";
    }
    if (!editUser.present_address.trim()) errors.present_address = "Present Address is required.";
    if (!editUser.phone_number.trim()) {
      errors.phone_number = "Phone Number is required.";
    } else if (!/^0\d{10}$/.test(editUser.phone_number.trim())) {
      errors.phone_number = "Phone Number must be 11 digits starting with 0.";
    }
    if (editUser.emergency_contact_phone.trim() && !/^0\d{10}$/.test(editUser.emergency_contact_phone.trim())) {
      errors.emergency_contact_phone = "Emergency Phone must be 11 digits starting with 0.";
    }
    if (!editUser.email.trim()) {
      errors.email = "Email Address is required.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(editUser.email.trim())) {
      errors.email = "Please enter a valid email address.";
    }
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
    if (!editUser.job_started_date) errors.job_started_date = "Job Start Date is required.";
    if (editUser.gross_salary && (isNaN(editUser.gross_salary) || Number(editUser.gross_salary) < 0)) {
      errors.gross_salary = "Gross Salary must be a valid positive number.";
    }
    if (editUser.bank_account_number.trim() && !/^\d+$/.test(editUser.bank_account_number.trim())) {
      errors.bank_account_number = "Bank Account Number must contain only digits.";
    }
    return errors;
  };

  /** Submit the updated user data (with optional file uploads) to the API. */
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
      const isOwnProfile = String(getUser()?.id) === String(userId);
      const formData = new FormData();
      formData.append("name", editUser.name);
      formData.append("father_name", editUser.father_name);
      formData.append("id_card_number", editUser.id_card_number);
      formData.append("present_address", editUser.present_address);
      formData.append("permanent_address", editUser.permanent_address);
      formData.append("phone_number", editUser.phone_number);
      formData.append("emergency_contact_name", editUser.emergency_contact_name);
      formData.append("emergency_contact_relation", editUser.emergency_contact_relation);
      formData.append("emergency_contact_phone", editUser.emergency_contact_phone);
      formData.append("email", editUser.email);
      formData.append("recovery_email", editUser.recovery_email);
      formData.append("department", finalDepartment || "");
      formData.append("designation", finalDesignation || "");
      formData.append("hired_for", editUser.hired_for);
      formData.append("employee_code", editUser.employee_code);
      formData.append("job_started_date", editUser.job_started_date);
      formData.append("job_ended_date", editUser.job_ended_date);
      formData.append("role", editUser.role);
      formData.append("gross_salary", editUser.gross_salary);
      formData.append("applied_via", editUser.applied_via);
      formData.append("bank_name", editUser.bank_name);
      formData.append("bank_account_number", editUser.bank_account_number);
      formData.append("bank_account_title", editUser.bank_account_title);

      const fileFields = [
        "employment_contract", "offer_letter", "techxaro_regulations",
        "latest_education_cert", "cv", "previous_exp_letter",
        "previous_salary_slip", "other_document",
      ];
      fileFields.forEach((field) => {
        if (editFiles[field]) {
          formData.append(field, editFiles[field]);
        }
      });

      let url = isOwnProfile ? `${API_URL}/auth/update-profile` : `${API_URL}/users/${userId}`;

      if (!isOwnProfile) {
        formData.append('_method', 'PUT');
      }

      const res = await fetch(url, {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${authToken()}`,
        },
        body: formData,
        _notifHandled: true,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Unable to update user");

      setIsEditModalOpen(false);
      setEditFiles({});
      setFilePreviews({});

      if (data.user) {
        setProfileData((prev) => ({ ...prev, user: { ...prev.user, ...data.user } }));
      }

      notify.success("User updated successfully.");
      publish('data:changed', { type: 'user', action: 'updated' });

      try {
        const profileRes = await fetch(`${API_URL}/users/${userId}/profile`, {
          headers: { Accept: "application/json", ...authHeaders() },
          _notifHandled: true,
        });
        if (profileRes.ok) {
          const profile = await profileRes.json();
          setProfileData(profile);
        }
      } catch (reFetchErr) {
        console.error("Profile re-fetch failed:", reFetchErr);
      }
    } catch (err) {
      notify.error(err.message || "User update failed.");
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
            <button className="primary-button" onClick={() => navigate(rolePath("manage-users"))}>
              Go Back
            </button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const { user, account } = profileData;

  const breadcrumbs = [
    { label: "Users", path: rolePath("manage-users") },
    { label: user?.name || "User Profile" },
  ];

  return (
    <DashboardLayout hideRightSidebar={true}>
   
<div className="user-profile-container" >
     
          <div className="profile-left">
             <div className="user-profile-page">
               <Breadcrumb items={breadcrumbs} />
        <div className="profile-header">
          <h1>User Profile</h1>
          <p>View and manage your personal information and account settings.</p>
        </div>
            {/* User Card */}
            <div className="profile-user-card">
              <div className="profile-user-left">
                <div className="profile-avatar">
                  {getInitials(user.name)}
                </div>
                <div className="profile-user-info">
                  <h2>{user.name}</h2>
                  <span className="profile-designation">{user.designation || normalizeRole(user.role)}</span>
                </div>
              </div>
            </div>
           <br />
            {/* Personal Information */}
            <div className="profile-info-card">
              <div className="info-card-header">
                <h3>Personal Information</h3>
                {(!["admin", "manager"].includes(user.role) || currentUserRole === "admin") && (
                <button className="btn-edit" onClick={openEditModal} disabled={account?.status === "Resigned" || (!account && !user.active)} style={account?.status === "Resigned" || (!account && !user.active) ? { opacity: 0.5, cursor: 'not-allowed' } : {}}>
                  <MdEdit size={16} /> Edit
                </button>
                )}
              </div>
              <div className="info-card-body">
                <div className="info-row">
                  <span className="info-label">Full Name</span>
                  <span className="info-value">{user.name || "---"}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Father Name</span>
                  <span className="info-value">{user.father_name || "---"}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">ID Card Number</span>
                  <span className="info-value">{user.id_card_number || "---"}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Phone Number</span>
                  <span className="info-value">{user.phone_number || user.contact_no || "---"}</span>
                </div>
              </div>
            </div>
            <br />
            {/* Address */}
            <div className="profile-info-card">
              <div className="info-card-header">
                <h3>Address</h3>
              </div>
              <div className="info-card-body">
                <div className="info-row">
                  <span className="info-label">Present Address</span>
                  <span className="info-value">{user.present_address || user.address || "---"}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Permanent Address</span>
                  <span className="info-value">{user.permanent_address || "---"}</span>
                </div>
              </div>
            </div>
            <br />
            {/* Emergency Contact */}
            <div className="profile-info-card">
              <div className="info-card-header">
                <h3>Emergency Contact</h3>
              </div>
              <div className="info-card-body">
                <div className="info-row">
                  <span className="info-label">Name</span>
                  <span className="info-value">{user.emergency_contact_name || "---"}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Relation</span>
                  <span className="info-value">{user.emergency_contact_relation || "---"}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Phone</span>
                  <span className="info-value">{user.emergency_contact_phone || "---"}</span>
                </div>
              </div>
            </div>
            <br />
            {/* Email Accounts */}
            <div className="profile-info-card">
              <div className="info-card-header">
                <h3>Email Accounts</h3>
              </div>
              <div className="info-card-body">
                <div className="info-row">
                  <span className="info-label">Email</span>
                  <span className="info-value">{user.email || "---"}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Personal Email</span>
                  <span className="info-value">{user.personal_email || "---"}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Recovery Email</span>
                  <span className="info-value">{user.recovery_email || "---"}</span>
                </div>
              </div>
            </div>
            <br />
            {/* Employment Details */}
            <div className="profile-info-card">
              <div className="info-card-header">
                <h3>Employment Details</h3>
              </div>
              <div className="info-card-body">
                <div className="info-row">
                  <span className="info-label">Designation</span>
                  <span className="info-value">{user.designation || "---"}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Department</span>
                  <span className="info-value">{user.department || "---"}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Hired For</span>
                  <span className="info-value">{user.hired_for || "---"}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Employee Code</span>
                  <span className="info-value">{user.employee_code || "---"}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Role</span>
                  <span className="info-value">
                    {normalizeRole(user.role)}
                  </span>
                </div>
                <div className="info-row">
                  <span className="info-label">Job Started Date</span>
                  <span className="info-value">{user.job_started_date ? new Date(user.job_started_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "---"}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Job Ended Date</span>
                  <span className="info-value">{user.job_ended_date ? new Date(user.job_ended_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "---"}</span>
                </div>
              </div>
            </div>
            <br />
            {/* Salary & Bank Details */}
            <div className="profile-info-card">
              <div className="info-card-header">
                <h3>Salary & Bank Details</h3>
              </div>
              <div className="info-card-body">
                <div className="info-row">
                  <span className="info-label">Gross Salary</span>
                  <span className="info-value">{user.gross_salary ? `USD ${Number(user.gross_salary).toLocaleString()}` : "---"}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Applied Via</span>
                  <span className="info-value">{user.applied_via || "---"}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Bank Name</span>
                  <span className="info-value">{user.bank_name || "---"}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Bank Account Number</span>
                  <span className="info-value">{user.bank_account_number || "---"}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Bank Account Title</span>
                  <span className="info-value">{user.bank_account_title || "---"}</span>
                </div>
              </div>
            </div>
            <br/>
            {/* Documents */}
            <div className="profile-info-card">
              <div className="info-card-header">
                <h3>Documents</h3>
              </div>
              <div className="info-card-body">
                {[
                  { label: "Employment Contract", key: "employment_contract" },
                  { label: "Offer Letter", key: "offer_letter" },
                  { label: "Techxaro Regulations", key: "techxaro_regulations" },
                  { label: "Latest Educational Certificate", key: "latest_education_cert" },
                  { label: "CV", key: "cv" },
                  { label: "Previous Job Experience Letter", key: "previous_exp_letter" },
                  { label: "Previous Salary Slip", key: "previous_salary_slip" },
                  { label: "Other Document", key: "other_document" },
                ].map(({ label, key }) => (
                  <div className="info-row" key={key}>
                    <span className="info-label">{label}</span>
                    <span className="info-value">
                      {user[key] ? (
                        <a
                          href={`${API_URL}/users/${userId}/documents/${key}?token=${authToken()}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: "#2563eb", textDecoration: "underline" }}
                        >
                          View File
                        </a>
                      ) : "---"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        

          {/* RIGHT SIDE - Account Status */}
          <div className="profile-right">
            <div className="account-status-card">
              <h3>Account Status</h3>
              <div className="status-list">
                <div className="status-item">
                  <span className={`status-dot ${account?.status === "Active" ? "dot-active" : "dot-inactive"}`}></span>
                  <span className="status-text">{account?.status || (user.active ? "Active" : user.must_change_password ? "Inactive" : "Resigned")}</span>
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
                {/* ===== Personal Information ===== */}
                <h3 className="form-section-title">Personal Information</h3>
                <div className="user-form-grid">
                  <div className="form-row">
                    <label htmlFor="edit-name">Employee Full Name *</label>
                    <input type="text" id="edit-name" name="name" value={editUser.name} onChange={handleEditChange} placeholder="Enter full name" className={editErrors.name ? "field-error" : ""} />
                    {editErrors.name && <span className="field-error-text">{editErrors.name}</span>}
                  </div>
                  <div className="form-row">
                    <label htmlFor="edit-father_name">Father Name *</label>
                    <input type="text" id="edit-father_name" name="father_name" value={editUser.father_name} onChange={handleEditChange} placeholder="Enter father name" className={editErrors.father_name ? "field-error" : ""} />
                    {editErrors.father_name && <span className="field-error-text">{editErrors.father_name}</span>}
                  </div>
                  <div className="form-row">
                    <label htmlFor="edit-id_card_number">ID Card Number *</label>
                    <input type="text" id="edit-id_card_number" name="id_card_number" value={editUser.id_card_number} onChange={handleEditChange} placeholder="Enter ID card number" maxLength={13} className={editErrors.id_card_number ? "field-error" : ""} />
                    {editErrors.id_card_number && <span className="field-error-text">{editErrors.id_card_number}</span>}
                  </div>
                  <div className="form-row">
                    <label htmlFor="edit-phone_number">Phone Number *</label>
                    <input type="text" id="edit-phone_number" name="phone_number" value={editUser.phone_number} onChange={handleEditChange} placeholder="Enter phone number" maxLength={11} className={editErrors.phone_number ? "field-error" : ""} />
                    {editErrors.phone_number && <span className="field-error-text">{editErrors.phone_number}</span>}
                  </div>
                </div>

                {/* ===== Address ===== */}
                <h3 className="form-section-title">Address</h3>
                <div className="user-form-grid">
                  <div className="form-row">
                    <label htmlFor="edit-present_address">Present Address *</label>
                    <input type="text" id="edit-present_address" name="present_address" value={editUser.present_address} onChange={handleEditChange} placeholder="Enter present address" className={editErrors.present_address ? "field-error" : ""} />
                    {editErrors.present_address && <span className="field-error-text">{editErrors.present_address}</span>}
                  </div>
                  <div className="form-row">
                    <label htmlFor="edit-permanent_address">Permanent Address</label>
                    <input type="text" id="edit-permanent_address" name="permanent_address" value={editUser.permanent_address} onChange={handleEditChange} placeholder="Enter permanent address" />
                  </div>
                </div>

                {/* ===== Emergency Contact ===== */}
                <h3 className="form-section-title">Emergency Contact</h3>
                <div className="user-form-grid">
                  <div className="form-row">
                    <label htmlFor="edit-emergency_contact_name">Name</label>
                    <input type="text" id="edit-emergency_contact_name" name="emergency_contact_name" value={editUser.emergency_contact_name} onChange={handleEditChange} placeholder="Emergency contact name" />
                  </div>
                  <div className="form-row">
                    <label htmlFor="edit-emergency_contact_relation">Relation</label>
                    <input type="text" id="edit-emergency_contact_relation" name="emergency_contact_relation" value={editUser.emergency_contact_relation} onChange={handleEditChange} placeholder="e.g. Father, Mother, Spouse" />
                  </div>
                  <div className="form-row">
                    <label htmlFor="edit-emergency_contact_phone">Phone</label>
                    <input type="text" id="edit-emergency_contact_phone" name="emergency_contact_phone" value={editUser.emergency_contact_phone} onChange={handleEditChange} placeholder="Emergency contact phone" maxLength={11} className={editErrors.emergency_contact_phone ? "field-error" : ""} />
                    {editErrors.emergency_contact_phone && <span className="field-error-text">{editErrors.emergency_contact_phone}</span>}
                  </div>
                </div>

                {/* ===== Email Accounts ===== */}
                <h3 className="form-section-title">Email Accounts</h3>
                <div className="user-form-grid">
                  <div className="form-row">
                    <label htmlFor="edit-email">Email *</label>
                    <input type="email" id="edit-email" name="email" value={editUser.email} onChange={handleEditChange} placeholder="Enter email address" className={editErrors.email ? "field-error" : ""} />
                    {editErrors.email && <span className="field-error-text">{editErrors.email}</span>}
                  </div>
                </div>

                {/* ===== Employment Details ===== */}
                <h3 className="form-section-title">Employment Details</h3>
                <div className="user-form-grid">
                  <div className="form-row">
                    <label htmlFor="edit-designation">Designation / Role *</label>
                    <select id="edit-designation" name="designation" value={editUser.designation} onChange={handleEditChange} className={editErrors.designation ? "field-error" : ""}>
                      <option value="">Select Designation</option>
                      {DESIGNATIONS.map((d) =>
                        d === "__custom__" ? (
                          <option key="custom" value="__custom__">Custom / Type Here</option>
                        ) : (
                          <option key={d} value={d}>{d}</option>
                        )
                      )}
                    </select>
                    {editErrors.designation && <span className="field-error-text">{editErrors.designation}</span>}
                  </div>
                  {editUser.designation === "__custom__" && (
                    <div className="form-row">
                      <label htmlFor="edit-designationCustom">Custom Designation</label>
                      <input type="text" id="edit-designationCustom" name="designationCustom" value={editUser.designationCustom} onChange={handleEditChange} placeholder="Enter custom designation" className={editErrors.designationCustom ? "field-error" : ""} />
                      {editErrors.designationCustom && <span className="field-error-text">{editErrors.designationCustom}</span>}
                    </div>
                  )}
                  <div className="form-row">
                    <label htmlFor="edit-department">Department *</label>
                    <select id="edit-department" name="department" value={editUser.department} onChange={handleEditChange} className={editErrors.department ? "field-error" : ""}>
                      <option value="">Select Department</option>
                      {DEPARTMENTS.map((d) =>
                        d === "__custom__" ? (
                          <option key="custom" value="__custom__">Custom / Type Here</option>
                        ) : (
                          <option key={d} value={d}>{d}</option>
                        )
                      )}
                    </select>
                    {editErrors.department && <span className="field-error-text">{editErrors.department}</span>}
                  </div>
                  {editUser.department === "__custom__" && (
                    <div className="form-row">
                      <label htmlFor="edit-departmentCustom">Custom Department</label>
                      <input type="text" id="edit-departmentCustom" name="departmentCustom" value={editUser.departmentCustom} onChange={handleEditChange} placeholder="Enter custom department" className={editErrors.departmentCustom ? "field-error" : ""} />
                      {editErrors.departmentCustom && <span className="field-error-text">{editErrors.departmentCustom}</span>}
                    </div>
                  )}
                  <div className="form-row">
                    <label htmlFor="edit-hired_for">Hired For</label>
                    <input type="text" id="edit-hired_for" name="hired_for" value={editUser.hired_for} onChange={handleEditChange} placeholder="e.g. Full-time, Part-time, Contract" />
                  </div>
                  <div className="form-row">
                    <label htmlFor="edit-employee_code">Employee Code *</label>
                    <input type="text" id="edit-employee_code" name="employee_code" value={editUser.employee_code} onChange={handleEditChange} placeholder="Enter employee code" className={editErrors.employee_code ? "field-error" : ""} />
                    {editErrors.employee_code && <span className="field-error-text">{editErrors.employee_code}</span>}
                  </div>
                  <div className="form-row">
                    <label htmlFor="edit-role">System Role</label>
                    <select id="edit-role" name="role" value={editUser.role} onChange={handleEditChange}>
                      {getCurrentRole() === "admin" && <option value="admin">Admin</option>}
                      {getCurrentRole() === "admin" && <option value="manager">Manager</option>}
                      <option value="team_lead">Team Lead</option>
                      <option value="member">Member</option>
                    </select>
                  </div>
                  <div className="form-row">
                    <label htmlFor="edit-job_started_date">Job Started Date *</label>
                    <input type="date" id="edit-job_started_date" name="job_started_date" value={editUser.job_started_date} onChange={handleEditChange} className={editErrors.job_started_date ? "field-error" : ""} />
                    {editErrors.job_started_date && <span className="field-error-text">{editErrors.job_started_date}</span>}
                  </div>
                  <div className="form-row">
                    <label htmlFor="edit-job_ended_date">Job Ended Date</label>
                    <input type="date" id="edit-job_ended_date" name="job_ended_date" value={editUser.job_ended_date} onChange={handleEditChange} />
                  </div>
                </div>

                {/* ===== Salary & Bank ===== */}
                <h3 className="form-section-title">Salary & Bank Details</h3>
                <div className="user-form-grid">
                  <div className="form-row">
                    <label htmlFor="edit-gross_salary">Gross Salary</label>
                    <input type="number" id="edit-gross_salary" name="gross_salary" value={editUser.gross_salary} onChange={handleEditChange} placeholder="Enter gross salary" className={editErrors.gross_salary ? "field-error" : ""} />
                    {editErrors.gross_salary && <span className="field-error-text">{editErrors.gross_salary}</span>}
                  </div>
                  <div className="form-row">
                    <label htmlFor="edit-applied_via">Applied Via</label>
                    <input type="text" id="edit-applied_via" name="applied_via" value={editUser.applied_via} onChange={handleEditChange} placeholder="e.g. Website, Referral, LinkedIn" />
                  </div>
                  <div className="form-row">
                    <label htmlFor="edit-bank_name">Bank Name</label>
                    <input type="text" id="edit-bank_name" name="bank_name" value={editUser.bank_name} onChange={handleEditChange} placeholder="Enter bank name" />
                  </div>
                  <div className="form-row">
                    <label htmlFor="edit-bank_account_number">Bank Account Number</label>
                    <input type="text" id="edit-bank_account_number" name="bank_account_number" value={editUser.bank_account_number} onChange={handleEditChange} placeholder="Enter account number" className={editErrors.bank_account_number ? "field-error" : ""} />
                    {editErrors.bank_account_number && <span className="field-error-text">{editErrors.bank_account_number}</span>}
                  </div>
                  <div className="form-row">
                    <label htmlFor="edit-bank_account_title">Bank Account Title</label>
                    <input type="text" id="edit-bank_account_title" name="bank_account_title" value={editUser.bank_account_title} onChange={handleEditChange} placeholder="Enter account title" />
                  </div>
                </div>

                {/* ===== Documents ===== */}
                <h3 className="form-section-title">Documents</h3>
                <div className="user-form-grid">
                  {[
                    { label: "Employment Contract", key: "employment_contract" },
                    { label: "Offer Letter", key: "offer_letter" },
                    { label: "Techxaro Regulations", key: "techxaro_regulations" },
                    { label: "Latest Educational Certificate", key: "latest_education_cert" },
                    { label: "CV", key: "cv" },
                    { label: "Previous Job Experience Letter", key: "previous_exp_letter" },
                    { label: "Previous Salary Slip", key: "previous_salary_slip" },
                    { label: "Other Document", key: "other_document" },
                  ].map(({ label, key }) => (
                    <div className="form-row" key={key}>
                      <label htmlFor={`edit-${key}`}>{label}</label>
                      {user[key] && !editFiles[key] && (
                        <div style={{ marginBottom: 6, fontSize: 13, color: "#64748b" }}>
                          Current: <a href={`${API_URL}/users/${userId}/documents/${key}?token=${authToken()}`} target="_blank" rel="noopener noreferrer" style={{ color: "#2563eb" }}>View uploaded file</a>
                        </div>
                      )}
                      <input
                        type="file"
                        id={`edit-${key}`}
                        accept=".pdf,.jpg,.jpeg,.png,.webp"
                        onChange={(e) => {
                          const file = e.target.files[0];
                          if (file && !["application/pdf","image/jpeg","image/png","image/webp"].includes(file.type)) {
                            notify.error("Only PDF and image files are allowed.");
                            e.target.value = "";
                            return;
                          }
                          if (file) {
                            setEditFiles((prev) => ({ ...prev, [key]: file }));
                            setFilePreviews((prev) => ({ ...prev, [key]: file.name }));
                          }
                        }}
                      />
                      {filePreviews[key] && (
                        <span style={{ fontSize: 12, color: "#16a34a", marginTop: 4 }}>
                          Selected: {filePreviews[key]}
                        </span>
                      )}
                    </div>
                  ))}
                </div>

                <div className="user-form-actions">
                  <button type="button" className="secondary-button" onClick={() => setIsEditModalOpen(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="primary-button" disabled={saving}>
                    {saving ? "Saving..." : "Update User"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
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
    </DashboardLayout>
  );
}

export default UserProfile;
