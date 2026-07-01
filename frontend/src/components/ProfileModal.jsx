/**
 * ProfileModal.jsx
 * Modal dialog for viewing user profile information and changing password.
 * Displays read-only user details (name, email, role) and provides a
 * password change form with validation.
 */

import { useState } from "react";
import { createPortal } from "react-dom";

import API_URL from "../config/api";
import { authToken } from "../utils/auth";
import { useEscapeKey } from "../hooks/useEscapeKey";
import { notify } from "../utils/notify";
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
  useEscapeKey(true, onClose);

  const [newPassword, setNewPassword] =
    useState("");

  const [confirmPassword, setConfirmPassword] =
    useState("");

  /**
   * CHANGE PASSWORD
   */

  /**
   * Validates and submits the password change request.
   * Shows error if fields are empty or passwords don't match.
   */
  const handlePasswordChange = async () => {

    if (!newPassword || !confirmPassword) {

      notify.error("Please enter and confirm your password.");

      return;
    }

    if (newPassword !== confirmPassword) {

      notify.error("Passwords do not match.");

      return;
    }

    try {

      const token = authToken();

      const response = await fetch(
        `${API_URL}/user/change-password`,
        {
          method: "PUT",

          headers: {
            "Content-Type":
              "application/json",

            Accept:
              "application/json",

            Authorization:
              `Bearer ${token}`,
          },

          body: JSON.stringify({
            password: newPassword,
          }),
          _notifHandled: true,
        }
      );

      const data =
        await response.json();

      if (!response.ok) {

        throw new Error(
          data.message ||
            "Failed to change password"
        );
      }

      notify.success(data.message || "Password changed successfully.");

      onClose();

    } catch (error) {

      console.error(error);

      notify.error(error.message || "Failed to change password.");
    }
  };

  return createPortal(
    <div
      className="profile-overlay"
    >

      <div
        className="profile-modal"
        onClick={(e) =>
          e.stopPropagation()
        }
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

            <label>
              First Name
            </label>

            <input
              type="text"
              value={user.name}
              readOnly
            />

          </div>

          <div className="profile-field">

            <label>
              Email
            </label>

            <input
              type="email"
              value={user.email}
              readOnly
            />

          </div>

          <div className="profile-field">

            <label>
              Role
            </label>

            <input
              type="text"
              value={user.role}
              readOnly
            />

          </div>

          <div className="profile-field">

            <label>
              New Password
            </label>

            <input
              type="password"
              value={newPassword}
              onChange={(e) =>
                setNewPassword(
                  e.target.value
                )
              }
              placeholder="Enter new password"
            />

          </div>

          <div className="profile-field">

            <label>
              Confirm Password
            </label>

            <input
              type="password"
              value={confirmPassword}
              onChange={(e) =>
                setConfirmPassword(
                  e.target.value
                )
              }
              placeholder="Confirm password"
            />

          </div>

        </div>

        <div className="profile-footer">

          <button
            className="change-btn"
            onClick={handlePasswordChange}
          >
            Change Password
          </button>

          <button
            className="close-btn"
            onClick={onClose}
          >
            Close
          </button>

        </div>

      </div>

    </div>,
    document.body
  );
}

export default ProfileModal;