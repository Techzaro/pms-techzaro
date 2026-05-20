import { useState } from "react";
import { createPortal } from "react-dom";

import "../components/ProfileModal.css";

function ProfileModal({
  user,
  onClose,
}) {

  const [newPassword, setNewPassword] =
    useState("");

  const [confirmPassword, setConfirmPassword] =
    useState("");

  /**
   * CHANGE PASSWORD
   */

  const handlePasswordChange = async () => {

    if (!newPassword || !confirmPassword) {

      alert(
        "Please enter and confirm your password."
      );

      return;
    }

    if (newPassword !== confirmPassword) {

      alert("Passwords do not match.");

      return;
    }

    try {

      const token =
        localStorage.getItem("token");

      const response = await fetch(
        "http://127.0.0.1:8000/api/user/change-password",
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

      alert(
        data.message ||
          "Password changed successfully."
      );

      onClose();

    } catch (error) {

      console.error(error);

      alert(
        error.message ||
          "Failed to change password."
      );
    }
  };

  return createPortal(
    <div
      className="profile-overlay"
      onClick={onClose}
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