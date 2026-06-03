import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { MdEdit } from "react-icons/md";
import DashboardLayout from "../components/layout/DashboardLayout";
import API_URL from "../config/api";
import "./UserProfile.css";

function MyProfile() {
  const navigate = useNavigate();
  const [profileData, setProfileData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    old_password: "",
    new_password: "",
    confirm_password: "",
  });
  const [passwordErrors, setPasswordErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("");

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
      const res = await fetch(`${API_URL}/auth/my-profile`, {
        headers: { Accept: "application/json", ...authHeaders() },
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

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/");
      return;
    }
    fetchProfile();
  }, [navigate]);

  const getInitials = (name) => {
    if (!name) return "?";
    return name
      .split(" ")
      .filter(Boolean)
      .map((w) => w[0].toUpperCase())
      .join("");
  };

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

  const validatePasswordForm = () => {
    const errors = {};
    if (!passwordForm.old_password) errors.old_password = "Current password is required.";
    if (!passwordForm.new_password) {
      errors.new_password = "New password is required.";
    } else if (passwordForm.new_password.length < 6) {
      errors.new_password = "Password must be at least 6 characters.";
    }
    if (!passwordForm.confirm_password) {
      errors.confirm_password = "Please confirm your password.";
    } else if (passwordForm.new_password !== passwordForm.confirm_password) {
      errors.confirm_password = "Passwords do not match.";
    }
    return errors;
  };

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
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to change password");

      setIsPasswordModalOpen(false);
      showMessage("Password changed successfully.");
    } catch (err) {
      showMessage(err.message || "Password change failed.", "error");
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

  const roleDisplay = user.role === "team_lead"
    ? "Team Lead"
    : user.role.charAt(0).toUpperCase() + user.role.slice(1);

  return (
    <DashboardLayout hideRightSidebar={true}>
      <div className="user-profile-page">
        <div className="profile-header">
          <h1>My Profile</h1>
          <p>View and manage your personal information and account settings.</p>
        </div>

        {message && <div className={`profile-message ${messageType}`}>{message}</div>}

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
                </div>
              </div>
            </div>

            {/* Personal Information */}
            <div className="profile-info-card">
              <div className="info-card-header">
                <h3>Personal Information</h3>
                <button className="btn-edit" onClick={openPasswordModal}>
                  <MdEdit size={16} /> Edit
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
                  <span className="info-value">{roleDisplay}</span>
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

        {/* PASSWORD CHANGE MODAL */}
        {isPasswordModalOpen && (
          <div className="user-modal-overlay" onClick={() => setIsPasswordModalOpen(false)}>
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
                <div className="user-form-grid" style={{ gridTemplateColumns: "1fr" }}>
                  <div className="form-row">
                    <label htmlFor="old-password">Current Password</label>
                    <input
                      type="password"
                      id="old-password"
                      name="old_password"
                      value={passwordForm.old_password}
                      onChange={handlePasswordChange}
                      placeholder="Enter current password"
                      className={passwordErrors.old_password ? "field-error" : ""}
                    />
                    {passwordErrors.old_password && <span className="field-error-text">{passwordErrors.old_password}</span>}
                  </div>
                  <div className="form-row">
                    <label htmlFor="new-password">New Password</label>
                    <input
                      type="password"
                      id="new-password"
                      name="new_password"
                      value={passwordForm.new_password}
                      onChange={handlePasswordChange}
                      placeholder="Enter new password"
                      className={passwordErrors.new_password ? "field-error" : ""}
                    />
                    {passwordErrors.new_password && <span className="field-error-text">{passwordErrors.new_password}</span>}
                  </div>
                  <div className="form-row">
                    <label htmlFor="confirm-password">Confirm New Password</label>
                    <input
                      type="password"
                      id="confirm-password"
                      name="confirm_password"
                      value={passwordForm.confirm_password}
                      onChange={handlePasswordChange}
                      placeholder="Confirm new password"
                      className={passwordErrors.confirm_password ? "field-error" : ""}
                    />
                    {passwordErrors.confirm_password && <span className="field-error-text">{passwordErrors.confirm_password}</span>}
                  </div>
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
                    disabled={saving}
                  >
                    {saving ? "Saving..." : "Change Password"}
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

export default MyProfile;
