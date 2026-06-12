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
import ConfirmModal from "../components/ConfirmModal";
import API_URL from "../config/api";
import { authToken, getCurrentRole, getUser, setUser, rolePath } from "../utils/auth";
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
    fatherName: "",
    idCardNumber: "",
    presentAddress: "",
    permanentAddress: "",
    phoneNumber: "",
    emergencyContactName: "",
    emergencyContactRelation: "",
    emergencyContactPhone: "",
    personalEmail: "",
    professionalEmail: "",
    professionalEmailPassword: "",
    recoveryEmail: "",
    department: "",
    departmentCustom: "",
    designation: "",
    designationCustom: "",
    hiredFor: "",
    employeeCode: "",
    jobStartedDate: "",
    jobEndedDate: "",
    role: "member",
    grossSalary: "",
    appliedVia: "",
    bankName: "",
    bankAccountNumber: "",
    bankAccountTitle: "",
    employmentContract: null,
    offerLetter: null,
    techxaroRegulations: null,
    latestEducationCert: null,
    cv: null,
    previousExpLetter: null,
    previousSalarySlip: null,
    otherDocument: null,
  });
  const [loading, setLoading] = useState(false);
  const [savingUserId, setSavingUserId] = useState(null);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("");
  const [addErrors, setAddErrors] = useState({});
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sortOrder, setSortOrder] = useState("");
  const [timeFilter, setTimeFilter] = useState("");
  const [resignConfirmOpen, setResignConfirmOpen] = useState(false);
  const [resignUserId, setResignUserId] = useState(null);

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
        skipLoader: true,
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
      fatherName: "",
      idCardNumber: "",
      presentAddress: "",
      permanentAddress: "",
      phoneNumber: "",
      emergencyContactName: "",
      emergencyContactRelation: "",
      emergencyContactPhone: "",
      personalEmail: "",
      professionalEmail: "",
      professionalEmailPassword: "",
      recoveryEmail: "",
      department: "",
      departmentCustom: "",
      designation: "",
      designationCustom: "",
      hiredFor: "",
      employeeCode: "",
      jobStartedDate: "",
      jobEndedDate: "",
      role: "member",
      grossSalary: "",
      appliedVia: "",
      bankName: "",
      bankAccountNumber: "",
      bankAccountTitle: "",
      employmentContract: null,
      offerLetter: null,
      techxaroRegulations: null,
      latestEducationCert: null,
      cv: null,
      previousExpLetter: null,
      previousSalarySlip: null,
      otherDocument: null,
    });
  };

  const validateAddForm = () => {
    const errors = {};
    if (!newUser.fullName.trim()) errors.fullName = "Full Name is required.";
    if (!newUser.fatherName.trim()) errors.fatherName = "Father Name is required.";
    if (!newUser.idCardNumber.trim()) errors.idCardNumber = "ID Card Number is required.";
    if (!newUser.presentAddress.trim()) errors.presentAddress = "Present Address is required.";
    if (!newUser.phoneNumber.trim()) errors.phoneNumber = "Phone Number is required.";
    if (!newUser.personalEmail.trim()) {
      errors.personalEmail = "Personal Email is required.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newUser.personalEmail.trim())) {
      errors.personalEmail = "Please enter a valid email address.";
    }
    if (!newUser.professionalEmail.trim()) {
      errors.professionalEmail = "Professional Email is required.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newUser.professionalEmail.trim())) {
      errors.professionalEmail = "Please enter a valid email address.";
    }
    if (!newUser.professionalEmailPassword.trim()) errors.professionalEmailPassword = "Professional Email Password is required.";
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
    if (!newUser.employeeCode.trim()) errors.employeeCode = "Employee Code is required.";
    if (!newUser.jobStartedDate) errors.jobStartedDate = "Job Start Date is required.";
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
    setResignUserId(userId);
    setResignConfirmOpen(true);
  };

  const confirmResignUser = async () => {
    const userId = resignUserId;
    setResignConfirmOpen(false);
    setResignUserId(null);

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
    const isTargetProtected = user.role === "admin" || user.role === "manager";
    const isActive = user.active !== false;
    const canModifyUser =
      isActive && !isSelf && !(currentUserRole === "manager" && isTargetProtected);

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
              onClick={() => navigate(rolePath(`manage-users/user-profile/${user.id}`))}
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

  const filteredUsers = users.filter((user) => {
    const matchesSearch =
      user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = roleFilter === "" || user.role === roleFilter;
    const matchesStatus =
      statusFilter === "" ||
      (statusFilter === "active" && user.active !== false) ||
      (statusFilter === "resigned" && user.active === false);
    return matchesSearch && matchesRole && matchesStatus;
  });

  const sortedUsers = [...filteredUsers].sort((a, b) => {
    if (sortOrder === "asc") return a.name.localeCompare(b.name);
    if (sortOrder === "desc") return b.name.localeCompare(a.name);
    return 0;
  });

  const handleSubmit = async (event) => {
    event.preventDefault();

    const errors = validateAddForm();
    setAddErrors(errors);
    if (Object.keys(errors).length > 0) return;

    const finalDepartment =
      newUser.department === "__custom__" ? newUser.departmentCustom : newUser.department;
    const finalDesignation =
      newUser.designation === "__custom__" ? newUser.designationCustom : newUser.designation;

    const formData = new FormData();
    formData.append("name", newUser.fullName);
    formData.append("father_name", newUser.fatherName);
    formData.append("id_card_number", newUser.idCardNumber);
    formData.append("present_address", newUser.presentAddress);
    formData.append("permanent_address", newUser.permanentAddress);
    formData.append("phone_number", newUser.phoneNumber);
    formData.append("emergency_contact_name", newUser.emergencyContactName);
    formData.append("emergency_contact_relation", newUser.emergencyContactRelation);
    formData.append("emergency_contact_phone", newUser.emergencyContactPhone);
    formData.append("personal_email", newUser.personalEmail);
    formData.append("email", newUser.professionalEmail);
    formData.append("professional_email_password", newUser.professionalEmailPassword);
    formData.append("recovery_email", newUser.recoveryEmail);
    formData.append("department", finalDepartment || "");
    formData.append("designation", finalDesignation || "");
    formData.append("hired_for", newUser.hiredFor);
    formData.append("employee_code", newUser.employeeCode);
    formData.append("job_started_date", newUser.jobStartedDate);
    formData.append("job_ended_date", newUser.jobEndedDate);
    formData.append("role", newUser.role);
    formData.append("gross_salary", newUser.grossSalary);
    formData.append("applied_via", newUser.appliedVia);
    formData.append("bank_name", newUser.bankName);
    formData.append("bank_account_number", newUser.bankAccountNumber);
    formData.append("bank_account_title", newUser.bankAccountTitle);

    const fileFields = [
      "employmentContract", "offerLetter", "techxaroRegulations",
      "latestEducationCert", "cv", "previousExpLetter",
      "previousSalarySlip", "otherDocument",
    ];
    const fileApiNames = [
      "employment_contract", "offer_letter", "techxaro_regulations",
      "latest_education_cert", "cv", "previous_exp_letter",
      "previous_salary_slip", "other_document",
    ];
    fileFields.forEach((field, i) => {
      if (newUser[field]) formData.append(fileApiNames[i], newUser[field]);
    });

    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/users`, {
        method: "POST",
        headers: { Accept: "application/json", Authorization: token ? `Bearer ${token}` : "" },
        body: formData,
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
    <>
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
            <input type="text" placeholder="Search users by name or email....." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          </div>
          <select className="reports-filter" value={timeFilter} onChange={(e) => setTimeFilter(e.target.value)}>
            <option value="">All Time</option>
            <option value="7">Last 7 Days</option>
            <option value="30">Last 30 Days</option>
            <option value="180">Last 6 Months</option>
          </select>
          <select className="bar-role" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
            <option value="">Role</option>
            <option value="admin">Admin</option>
            <option value="manager">Manager</option>
            <option value="team_lead">Team-Lead</option>
            <option value="member">Member</option>
          </select>
          <select className="bar-status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">Status</option>
            <option value="active">Active</option>
            <option value="resigned">Resigned</option>
          </select>
          <select className="bar-sort" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)}>
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
                sortedUsers.length ? (
                  sortedUsers.map(renderUserRow)
                ) : (
                  <tr>
                    <td colSpan="4" className="empty-row">
                      No users match your search or filters.
                    </td>
                  </tr>
                )
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
                {/* ===== Personal Information ===== */}
                <h3 className="form-section-title">Personal Information</h3>
                <div className="user-form-grid">
                  <div className="form-row">
                    <label htmlFor="fullName">Employee Full Name *</label>
                    <input type="text" id="fullName" name="fullName" value={newUser.fullName} onChange={handleChange} placeholder="Enter full name" className={addErrors.fullName ? "field-error" : ""} />
                    {addErrors.fullName && <span className="field-error-text">{addErrors.fullName}</span>}
                  </div>
                  <div className="form-row">
                    <label htmlFor="fatherName">Father Name *</label>
                    <input type="text" id="fatherName" name="fatherName" value={newUser.fatherName} onChange={handleChange} placeholder="Enter father name" className={addErrors.fatherName ? "field-error" : ""} />
                    {addErrors.fatherName && <span className="field-error-text">{addErrors.fatherName}</span>}
                  </div>
                  <div className="form-row">
                    <label htmlFor="idCardNumber">ID Card Number *</label>
                    <input type="text" id="idCardNumber" name="idCardNumber" value={newUser.idCardNumber} onChange={handleChange} placeholder="Enter ID card number" className={addErrors.idCardNumber ? "field-error" : ""} />
                    {addErrors.idCardNumber && <span className="field-error-text">{addErrors.idCardNumber}</span>}
                  </div>
                  <div className="form-row">
                    <label htmlFor="phoneNumber">Phone Number *</label>
                    <input type="text" id="phoneNumber" name="phoneNumber" value={newUser.phoneNumber} onChange={handleChange} placeholder="Enter phone number" className={addErrors.phoneNumber ? "field-error" : ""} />
                    {addErrors.phoneNumber && <span className="field-error-text">{addErrors.phoneNumber}</span>}
                  </div>
                </div>

                {/* ===== Address ===== */}
                <h3 className="form-section-title">Address</h3>
                <div className="user-form-grid">
                  <div className="form-row">
                    <label htmlFor="presentAddress">Present Address *</label>
                    <input type="text" id="presentAddress" name="presentAddress" value={newUser.presentAddress} onChange={handleChange} placeholder="Enter present address" className={addErrors.presentAddress ? "field-error" : ""} />
                    {addErrors.presentAddress && <span className="field-error-text">{addErrors.presentAddress}</span>}
                  </div>
                  <div className="form-row">
                    <label htmlFor="permanentAddress">Permanent Address</label>
                    <input type="text" id="permanentAddress" name="permanentAddress" value={newUser.permanentAddress} onChange={handleChange} placeholder="Enter permanent address" />
                  </div>
                </div>

                {/* ===== Emergency Contact ===== */}
                <h3 className="form-section-title">Emergency Contact</h3>
                <div className="user-form-grid">
                  <div className="form-row">
                    <label htmlFor="emergencyContactName">Name</label>
                    <input type="text" id="emergencyContactName" name="emergencyContactName" value={newUser.emergencyContactName} onChange={handleChange} placeholder="Emergency contact name" />
                  </div>
                  <div className="form-row">
                    <label htmlFor="emergencyContactRelation">Relation</label>
                    <input type="text" id="emergencyContactRelation" name="emergencyContactRelation" value={newUser.emergencyContactRelation} onChange={handleChange} placeholder="e.g. Father, Mother, Spouse" />
                  </div>
                  <div className="form-row">
                    <label htmlFor="emergencyContactPhone">Phone</label>
                    <input type="text" id="emergencyContactPhone" name="emergencyContactPhone" value={newUser.emergencyContactPhone} onChange={handleChange} placeholder="Emergency contact phone" />
                  </div>
                </div>

                {/* ===== Email Accounts ===== */}
                <h3 className="form-section-title">Email Accounts</h3>
                <div className="user-form-grid">
                  <div className="form-row">
                    <label htmlFor="personalEmail">Personal Email Address *</label>
                    <input type="email" id="personalEmail" name="personalEmail" value={newUser.personalEmail} onChange={handleChange} placeholder="Enter personal email" className={addErrors.personalEmail ? "field-error" : ""} />
                    {addErrors.personalEmail && <span className="field-error-text">{addErrors.personalEmail}</span>}
                  </div>
                  <div className="form-row">
                    <label htmlFor="professionalEmail">Professional Email Address *</label>
                    <input type="email" id="professionalEmail" name="professionalEmail" value={newUser.professionalEmail} onChange={handleChange} placeholder="Enter professional email" className={addErrors.professionalEmail ? "field-error" : ""} />
                    {addErrors.professionalEmail && <span className="field-error-text">{addErrors.professionalEmail}</span>}
                  </div>
                  <div className="form-row">
                    <label htmlFor="professionalEmailPassword">Password of Professional Email *</label>
                    <input type="password" id="professionalEmailPassword" name="professionalEmailPassword" value={newUser.professionalEmailPassword} onChange={handleChange} placeholder="Enter password" className={addErrors.professionalEmailPassword ? "field-error" : ""} />
                    {addErrors.professionalEmailPassword && <span className="field-error-text">{addErrors.professionalEmailPassword}</span>}
                  </div>
                  <div className="form-row">
                    <label htmlFor="recoveryEmail">Recovery Email</label>
                    <input type="email" id="recoveryEmail" name="recoveryEmail" value={newUser.recoveryEmail} onChange={handleChange} placeholder="Email for recovery" />
                  </div>
                </div>

                {/* ===== Employment Details ===== */}
                <h3 className="form-section-title">Employment Details</h3>
                <div className="user-form-grid">
                  <div className="form-row">
                    <label htmlFor="designation">Designation / Role *</label>
                    <select id="designation" name="designation" value={newUser.designation} onChange={handleChange} className={addErrors.designation ? "field-error" : ""}>
                      <option value="">Select Designation</option>
                      {DESIGNATIONS.map((d) =>
                        d === "__custom__" ? (
                          <option key="custom" value="__custom__">Custom / Type Here</option>
                        ) : (
                          <option key={d} value={d}>{d}</option>
                        )
                      )}
                    </select>
                    {addErrors.designation && <span className="field-error-text">{addErrors.designation}</span>}
                  </div>
                  {newUser.designation === "__custom__" && (
                    <div className="form-row">
                      <label htmlFor="designationCustom">Custom Designation</label>
                      <input type="text" id="designationCustom" name="designationCustom" value={newUser.designationCustom} onChange={handleChange} placeholder="Enter custom designation" className={addErrors.designationCustom ? "field-error" : ""} />
                      {addErrors.designationCustom && <span className="field-error-text">{addErrors.designationCustom}</span>}
                    </div>
                  )}
                  <div className="form-row">
                    <label htmlFor="department">Department *</label>
                    <select id="department" name="department" value={newUser.department} onChange={handleChange} className={addErrors.department ? "field-error" : ""}>
                      <option value="">Select Department</option>
                      {DEPARTMENTS.map((d) =>
                        d === "__custom__" ? (
                          <option key="custom" value="__custom__">Custom / Type Here</option>
                        ) : (
                          <option key={d} value={d}>{d}</option>
                        )
                      )}
                    </select>
                    {addErrors.department && <span className="field-error-text">{addErrors.department}</span>}
                  </div>
                  {newUser.department === "__custom__" && (
                    <div className="form-row">
                      <label htmlFor="departmentCustom">Custom Department</label>
                      <input type="text" id="departmentCustom" name="departmentCustom" value={newUser.departmentCustom} onChange={handleChange} placeholder="Enter custom department" className={addErrors.departmentCustom ? "field-error" : ""} />
                      {addErrors.departmentCustom && <span className="field-error-text">{addErrors.departmentCustom}</span>}
                    </div>
                  )}
                  <div className="form-row">
                    <label htmlFor="hiredFor">Hired For</label>
                    <input type="text" id="hiredFor" name="hiredFor" value={newUser.hiredFor} onChange={handleChange} placeholder="e.g. Full-time, Part-time, Contract" />
                  </div>
                  <div className="form-row">
                    <label htmlFor="employeeCode">Employee Code *</label>
                    <input type="text" id="employeeCode" name="employeeCode" value={newUser.employeeCode} onChange={handleChange} placeholder="Enter employee code" className={addErrors.employeeCode ? "field-error" : ""} />
                    {addErrors.employeeCode && <span className="field-error-text">{addErrors.employeeCode}</span>}
                  </div>
                  <div className="form-row">
                    <label htmlFor="role">System Role</label>
                    <select id="role" name="role" value={newUser.role} onChange={handleChange}>
                      <option value="admin">Admin</option>
                      <option value="manager">Manager</option>
                      <option value="team_lead">Team Lead</option>
                      <option value="member">Member</option>
                    </select>
                  </div>
                  <div className="form-row">
                    <label htmlFor="jobStartedDate">Job Started Date *</label>
                    <input type="date" id="jobStartedDate" name="jobStartedDate" value={newUser.jobStartedDate} onChange={handleChange} className={addErrors.jobStartedDate ? "field-error" : ""} />
                    {addErrors.jobStartedDate && <span className="field-error-text">{addErrors.jobStartedDate}</span>}
                  </div>
                  <div className="form-row">
                    <label htmlFor="jobEndedDate">Job Ended Date</label>
                    <input type="date" id="jobEndedDate" name="jobEndedDate" value={newUser.jobEndedDate} onChange={handleChange} />
                  </div>
                </div>

                {/* ===== Salary & Bank ===== */}
                <h3 className="form-section-title">Salary & Bank Details</h3>
                <div className="user-form-grid">
                  <div className="form-row">
                    <label htmlFor="grossSalary">Gross Salary</label>
                    <input type="number" id="grossSalary" name="grossSalary" value={newUser.grossSalary} onChange={handleChange} placeholder="Enter gross salary" />
                  </div>
                  <div className="form-row">
                    <label htmlFor="appliedVia">Applied Via</label>
                    <input type="text" id="appliedVia" name="appliedVia" value={newUser.appliedVia} onChange={handleChange} placeholder="e.g. Website, Referral, LinkedIn" />
                  </div>
                  <div className="form-row">
                    <label htmlFor="bankName">Bank Name</label>
                    <input type="text" id="bankName" name="bankName" value={newUser.bankName} onChange={handleChange} placeholder="Enter bank name" />
                  </div>
                  <div className="form-row">
                    <label htmlFor="bankAccountNumber">Bank Account Number</label>
                    <input type="text" id="bankAccountNumber" name="bankAccountNumber" value={newUser.bankAccountNumber} onChange={handleChange} placeholder="Enter account number" />
                  </div>
                  <div className="form-row">
                    <label htmlFor="bankAccountTitle">Bank Account Title</label>
                    <input type="text" id="bankAccountTitle" name="bankAccountTitle" value={newUser.bankAccountTitle} onChange={handleChange} placeholder="Enter account title" />
                  </div>
                </div>

                {/* ===== Documents ===== */}
                <h3 className="form-section-title">Documents</h3>
                <div className="user-form-grid">
                  <div className="form-row">
                    <label htmlFor="employmentContract">Employment Contract</label>
                    <input type="file" id="employmentContract" onChange={(e) => setNewUser((p) => ({ ...p, employmentContract: e.target.files[0] || null }))} accept=".pdf,.doc,.docx" />
                  </div>
                  <div className="form-row">
                    <label htmlFor="offerLetter">Offer Letter</label>
                    <input type="file" id="offerLetter" onChange={(e) => setNewUser((p) => ({ ...p, offerLetter: e.target.files[0] || null }))} accept=".pdf,.doc,.docx" />
                  </div>
                  <div className="form-row">
                    <label htmlFor="techxaroRegulations">Techxaro Regulations</label>
                    <input type="file" id="techxaroRegulations" onChange={(e) => setNewUser((p) => ({ ...p, techxaroRegulations: e.target.files[0] || null }))} accept=".pdf,.doc,.docx" />
                  </div>
                  <div className="form-row">
                    <label htmlFor="latestEducationCert">Latest Educational Certificate</label>
                    <input type="file" id="latestEducationCert" onChange={(e) => setNewUser((p) => ({ ...p, latestEducationCert: e.target.files[0] || null }))} accept=".pdf,.doc,.docx,.jpg,.png" />
                  </div>
                  <div className="form-row">
                    <label htmlFor="cv">CV</label>
                    <input type="file" id="cv" onChange={(e) => setNewUser((p) => ({ ...p, cv: e.target.files[0] || null }))} accept=".pdf,.doc,.docx" />
                  </div>
                  <div className="form-row">
                    <label htmlFor="previousExpLetter">Previous Job Experience Letter</label>
                    <input type="file" id="previousExpLetter" onChange={(e) => setNewUser((p) => ({ ...p, previousExpLetter: e.target.files[0] || null }))} accept=".pdf,.doc,.docx" />
                  </div>
                  <div className="form-row">
                    <label htmlFor="previousSalarySlip">Previous Salary Slip</label>
                    <input type="file" id="previousSalarySlip" onChange={(e) => setNewUser((p) => ({ ...p, previousSalarySlip: e.target.files[0] || null }))} accept=".pdf,.doc,.docx,.jpg,.png" />
                  </div>
                  <div className="form-row">
                    <label htmlFor="otherDocument">Revised / Other Document</label>
                    <input type="file" id="otherDocument" onChange={(e) => setNewUser((p) => ({ ...p, otherDocument: e.target.files[0] || null }))} accept=".pdf,.doc,.docx,.jpg,.png" />
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

    <ConfirmModal
      isOpen={resignConfirmOpen}
      onClose={() => { setResignConfirmOpen(false); setResignUserId(null); }}
      onConfirm={confirmResignUser}
      title="Confirm Resignation"
      message="Are you sure you want to resign? This action may affect your access and assigned responsibilities."
      confirmText="Confirm Resignation"
      cancelText="Cancel"
      danger
    />
    </>
  );
}

export default ManageUsers;
