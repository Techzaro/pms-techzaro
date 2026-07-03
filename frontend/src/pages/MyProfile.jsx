/**
 * MyProfile page component.
 *
 * Displays the currently logged-in user's profile information including
 * personal details, employment data, email addresses, uploaded documents
 * and account status.  Provides an inline password-change modal so the
 * user can update their credentials without leaving the page.
 */

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { MdEdit } from "react-icons/md";
import DashboardLayout from "../components/layout/DashboardLayout";
import Breadcrumb from "../components/Breadcrumb";
import API_URL from "../config/api";
import { useEscapeKey } from "../hooks/useEscapeKey";
import { authToken, getCurrentRole, normalizeRole } from "../utils/auth";
import { useNotification } from "../context/NotificationContext";
import { showSuccessMessage } from "../utils/notify";
import { formatDateTimeInline } from "../utils/formatDateTime";
import { useActivityHighlight } from "../hooks/useActivityHighlight";
import "../components/layout/ActivityHighlight.css";
import "./UserProfile.css";
import "./TaskDetails.css";
import { PasswordInput, isPasswordValid } from "../components/PasswordInput";
import "./UserProfile.css";
import "./ManageUsers.css";

/**
 * MyProfile — self-service profile page for the logged-in user.
 * Fetches profile data on mount and renders read-only sections with a
 * password-change modal.
 */
function MyProfile() {
  const navigate = useNavigate();
  const notify = useNotification();
  const [profileData, setProfileData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showProfPassword, setShowProfPassword] = useState(false);
  const [error, setError] = useState("");
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    old_password: "",
    new_password: "",
    confirm_password: "",
  });
  const [passwordErrors, setPasswordErrors] = useState({});
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [changes, setChanges] = useState([]);

  const {
    hasUnread: myHasUnread,
    isItemUnread: isMyItemUnread,
    markViewed: markMyViewed,
  } = useActivityHighlight("user", profileData?.user?.id, profileData?.activity_max_id || 0, changes);

  useEscapeKey(isPasswordModalOpen, () => setIsPasswordModalOpen(false));

  /** Build auth headers for API requests. */
  const authHeaders = () => {
    const token = authToken();
    return {
      "Content-Type": "application/json",
      Authorization: token ? `Bearer ${token}` : "",
    };
  };

  /** Fetch the current user's profile from the API. */
  const fetchProfile = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/auth/my-profile`, {
        headers: { Accept: "application/json", ...authHeaders() },
        skipLoader: true,
      });
      if (!res.ok) throw new Error("Unable to load profile");
      const data = await res.json();
      setProfileData(data);
    } catch (err) {
      setError(err.message || "Failed to load profile");
    } finally {
      setLoading(false);
    }
  };

  const fetchChanges = async () => {
    try {
      const res = await fetch(`${API_URL}/auth/my-changes`, {
        headers: { Accept: "application/json", ...authHeaders() },
      });
      const data = await res.json();
      if (data.success) setChanges(data.changes || []);
    } catch {}
  };

  useEffect(() => {
    const token = authToken();
    if (!token) {
      navigate("/");
      return;
    }
    fetchProfile();
    fetchChanges();
  }, [navigate]);

  /** Extract up to 2 uppercase initials from a full name for the avatar. */
  const getInitials = (name) => {
    if (!name) return "?";
    return name
      .split(" ")
      .filter(Boolean)
      .map((w) => w[0].toUpperCase())
      .join("");
  };

  /** Reset the password form and open the modal. */
  const openPasswordModal = () => {
    setPasswordForm({ old_password: "", new_password: "", confirm_password: "" });
    setPasswordErrors({});
    setIsPasswordModalOpen(true);
  };

  const handlePasswordChange = (e) => {
    const { name, value } = e.target;
    setPasswordForm((prev) => ({ ...prev, [name]: value }));
    if (passwordErrors[name]) {
      setPasswordErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  };

  /** Validate the password-change form and return an errors object. */
  const validatePasswordForm = () => {
    const errors = {};
    if (!passwordForm.old_password) errors.old_password = "Current password is required.";
    if (!passwordForm.new_password) {
      errors.new_password = "New password is required.";
    } else if (passwordForm.new_password === passwordForm.old_password) {
      errors.new_password = "New password must be different from current password.";
    } else if (!isPasswordValid(passwordForm.new_password)) {
      errors.new_password = "Password does not meet all requirements.";
    }
    if (!passwordForm.confirm_password) {
      errors.confirm_password = "Please confirm your password.";
    } else if (passwordForm.new_password !== passwordForm.confirm_password) {
      errors.confirm_password = "Passwords do not match.";
    }
    return errors;
  };

  const canSubmitPassword = passwordForm.old_password
    && isPasswordValid(passwordForm.new_password)
    && passwordForm.new_password !== passwordForm.old_password
    && passwordForm.new_password === passwordForm.confirm_password;

  /** Submit the password change to the API. */
  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    const errors = validatePasswordForm();
    setPasswordErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/user/change-password`, {
        method: "PUT",
        headers: { Accept: "application/json", ...authHeaders() },
        body: JSON.stringify({
          old_password: passwordForm.old_password,
          new_password: passwordForm.new_password,
        }),
        _notifHandled: true,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to change password");

      setIsPasswordModalOpen(false);
      showSuccessMessage("Password", "changed");
    } catch (err) {
      notify.error(err.message || "Password change failed.");
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
            <button className="primary-button" onClick={() => navigate(-1)}>
              Go Back
            </button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const { user, account } = profileData;

  const roleDisplay = normalizeRole(user.role);

  const breadcrumbs = [
    { label: "Profile" },
  ];

  return (
    <DashboardLayout hideRightSidebar={true}>
      <div className="user-profile-page">
        <Breadcrumb items={breadcrumbs} />
        <div className="profile-header">
          <h1>My Profile</h1>
          <p>View and manage your personal information and account settings.</p>
        </div>

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
                  <span className="profile-designation">{user.designation || roleDisplay}</span>
                  {user.department && <span className="profile-dept">{user.department}</span>}
                </div>
              </div>
            </div>

            {/* Personal Information */}
            <div className="profile-info-card">
              <div className="info-card-header">
                <h3>Personal Information</h3>
                <button className="btn-edit" onClick={openPasswordModal}>
                  <MdEdit size={16} /> Update Password
                </button>
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

            {/* Email Accounts */}
            <div className="profile-info-card">
              <div className="info-card-header">
                <h3>Email Accounts</h3>
              </div>
              <div className="info-card-body">
                <div className="info-row">
                  <span className="info-label">Personal Email</span>
                  <span className="info-value">{user.personal_email || "---"}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Professional Email</span>
                  <span className="info-value">{user.professional_email || "---"}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Password of Professional Email</span>
                  <span className="info-value" style={{display:'flex',alignItems:'center',gap:'8px'}}>
                    {user.professional_email_password ? (showProfPassword ? user.professional_email_password : "********") : "---"}
                    {user.professional_email_password && (
                      <button type="button" onClick={() => setShowProfPassword(!showProfPassword)} style={{background:'none',border:'1px solid #d1d5db',borderRadius:'6px',padding:'2px 8px',cursor:'pointer',fontSize:'12px',color:'#6b7280'}}>
                        {showProfPassword ? "Hide" : "Show"}
                      </button>
                    )}
                  </span>
                </div>
              </div>
            </div>

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
                  <span className="info-value">{roleDisplay}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Job Started Date</span>
                  <span className="info-value">
                    {user.job_started_date
                      ? new Date(user.job_started_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
                      : "---"}
                  </span>
                </div>
                <div className="info-row">
                  <span className="info-label">Job Ended Date</span>
                  <span className="info-value">
                    {user.job_ended_date
                      ? new Date(user.job_ended_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
                      : "---"}
                  </span>
                </div>
              </div>
            </div>

            {/* Salary & Bank Details */}
            <div className="profile-info-card">
              <div className="info-card-header">
                <h3>Salary & Bank Details</h3>
              </div>
              <div className="info-card-body">
                <div className="info-row">
                  <span className="info-label">Gross Salary</span>
                  <span className="info-value">{user.gross_salary ? `PKR ${Number(user.gross_salary).toLocaleString()}` : "---"}</span>
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
                  { label: "Other Document", key: "other_document" },
                ].map(({ label, key }) => (
                  <div className="info-row" key={key}>
                    <span className="info-label">{label}</span>
                    <span className="info-value">
                      {user[key] ? (
                        <a
                          href={`${API_URL}/auth/my-documents/${key}?token=${authToken()}`}
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
            <br />
            <div
              className={`account-status-card${myHasUnread ? " activity-panel--unread" : ""}`}
            >
              <h3>Activity</h3>
              {changes.length === 0 ? (
                <p className="pd-muted" style={{ margin: 0 }}>No activity yet.</p>
              ) : (
                <ul className="td-activity-list">
                  {changes.map((c, i) => (
                    <li key={c.id || i} className={`td-activity-item${isMyItemUnread(c) ? " activity-item--unread" : ""}`}>
                      <span className="td-activity-icon">✏️</span>
                      <div className="td-activity-body">
                        <span className="td-activity-text">
                          <strong>{c.modified_by?.name || 'Unknown'}</strong> changed{' '}
                          <strong>{c.field_name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</strong>
                        </span>
                        <span className="td-activity-time">{formatDateTimeInline(c.created_at)}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>

      {isPasswordModalOpen && (
        <div className="user-modal-overlay">
          <div
            className="user-modal-content"
            style={{ maxWidth: "480px", width: "100%" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="user-modal-header">
              <div>
                <h2>Change Password</h2>
                <p className="modal-subtitle">Update your account password.</p>
              </div>
              <button className="user-modal-close" onClick={() => setIsPasswordModalOpen(false)}>
                &#10005;
              </button>
            </div>

            <form className="user-form" onSubmit={handlePasswordSubmit}>
              <div className="user-form-grid" style={{ gridTemplateColumns: "1fr", gap: "12px" }}>
                <div className="form-row" style={{ position: "relative" }}>
                  <label htmlFor="old-password">Current Password</label>
                  <div style={{ position: "relative" }}>
                    <svg style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                    </svg>
                    <input
                      type={showCurrentPassword ? "text" : "password"}
                      id="old-password"
                      name="old_password"
                      value={passwordForm.old_password}
                      onChange={handlePasswordChange}
                      placeholder="Enter current password"
                      className={passwordErrors.old_password ? "field-error" : ""}
                      style={{ width: "100%", padding: "8px 36px 8px 32px", border: "1px solid #d1d5db", borderRadius: "6px", fontSize: "14px", outline: "none", boxSizing: "border-box" }}
                    />
                    <button type="button" onClick={() => setShowCurrentPassword(!showCurrentPassword)} style={{ position: "absolute", right: "8px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", padding: "2px", display: "flex", alignItems: "center" }} tabIndex={-1}>
                      {showCurrentPassword ? (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                      ) : (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                      )}
                    </button>
                  </div>
                  {passwordErrors.old_password && <span className="field-error-text">{passwordErrors.old_password}</span>}
                </div>

                <PasswordInput
                  id="new-password"
                  name="new_password"
                  value={passwordForm.new_password}
                  onChange={handlePasswordChange}
                  placeholder="Enter new password"
                  label="New Password"
                  error={passwordErrors.new_password}
                />

                <PasswordInput
                  id="confirm-password"
                  name="confirm_password"
                  value={passwordForm.confirm_password}
                  onChange={handlePasswordChange}
                  placeholder="Confirm new password"
                  label="Confirm New Password"
                  showStrength={false}
                  showRules={false}
                  error={passwordErrors.confirm_password}
                />
              </div>

              <div className="user-form-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setIsPasswordModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="primary-button"
                  disabled={saving || !canSubmitPassword}
                >
                  {saving ? "Saving..." : "Change Password"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}

export default MyProfile;
