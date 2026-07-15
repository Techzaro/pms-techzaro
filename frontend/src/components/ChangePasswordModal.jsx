import { useState } from "react";
import { createPortal } from "react-dom";
import { useEscapeKey } from "../hooks/useEscapeKey";
import useConfirmOnClose from "../hooks/useConfirmOnClose";
import API_URL from "../config/api";
import { authToken } from "../utils/auth";
import { notify, showSuccessMessage } from "../utils/notify";

const REQUIREMENTS = [
  { label: "At least 8 characters", test: (v) => v.length >= 8 },
  { label: "One uppercase letter", test: (v) => /[A-Z]/.test(v) },
  { label: "One lowercase letter", test: (v) => /[a-z]/.test(v) },
  { label: "One number", test: (v) => /[0-9]/.test(v) },
  { label: "One special character (@#$%*?&#)", test: (v) => /[@#$%*?&#]/.test(v) },
];

export default function ChangePasswordModal({ onClose }) {
  const { isDirty, setIsDirty, handleClose, ConfirmDialog } = useConfirmOnClose(onClose);
  useEscapeKey(true, handleClose);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);

  const allValid = REQUIREMENTS.every((r) => r.test(newPassword));

  const handleSubmit = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
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
      const res = await fetch(`${API_URL}/user/change-password`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ current_password: currentPassword, password: newPassword }),
        _notifHandled: true,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to change password");
      showSuccessMessage("Password", "changed");
      onClose();
    } catch (err) {
      notify.error(err.message || "Failed to change password.");
    } finally {
      setLoading(false);
    }
  };

  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 10010, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.4)" }} onClick={handleClose}>
      <div style={{ background: "#fff", borderRadius: 16, padding: "28px 30px 24px", width: 440, maxWidth: "92vw", boxShadow: "0 25px 60px rgba(0,0,0,0.25)", maxHeight: "90vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#111827" }}>Change Password</h2>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "#6b7280" }}>Update your account password.</p>
          </div>
          <button onClick={handleClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "#9ca3af", fontSize: 20, lineHeight: 1, flexShrink: 0 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
        </div>

        <hr style={{ border: "none", borderTop: "1px solid #e5e7eb", margin: "12px 0 20px" }} />

        {/* Current Password */}
        <div style={{ marginBottom: 18 }}>
          <label style={{ display: "block", fontSize: 14, fontWeight: 600, color: "#111827", marginBottom: 6 }}>Current Password</label>
          <div style={{ position: "relative" }}>
            <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#9ca3af", fontSize: 14 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            </span>
            <input type={showCurrent ? "text" : "password"} value={currentPassword} onChange={(e) => { setCurrentPassword(e.target.value); setIsDirty(true); }} placeholder="Enter current password" style={{ width: "100%", padding: "10px 40px 10px 36px", border: "1px solid #d1d5db", borderRadius: 10, fontSize: 14, outline: "none", boxSizing: "border-box", color: "#111827" }} />
            <button type="button" onClick={() => setShowCurrent(!showCurrent)} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#9ca3af", padding: 2 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{showCurrent ? (<><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></>) : (<><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>)}</svg>
            </button>
          </div>
        </div>

        {/* New Password */}
        <div style={{ marginBottom: 10 }}>
          <label style={{ display: "block", fontSize: 14, fontWeight: 600, color: "#111827", marginBottom: 6 }}>New Password</label>
          <div style={{ position: "relative" }}>
            <input type={showNew ? "text" : "password"} value={newPassword} onChange={(e) => { setNewPassword(e.target.value); setIsDirty(true); }} placeholder="Enter new password" style={{ width: "100%", padding: "10px 40px 10px 12px", border: "1px solid #d1d5db", borderRadius: 10, fontSize: 14, outline: "none", boxSizing: "border-box", color: "#111827" }} />
            <button type="button" onClick={() => setShowNew(!showNew)} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#9ca3af", padding: 2 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{showNew ? (<><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></>) : (<><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>)}</svg>
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
        <div style={{ marginBottom: 24 }}>
          <label style={{ display: "block", fontSize: 14, fontWeight: 600, color: "#111827", marginBottom: 6 }}>Confirm New Password</label>
          <div style={{ position: "relative" }}>
            <input type={showConfirm ? "text" : "password"} value={confirmPassword} onChange={(e) => { setConfirmPassword(e.target.value); setIsDirty(true); }} placeholder="Confirm new password" style={{ width: "100%", padding: "10px 40px 10px 12px", border: "1px solid #d1d5db", borderRadius: 10, fontSize: 14, outline: "none", boxSizing: "border-box", color: "#111827" }} />
            <button type="button" onClick={() => setShowConfirm(!showConfirm)} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#9ca3af", padding: 2 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{showConfirm ? (<><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></>) : (<><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>)}</svg>
            </button>
          </div>
        </div>

        {/* Buttons */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button onClick={handleClose} style={{ padding: "10px 22px", borderRadius: 10, border: "1px solid #d1d5db", background: "#fff", color: "#374151", fontWeight: 600, fontSize: 14, cursor: "pointer", transition: "all 0.15s" }} onMouseEnter={(e) => e.target.style.background = "#f9fafb"} onMouseLeave={(e) => e.target.style.background = "#fff"}>Cancel</button>
          <button onClick={handleSubmit} disabled={loading} style={{ padding: "10px 22px", borderRadius: 10, border: "none", background: "#2563eb", color: "#fff", fontWeight: 600, fontSize: 14, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1, transition: "all 0.15s" }} onMouseEnter={(e) => { if (!loading) e.target.style.background = "#1d4ed8"; }} onMouseLeave={(e) => e.target.style.background = "#2563eb"}>Change Password</button>
        </div>
      </div>
      {ConfirmDialog}
    </div>,
    document.body
  );
}
