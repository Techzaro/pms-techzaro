/**
 * ProfileModal.jsx
 * Modal dialog for viewing user profile information and changing password.
 * Displays read-only user details (name, email, role) and provides a
 * password change form with validation.
 */

import { useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import API_URL from "../config/api";
import { authToken } from "../utils/auth";
import { useEscapeKey } from "../hooks/useEscapeKey";
import useConfirmOnClose from "../hooks/useConfirmOnClose";
import { notify, showSuccessMessage } from "../utils/notify";
import "../components/ProfileModal.css";

/**
 * Profile modal showing user info and password change form.
 * @param {Object} user - The current user object (name, email, role).
 * @param {Function} onClose - Callback to close the modal.
 */
function ProfileModal({
  user,
  onClose,
}) {
  const { t } = useTranslation();
  const { isDirty, setIsDirty, handleClose, ConfirmDialog } = useConfirmOnClose(onClose);
  useEscapeKey(true, handleClose);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);

  /**
   * Validates and submits the password change request.
   * Shows error if fields are empty or passwords don't match.
   */
  const handlePasswordChange = async () => {
    if (!newPassword || !confirmPassword) {
      notify.error(t("Please enter and confirm your password.", { defaultValue: "Please enter and confirm your password." }));
      return;
    }

    if (newPassword !== confirmPassword) {
      notify.error(t("Password confirmation does not match", { defaultValue: "Password confirmation does not match" }));
      return;
    }

    setSaving(true);
    try {
      const token = authToken();
      const response = await fetch(
        `${API_URL}/user/change-password`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            password: newPassword,
          }),
          _notifHandled: true,
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message || t("Failed to change password", { defaultValue: "Failed to change password" })
        );
      }

      showSuccessMessage(t("Password", { defaultValue: "Password" }), t("changed", { defaultValue: "changed" }));
      onClose();
    } catch (error) {
      console.error(error);
      notify.error(error.message || t("Failed to change password.", { defaultValue: "Failed to change password." }));
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="profile-overlay">
      <div
        className="profile-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="profile-header">
          <div className="profile-user">
            <div className="profile-avatar">
              👤
            </div>
            <div>
              <h2>{user.name}</h2>
              <p>{user.email}</p>
            </div>
          </div>
        </div>

        <div className="profile-body">
          <div className="profile-field">
            <label>{t("Name", { defaultValue: "Name" })}</label>
            <input
              type="text"
              value={user.name}
              readOnly
            />
          </div>

          <div className="profile-field">
            <label>{t("Email", { defaultValue: "Email" })}</label>
            <input
              type="email"
              value={user.email}
              readOnly
            />
          </div>

          <div className="profile-field">
            <label>{t("Role", { defaultValue: "Role" })}</label>
            <input
              type="text"
              value={user.role}
              readOnly
            />
          </div>

          <div className="profile-field">
            <label>{t("New Password", { defaultValue: "New Password" })}</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => {
                setNewPassword(e.target.value);
                setIsDirty(true);
              }}
              placeholder={t("Enter new password", { defaultValue: "Enter new password" })}
            />
          </div>

          <div className="profile-field">
            <label>{t("Confirm Password", { defaultValue: "Confirm Password" })}</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                setIsDirty(true);
              }}
              placeholder={t("Confirm password", { defaultValue: "Confirm password" })}
            />
          </div>
        </div>

        <div className="profile-footer">
          <button
            className="change-btn"
            onClick={handlePasswordChange}
            disabled={saving}
          >
            {saving ? t("Changing...", { defaultValue: "Changing..." }) : t("Change Password", { defaultValue: "Change Password" })}
          </button>

          <button
            className="close-btn"
            onClick={handleClose}
          >
            {t("Close", { defaultValue: "Close" })}
          </button>
        </div>
      </div>

      {ConfirmDialog}
    </div>,
    document.body
  );
}

export default ProfileModal;