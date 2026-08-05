import { useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { useEscapeKey } from "../hooks/useEscapeKey";
import useUnsavedChanges from "../hooks/useUnsavedChanges";
import API_URL from "../config/api";
import { authToken } from "../utils/auth";
import { notify, showSuccessMessage } from "../utils/notify";

const REQUIREMENTS = [
  { label: "At least 8 characters", test: (v) => v.length >= 8 },
  { label: "One uppercase letter", test: (v) => /[A-Z]/.test(v) },
  { label: "One lowercase letter", test: (v) => /[a-z]/.test(v) },
  { label: "One number", test: (v) => /[0-9]/.test(v) },
  { label: "One special character (@$!%*?&#)", test: (v) => /[@$!%*?&#]/.test(v) },
];

/**
 * Admin-only modal for changing another user's password.
 * Includes options for force logout and disabling password recovery.
 */
export default function AdminChangePasswordModal({ user, onClose, onSuccess }) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [forceLogout, setForceLogout] = useState(true);
  const [disableRecovery, setDisableRecovery] = useState(true);
  const [loading, setLoading] = useState(false);

  const initialValues = useMemo(() => ({ newPassword: '', confirmPassword: '', forceLogout: false, disableRecovery: false }), []);
  const currentValues = useMemo(() => ({ newPassword, confirmPassword, forceLogout, disableRecovery }), [newPassword, confirmPassword, forceLogout, disableRecovery]);
  const { isDirty, handleClose, markSaved, ConfirmDialog } = useUnsavedChanges(initialValues, currentValues, onClose);
  useEscapeKey(true, handleClose);

  const allValid = REQUIREMENTS.every((r) => r.test(newPassword));

  const handleSubmit = async () => {
    if (!newPassword || !confirmPassword) {
      notify.error("Please fill in all fields.");
      return;
    }
    if (newPassword !== confirmPassword) {
      notify.error("Passwords do not match.");
      return;
    }
    if (!allValid) {
      notify.error("Password does not meet all requirements.");
      return;
    }

    setLoading(true);
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/users/${user.id}/admin-change-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          new_password: newPassword,
          force_logout: forceLogout,
          disable_recovery: disableRecovery,
        }),
        _notifHandled: true,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to change password");

      showSuccessMessage("Password", "updated");
      if (onSuccess) onSuccess(data);
      markSaved();
      onClose();
    } catch (err) {
      notify.error(err.message || "Failed to change password.");
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = {
    width: "100%",
    padding: "10px 40px 10px 12px",
    border: "1px solid #d1d5db",
    borderRadius: 10,
    fontSize: 14,
    outline: "none",
    boxSizing: "border-box",
    color: "#111827",
  };

  const labelStyle = {
    display: "block",
    fontSize: 14,
    fontWeight: 600,
    color: "#111827",
    marginBottom: 6,
  };

  const EyeIcon = ({ show }) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {show ? (
        <>
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
          <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
          <line x1="1" y1="1" x2="23" y2="23" />
        </>
      ) : (
        <>
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </>
      )}
    </svg>
  );

  return createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10010,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.4)",
      }}
      onClick={handleClose}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 16,
          padding: "28px 30px 24px",
          width: 480,
          maxWidth: "92vw",
          boxShadow: "0 25px 60px rgba(0,0,0,0.25)",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#111827" }}>
              Change Password
            </h2>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "#6b7280" }}>
              Update password for <strong>{user?.name}</strong>
            </p>
          </div>
          <button
            onClick={handleClose}
            style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "#9ca3af", fontSize: 20, lineHeight: 1, flexShrink: 0 }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18" /><path d="m6 6 12 12" />
            </svg>
          </button>
        </div>

        <hr style={{ border: "none", borderTop: "1px solid #e5e7eb", margin: "12px 0 20px" }} />

        {/* Admin Notice */}
        <div style={{
          padding: "12px 14px",
          borderRadius: 10,
          background: "#fef3c7",
          border: "1px solid #fcd34d",
          marginBottom: 20,
          fontSize: 13,
          color: "#92400e",
          display: "flex",
          alignItems: "flex-start",
          gap: 8,
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#92400e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <div>
            <strong>Admin Action</strong> — This will update the user's password.{' '}
            {forceLogout && 'All active sessions will be terminated.'}
            {disableRecovery && ' Password recovery will be disabled.'}
          </div>
        </div>

        {/* New Password */}
        <div style={{ marginBottom: 10 }}>
          <label style={labelStyle}>New Password</label>
          <div style={{ position: "relative" }}>
            <input
              type={showNew ? "text" : "password"}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Enter new password"
              style={inputStyle}
            />
            <button
              type="button"
              onClick={() => setShowNew(!showNew)}
              style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#9ca3af", padding: 2 }}
            >
              <EyeIcon show={showNew} />
            </button>
          </div>
        </div>

        {/* Requirements */}
        <div style={{ marginBottom: 18, padding: "0 0 0 2px" }}>
          {REQUIREMENTS.map((r) => (
            <div key={r.label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: r.test(newPassword) ? "#16a34a" : "#6b7280", marginBottom: 3 }}>
              <span style={{ fontSize: 10 }}>●</span>
              <span>{r.label}</span>
            </div>
          ))}
        </div>

        {/* Confirm Password */}
        <div style={{ marginBottom: 20 }}>
          <label style={labelStyle}>Confirm New Password</label>
          <div style={{ position: "relative" }}>
            <input
              type={showConfirm ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
              style={inputStyle}
            />
            <button
              type="button"
              onClick={() => setShowConfirm(!showConfirm)}
              style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#9ca3af", padding: 2 }}
            >
              <EyeIcon show={showConfirm} />
            </button>
          </div>
        </div>

        {/* Options */}
        <div style={{ marginBottom: 24, display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: 14, color: "#374151" }}>
            <input
              type="checkbox"
              checked={forceLogout}
              onChange={(e) => setForceLogout(e.target.checked)}
              style={{ width: 16, height: 16, accentColor: "#2563eb", cursor: "pointer" }}
            />
            <div>
              <span style={{ fontWeight: 600 }}>Force logout from all devices</span>
              <span style={{ display: "block", fontSize: 12, color: "#6b7280", marginTop: 1 }}>
                Terminates all active sessions for this user
              </span>
            </div>
          </label>

          <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: 14, color: "#374151" }}>
            <input
              type="checkbox"
              checked={disableRecovery}
              onChange={(e) => setDisableRecovery(e.target.checked)}
              style={{ width: 16, height: 16, accentColor: "#2563eb", cursor: "pointer" }}
            />
            <div>
              <span style={{ fontWeight: 600 }}>Disable self password recovery</span>
              <span style={{ display: "block", fontSize: 12, color: "#6b7280", marginTop: 1 }}>
                Prevents the user from using Forgot Password
              </span>
            </div>
          </label>
        </div>

        {/* Buttons */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button
            onClick={handleClose}
            style={{
              padding: "10px 22px",
              borderRadius: 10,
              border: "1px solid #d1d5db",
              background: "#fff",
              color: "#374151",
              fontWeight: 600,
              fontSize: 14,
              cursor: "pointer",
              transition: "all 0.15s",
            }}
            onMouseEnter={(e) => (e.target.style.background = "#f9fafb")}
            onMouseLeave={(e) => (e.target.style.background = "#fff")}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            style={{
              padding: "10px 22px",
              borderRadius: 10,
              border: "none",
              background: "#2563eb",
              color: "#fff",
              fontWeight: 600,
              fontSize: 14,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.7 : 1,
              transition: "all 0.15s",
            }}
            onMouseEnter={(e) => { if (!loading) e.target.style.background = "#1d4ed8"; }}
            onMouseLeave={(e) => (e.target.style.background = "#2563eb")}
          >
            {loading ? "Updating..." : "Update Password"}
          </button>
        </div>
      </div>
      {ConfirmDialog}
    </div>,
    document.body
  );
}
