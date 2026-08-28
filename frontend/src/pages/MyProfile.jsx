/**
 * MyProfile page component.
 *
 * Displays the currently logged-in user's profile information including
 * personal details, employment data, email addresses, uploaded documents
 * and account status.  Provides an inline password-change modal so the
 * user can update their credentials without leaving the page.
 */

import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { createPortal } from "react-dom";
import { useNavigate, useSearchParams } from "react-router-dom";
import { MdEdit } from "react-icons/md";
import { Eye } from "lucide-react";
import DashboardLayout from "../components/layout/DashboardLayout";
import Breadcrumb from "../components/Breadcrumb";
import API_URL from "../config/api";
import { useEscapeKey } from "../hooks/useEscapeKey";
import useConfirmOnClose from "../hooks/useConfirmOnClose";
import { authToken, getCurrentRole, getUser, setUser, normalizeRole } from "../utils/auth";
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

/** Formats raw phone digits for display: 03XX-XXXXXXX */
const displayPhone = (value) => {
  if (!value) return "---";
  const digits = value.replace(/\D/g, "");
  if (digits.length <= 4) return digits;
  return digits.slice(0, 4) + "-" + digits.slice(4);
};

/** Formats raw CNIC digits for display: XXXXX-XXXXXXX-X */
const displayCNIC = (value) => {
  if (!value) return "---";
  const digits = value.replace(/\D/g, "");
  if (digits.length <= 5) return digits;
  if (digits.length <= 12) return digits.slice(0, 5) + "-" + digits.slice(5);
  return digits.slice(0, 5) + "-" + digits.slice(5, 12) + "-" + digits.slice(12);
};

/** Formats date string to display format without timezone issues */
const displayDate = (dateStr) => {
  if (!dateStr) return "---";
  const parts = dateStr.substring(0, 10).split("-");
  if (parts.length !== 3) return dateStr;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${parseInt(parts[2])} ${months[parseInt(parts[1]) - 1]} ${parts[0]}`;
};

/**
 * MyProfile — self-service profile page for the logged-in user.
 * Fetches profile data on mount and renders read-only sections with a
 * password-change modal.
 */
function MyProfile() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
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
  const [companyDocs, setCompanyDocs] = useState({});

  const {
    hasUnread: myHasUnread,
    isItemUnread: isMyItemUnread,
    markViewed: markMyViewed,
  } = useActivityHighlight("user", profileData?.user?.id, profileData?.activity_max_id || 0, changes);

  const { isDirty: passwordIsDirty, setIsDirty: setPasswordIsDirty, handleClose: handlePasswordClose, ConfirmDialog: PasswordConfirmDialog } = useConfirmOnClose(() => {
    setIsPasswordModalOpen(false);
    setPasswordIsDirty(false);
  });
  useEscapeKey(isPasswordModalOpen, handlePasswordClose);

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
      if (!res.ok) throw new Error(t("Unable to load profile", { defaultValue: "Unable to load profile" }));
      const data = await res.json();
      setProfileData(data);

      if (data?.user) {
        const stored = getUser();
        if (stored) {
          setUser(stored.role || getCurrentRole(), { ...stored, avatar: data.user.avatar || null });
          window.dispatchEvent(new Event("user-updated"));
        }
      }
    } catch (err) {
      setError(err.message || t("Failed to load profile", { defaultValue: "Failed to load profile" }));
    } finally {
      setLoading(false);
    }
  };

  const fetchChanges = async () => {
    try {
      const res = await fetch(`${API_URL}/auth/my-changes`, {
        headers: { Accept: "application/json", ...authHeaders() },
        skipLoader: true,
      });
      const data = await res.json();
      if (data.success) setChanges(data.changes || []);
    } catch { }
  };

  useEffect(() => {
    const token = authToken();
    if (!token) {
      navigate("/");
      return;
    }
    const fetchCompanyDocs = async () => {
      try {
        const res = await fetch(`${API_URL}/company-documents`, {
          headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
          skipLoader: true,
        });
        if (res.ok) {
          const data = await res.json();
          setCompanyDocs(data.documents || {});
        }
      } catch { }
    };
    Promise.all([fetchProfile(), fetchChanges(), fetchCompanyDocs()]);
  }, [navigate]);

  useEffect(() => {
    if (searchParams.get("openPassword") === "true") {
      setIsPasswordModalOpen(true);
      searchParams.delete("openPassword");
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

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
    setPasswordIsDirty(false);
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
    if (!passwordForm.old_password) {
      errors.old_password = t("Please enter current password.", { defaultValue: "Please enter current password." });
    }
    if (!passwordForm.new_password) {
      errors.new_password = t("Please enter new password.", { defaultValue: "Please enter new password." });
    } else if (!isPasswordValid(passwordForm.new_password)) {
      errors.new_password = t("Password does not meet all requirements.", { defaultValue: "Password does not meet all requirements." });
    } else if (passwordForm.old_password && passwordForm.new_password === passwordForm.old_password) {
      errors.new_password = t("New password must be different from current password.", { defaultValue: "New password must be different from current password." });
    }
    if (!passwordForm.confirm_password) {
      errors.confirm_password = t("Please confirm your password.", { defaultValue: "Please confirm your password." });
    }
    return errors;
  };

  const canSubmitPassword = Boolean(
    passwordForm.old_password &&
    passwordForm.new_password &&
    passwordForm.confirm_password
  );

  /** Submit the password change to the API. */
  const handlePasswordSubmit = async (e) => {
    e.preventDefault();

    const errors = validatePasswordForm();
    setPasswordErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/user/change-password`, {
        method: "PUT",
        headers: { Accept: "application/json", ...authHeaders() },
        body: JSON.stringify({
          old_password: passwordForm.old_password,
          new_password: passwordForm.new_password,
          confirm_password: passwordForm.confirm_password,
        }),
        _notifHandled: true,
      });

      const data = await res.json();
      if (!res.ok) {
        const errObj = {};
        if (data.errors) {
          if (data.errors.old_password) errObj.old_password = data.errors.old_password;
          if (data.errors.confirm_password) errObj.confirm_password = data.errors.confirm_password;
          if (data.errors.new_password) errObj.new_password = data.errors.new_password;
        }

        let msg = data.message || t("Failed to change password", { defaultValue: "Failed to change password" });
        if (msg.toLowerCase().includes("current password") || msg.toLowerCase().includes("old_password") || msg.toLowerCase().includes("incorrect")) {
          if (!errObj.old_password) errObj.old_password = t("Current password is incorrect.", { defaultValue: "Current password is incorrect." });
        }
        if (msg.toLowerCase().includes("confirm") || msg.toLowerCase().includes("match")) {
          if (!errObj.confirm_password) errObj.confirm_password = t("Password confirmation does not match", { defaultValue: "Password confirmation does not match" });
        }

        if (Object.keys(errObj).length > 0) {
          setPasswordErrors(errObj);
          return;
        }
        throw new Error(msg);
      }

      setIsPasswordModalOpen(false);
      showSuccessMessage("Password", "changed");
    } catch (err) {
      if (err.message) {
        if (err.message.toLowerCase().includes("current password") || err.message.toLowerCase().includes("incorrect")) {
          setPasswordErrors((prev) => ({ ...prev, old_password: t("Current password is incorrect.", { defaultValue: "Current password is incorrect." }) }));
        } else if (err.message.toLowerCase().includes("confirm") || err.message.toLowerCase().includes("match")) {
          setPasswordErrors((prev) => ({ ...prev, confirm_password: t("Password confirmation does not match", { defaultValue: "Password confirmation does not match" }) }));
        } else {
          notify.error(err.message);
        }
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout hideRightSidebar={true}>
        <div className="user-profile-page">
          <div className="profile-loading">{t("Loading profile...", { defaultValue: "Loading profile..." })}</div>
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
              {t("Go Back", { defaultValue: "Go Back" })}
            </button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const { user, account } = profileData;

  const roleDisplay = normalizeRole(user.role);

  const breadcrumbs = [
    { label: t("Profile", { defaultValue: "Profile" }) },
  ];

  return (
    <DashboardLayout hideRightSidebar={true}>
      <div className="user-profile-page">
        <div className="profile">
          <div className="profile-layout">
            <Breadcrumb items={breadcrumbs} />
            <div className="profile-header-profile">
              <h1>{t("My Profile", { defaultValue: "My Profile" })}</h1>
              <p>{t("View and manage your personal information and account settings.", { defaultValue: "View and manage your personal information and account settings." })}</p>
            </div>
            {/* LEFT SIDE */}
            <div className="profile-left">
              {/* User Card */}
              <div className="profile-top-row">
                <div className="profile-user-card">
                  <div className="profile-user-left">
                    <div className="profile-avatar">
                      {user.avatar ? (
                        <img src={`${API_URL.replace('/api', '')}/storage/${user.avatar}`} alt={user.name} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                      ) : (
                        getInitials(user.name)
                      )}
                    </div>
                    <div className="profile-user-info">
                      <h2>{user.name}</h2>
                      <span className="profile-designation">{user.designation || roleDisplay}</span>
                    </div>
                  </div>
                </div>
                <div className="profile-avatar-center">
                  <div className="profile-avatar-large">
                    {user.avatar ? (
                      <img src={`${API_URL.replace('/api', '')}/storage/${user.avatar}`} alt={user.name} />
                    ) : (
                      getInitials(user.name)
                    )}
                  </div>
                </div>
              </div>

              {/* Personal Information */}
              <div className="profile-info-card">
                <div className="info-card-header">
                  <h3>{t("Personal Information", { defaultValue: "Personal Information" })}</h3>
                  <button className="btn-edit" onClick={openPasswordModal}>
                    <MdEdit size={16} /> {t("Update Password", { defaultValue: "Update Password" })}
                  </button>
                </div>
                <div className="info-card-body">
                  {user.role === "guest" ? (
                    <>
                      <div className="info-row">
                        <span className="info-label">{t("Client Name", { defaultValue: "Client Name" })}</span>
                        <span className="info-value">{user.name || "---"}</span>
                      </div>
                      <div className="info-row">
                        <span className="info-label">{t("Email", { defaultValue: "Email" })}</span>
                        <span className="info-value">{user.personal_email || user.email || "---"}</span>
                      </div>
                      <div className="info-row">
                        <span className="info-label">{t("Phone", { defaultValue: "Phone" })}</span>
                        <span className="info-value">{displayPhone(user.phone_number || user.contact_no)}</span>
                      </div>
                      {user.company_name && (
                        <div className="info-row">
                          <span className="info-label">{t("Company Name", { defaultValue: "Company Name" })}</span>
                          <span className="info-value">{user.company_name}</span>
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="info-row">
                        <span className="info-label">{t("Full Name", { defaultValue: "Full Name" })}</span>
                        <span className="info-value">{user.name || "---"}</span>
                      </div>
                      <div className="info-row">
                        <span className="info-label">{t("Father Name", { defaultValue: "Father Name" })}</span>
                        <span className="info-value">{user.father_name || "---"}</span>
                      </div>
                      <div className="info-row">
                        <span className="info-label">{t("ID Card Number", { defaultValue: "ID Card Number" })}</span>
                        <span className="info-value">{displayCNIC(user.id_card_number)}</span>
                      </div>
                      <div className="info-row">
                        <span className="info-label">{t("Phone Number", { defaultValue: "Phone Number" })}</span>
                        <span className="info-value">{displayPhone(user.phone_number || user.contact_no)}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Address - hidden for guests */}
              {user.role !== "guest" && (
              <div className="profile-info-card">
                <div className="info-card-header">
                  <h3>{t("Address", { defaultValue: "Address" })}</h3>
                </div>
                <div className="info-card-body">
                  <div className="info-row">
                    <span className="info-label">{t("Present Address", { defaultValue: "Present Address" })}</span>
                    <span className="info-value">{user.present_address || user.address || "---"}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">{t("Permanent Address", { defaultValue: "Permanent Address" })}</span>
                    <span className="info-value">{user.permanent_address || "---"}</span>
                  </div>
                </div>
              </div>
              )}

              {/* Emergency Contact - hidden for guests */}
              {user.role !== "guest" && (
              <div className="profile-info-card">
                <div className="info-card-header">
                  <h3>{t("Emergency Contact", { defaultValue: "Emergency Contact" })}</h3>
                </div>
                <div className="info-card-body">
                  <div className="info-row">
                    <span className="info-label">{t("Name", { defaultValue: "Name" })}</span>
                    <span className="info-value">{user.emergency_contact_name || "---"}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">{t("Relation", { defaultValue: "Relation" })}</span>
                    <span className="info-value">{user.emergency_contact_relation || "---"}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">{t("Phone", { defaultValue: "Phone" })}</span>
                    <span className="info-value">{displayPhone(user.emergency_contact_phone)}</span>
                  </div>
                </div>
              </div>
              )}

              {/* Email Accounts - hidden for guests */}
              {user.role !== "guest" && (
              <div className="profile-info-card">
                <div className="info-card-header">
                  <h3>{t("Email Accounts", { defaultValue: "Email Accounts" })}</h3>
                </div>
                <div className="info-card-body">
                  <div className="info-row">
                    <span className="info-label">{t("Personal Email", { defaultValue: "Personal Email" })}</span>
                    <span className="info-value">{user.personal_email || "---"}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">{t("Professional Email", { defaultValue: "Professional Email" })}</span>
                    <span className="info-value">{user.professional_email || "---"}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">{t("Password of Professional Email", { defaultValue: "Password of Professional Email" })}</span>
                    <span className="info-value" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {user.professional_email_password ? (showProfPassword ? user.professional_email_password : "********") : "---"}
                      {user.professional_email_password && (
                        <button type="button" onClick={() => setShowProfPassword(!showProfPassword)} style={{ background: 'none', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '2px 8px', cursor: 'pointer', fontSize: '12px', color: 'var(--text-secondary)' }}>
                          {showProfPassword ? t("Hide", { defaultValue: "Hide" }) : t("Show", { defaultValue: "Show" })}
                        </button>
                      )}
                    </span>
                  </div>
                </div>
              </div>
              )}

              {/* Employment Details - hidden for guests */}
              {user.role !== "guest" && (
              <div className="profile-info-card">
                <div className="info-card-header">
                  <h3>{t("Employment Details", { defaultValue: "Employment Details" })}</h3>
                </div>
                <div className="info-card-body">
                  {user.company_name && (
                    <div className="info-row">
                      <span className="info-label">{t("Company Name", { defaultValue: "Company Name" })}</span>
                      <span className="info-value">{user.company_name}</span>
                    </div>
                  )}
                  <div className="info-row">
                    <span className="info-label">{t("Designation", { defaultValue: "Designation" })}</span>
                    <span className="info-value">{user.designation || "---"}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">{t("Department", { defaultValue: "Department" })}</span>
                    <span className="info-value">{user.department || "---"}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">{t("Hired For", { defaultValue: "Hired For" })}</span>
                    <span className="info-value">{user.hired_for || "---"}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">{t("Employee Code", { defaultValue: "Employee Code" })}</span>
                    <span className="info-value">{user.employee_code || "---"}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">{t("Role", { defaultValue: "Role" })}</span>
                    <span className="info-value">{roleDisplay}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">{t("Job Started Date", { defaultValue: "Job Started Date" })}</span>
                    <span className="info-value">{displayDate(user.job_started_date)}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">{t("Job Ended Date", { defaultValue: "Job Ended Date" })}</span>
                    <span className="info-value">{displayDate(user.job_ended_date)}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">{t("Applied Via", { defaultValue: "Applied Via" })}</span>
                    <span className="info-value">{user.applied_via || "---"}</span>
                  </div>
                </div>
              </div>
              )}

              {/* Salary & Bank Details - hidden for guests */}
              {user.role !== "guest" && (
              <div className="profile-info-card">
                <div className="info-card-header">
                  <h3>{t("Salary & Bank Details", { defaultValue: "Salary & Bank Details" })}</h3>
                </div>
                <div className="info-card-body">
                  <div className="info-row">
                    <span className="info-label">{t("Gross Salary", { defaultValue: "Gross Salary" })}</span>
                    <span className="info-value">{user.gross_salary || "---"}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">{t("Bank Name", { defaultValue: "Bank Name" })}</span>
                    <span className="info-value">{user.bank_name || "---"}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">{t("Bank Account Number", { defaultValue: "Bank Account Number" })}</span>
                    <span className="info-value">{user.bank_account_number || "---"}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">{t("Bank Account Title", { defaultValue: "Bank Account Title" })}</span>
                    <span className="info-value">{user.bank_account_title || "---"}</span>
                  </div>
                </div>
              </div>
              )}

              {/* Documents - hidden for guests */}
              {user.role !== "guest" && (
              <div className="profile-info-card">
                <div className="info-card-header">
                  <h3>{t("Documents", { defaultValue: "Documents" })}</h3>
                </div>
                <div className="info-card-body">
                  {[
                    { label: t("Employment Contract", { defaultValue: "Employment Contract" }), key: "employment_contract" },
                    { label: t("Offer Letter", { defaultValue: "Offer Letter" }), key: "offer_letter" },
                    { label: t("Techxaro Regulations", { defaultValue: "Techxaro Regulations" }), key: "techxaro_regulations" },
                  ].map(({ label, key }) => (
                    <div className="info-row" key={key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span className="info-label">{label}</span>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", flex: 1 }}>
                        {user[key] ? (
                          <a
                            href={`${API_URL}/auth/my-documents/${key}?token=${authToken()}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ background: "var(--color-primary)", border: "none", color: "#fff", cursor: "pointer", padding: "6px 9px", borderRadius: 8, display: "inline-flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}
                            title={t("View", { defaultValue: "View" })}
                          >
                            <Eye size={16} />
                          </a>
                        ) : <span style={{ color: "var(--text-secondary)" }}>---</span>}
                      </div>
                    </div>
                  ))}
                  {(() => {
                    let docs = [];
                    try {
                      docs = typeof user.other_document === "string" ? JSON.parse(user.other_document) : (user.other_document || []);
                    } catch { docs = []; }
                    if (!Array.isArray(docs)) docs = [];
                    if (docs.length === 0) {
                      return (
                        <div className="info-row">
                          <span className="info-label">{t("Other Documents", { defaultValue: "Other Documents" })}</span>
                          <span className="info-value">---</span>
                        </div>
                      );
                    }
                    return docs.map((doc, i) => {
                      const docPath = typeof doc === "string" ? doc : doc.path;
                      const docName = typeof doc === "object" && doc.name ? doc.name : docPath.split("/").pop().replace(/^other_document_\d+_\d+_/, "").replace(/\.[^.]+$/, "");
                      const isImage = /\.(png|jpe?g|gif|bmp|webp|svg|tiff)$/i.test(docName);
                      return (
                        <div className="info-row" key={`other-${i}`} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <span className="info-label">{docName}</span>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", flex: 1 }}>
                            <a
                              href={`${API_URL}/auth/my-documents/other_document?token=${authToken()}&file=${encodeURIComponent(docPath)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ background: "var(--color-primary)", border: "none", color: "#fff", cursor: "pointer", padding: "6px 9px", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}
                              title={t("View", { defaultValue: "View" })}
                            >
                              <Eye size={16} />
                            </a>
                          </div>
                        </div>
                      );
                    });
                  })()}
                  {companyDocs?.company_logo?.exists && (
                    <div className="info-row" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span className="info-label">{t("Company Logo", { defaultValue: "Company Logo" })}</span>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", flex: 1 }}>
                        <a
                          href={`${API_URL.replace("/api", "")}/storage/${companyDocs.company_logo.path}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ background: "var(--color-primary)", border: "none", color: "#fff", cursor: "pointer", padding: "6px 9px", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}
                          title={t("View", { defaultValue: "View" })}
                        >
                          <Eye size={16} />
                        </a>
                      </div>
                    </div>
                  )}
                  {companyDocs?.qr_code?.exists && (
                    <div className="info-row" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span className="info-label">{t("QR Code", { defaultValue: "QR Code" })}</span>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", flex: 1 }}>
                        <a
                          href={`${API_URL.replace("/api", "")}/storage/${companyDocs.qr_code.path}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ background: "var(--color-primary)", border: "none", color: "#fff", cursor: "pointer", padding: "6px 9px", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}
                          title={t("View", { defaultValue: "View" })}
                        >
                          <Eye size={16} />
                        </a>
                      </div>
                    </div>
                  )}
                  {companyDocs?.other_documents?.files?.map((file, i) => {
                    const fileName = file.filename.replace(/^other_document_\d+_/, "").replace(/\.[^.]+$/, "");
                    return (
                      <div className="info-row" key={`company-${i}`} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span className="info-label">{fileName}</span>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", flex: 1 }}>
                          <a
                            href={`${API_URL.replace("/api", "")}/storage/${file.path}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ background: "var(--color-primary)", border: "none", color: "#fff", cursor: "pointer", padding: "6px 9px", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}
                            title={t("View", { defaultValue: "View" })}
                          >
                            <Eye size={16} />
                          </a>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              )}
            </div>
          </div>
     
          {/* RIGHT SIDE - Account Status */}
          <div className="profile-right">
            <div className="account-status-card">
              <h3>{t("Account Status", { defaultValue: "Account Status" })}</h3>
              <div className="status-list">
                <div className="status-item">
                  {(() => {
                    const st = String(user?.status || (user?.active ? "Active" : "Resigned")).toLowerCase();
                    const colorClass = st === "resigned" ? "text-red-500" : st === "inactive" ? "text-yellow-500" : "text-green-500";
                    const colorStyle = st === "resigned" ? "#ef4444" : st === "inactive" ? "#f59e0b" : "#10b981";
                    const label = st === "resigned" ? t("Resigned", { defaultValue: "Resigned" }) : st === "inactive" ? t("Inactive", { defaultValue: "Inactive" }) : t("Active", { defaultValue: "Active" });
                    return (
                      <>
                        <span className={`status-dot ${st === "active" ? "dot-active" : "dot-inactive"}`} style={{ backgroundColor: colorStyle }}></span>
                        <span className={`status-text ${colorClass}`} style={{ color: colorStyle, fontWeight: 600 }}>
                          {label}
                        </span>
                      </>
                    );
                  })()}
                </div>
                <div className="status-item">
                  <span className="status-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                  </span>
                  <div className="status-info">
                    <span className="status-label">{t("Member Since", { defaultValue: "Member Since" })}</span>
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
                    <span className="status-label">{t("Last Login", { defaultValue: "Last Login" })}</span>
                    <span className="status-value">
                      {user.last_login_at
                        ? new Date(user.last_login_at).toLocaleString("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                          hour12: true,
                        })
                        : t("Never logged in", { defaultValue: "Never logged in" })}
                    </span>
                  </div>
                </div>
                <div className="status-item">
                  <span className="status-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 21h18"></path><path d="M9 8h1"></path><path d="M9 12h1"></path><path d="M9 16h1"></path><path d="M14 8h1"></path><path d="M14 12h1"></path><path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16"></path></svg>
                  </span>
                  <div className="status-info">
                    <span className="status-label">{t("Account Type", { defaultValue: "Account Type" })}</span>
                    <span className="status-value">{t("Employee", { defaultValue: "Employee" })}</span>
                  </div>
                </div>
              </div>
            </div>
            {/* Activity section hidden for now */}
          </div>

        </div>
      </div>

      {isPasswordModalOpen && createPortal(
        <div className="user-modal-overlay">
          <div
            className="user-modal-content"
            style={{ maxWidth: "480px", width: "100%" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="user-modal-header">
              <div>
                <h2>{t("Change Password", { defaultValue: "Change Password" })}</h2>
                <p className="modal-subtitle">{t("Update your account password.", { defaultValue: "Update your account password." })}</p>
              </div>
              <button className="user-modal-close" onClick={handlePasswordClose}>
                &#10005;
              </button>
            </div>

            <form className="user-form" onSubmit={handlePasswordSubmit}>
              <div className="user-form-grid" style={{ gridTemplateColumns: "1fr", gap: "12px" }}>
                <div className="form-row" style={{ position: "relative" }}>
                  <label htmlFor="old-password">{t("Current Password", { defaultValue: "Current Password" })}</label>
                  <div style={{ position: "relative" }}>
                    <svg style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                    <input
                      type={showCurrentPassword ? "text" : "password"}
                      id="old-password"
                      name="old_password"
                      value={passwordForm.old_password}
                      onChange={(e) => { handlePasswordChange(e); setPasswordIsDirty(true); }}
                      placeholder={t("Enter current password", { defaultValue: "Enter current password" })}
                      className={passwordErrors.old_password ? "field-error" : ""}
                      style={{ width: "100%", padding: "8px 36px 8px 32px", border: "1px solid var(--border-color)", borderRadius: "6px", fontSize: "14px", outline: "none", boxSizing: "border-box" }}
                    />
                    <button type="button" onClick={() => setShowCurrentPassword(!showCurrentPassword)} style={{ position: "absolute", right: "8px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", padding: "2px", display: "flex", alignItems: "center" }} tabIndex={-1}>
                      {showCurrentPassword ? (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
                      ) : (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                      )}
                    </button>
                  </div>
                  {passwordErrors.old_password && <span className="field-error-text">{passwordErrors.old_password}</span>}
                </div>

                <PasswordInput
                  id="new-password"
                  name="new_password"
                  value={passwordForm.new_password}
                  onChange={(e) => { handlePasswordChange(e); setPasswordIsDirty(true); }}
                  placeholder={t("Enter new password", { defaultValue: "Enter new password" })}
                  label={t("New Password", { defaultValue: "New Password" })}
                  error={passwordErrors.new_password}
                />

                <PasswordInput
                  id="confirm-password"
                  name="confirm_password"
                  value={passwordForm.confirm_password}
                  onChange={(e) => { handlePasswordChange(e); setPasswordIsDirty(true); }}
                  placeholder={t("Confirm new password", { defaultValue: "Confirm new password" })}
                  label={t("Confirm New Password", { defaultValue: "Confirm New Password" })}
                  showStrength={false}
                  showRules={false}
                  error={passwordErrors.confirm_password}
                />
              </div>

              <div className="user-form-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={handlePasswordClose}
                >
                  {t("Cancel", { defaultValue: "Cancel" })}
                </button>
                <button
                  type="submit"
                  className="primary-button"
                  disabled={saving || !canSubmitPassword}
                >
                  {saving ? t("Saving...", { defaultValue: "Saving..." }) : t("Change Password", { defaultValue: "Change Password" })}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
      {PasswordConfirmDialog}
    </DashboardLayout>
  );
}

export default MyProfile;
