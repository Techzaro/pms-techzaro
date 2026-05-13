import { useEffect, useState } from "react";
import DashboardLayout from "../components/layout/DashboardLayout";
import "./Profile.css";

function Profile() {
  const [openModal, setOpenModal] = useState(false);
  const [user, setUser] = useState({
    name: localStorage.getItem("name") || "User",
    email: localStorage.getItem("email") || "user@example.com",
    role: localStorage.getItem("role") || "Member",
  });
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("");

  const showMessage = (text, type = "success") => {
    setMessage(text);
    setMessageType(type);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setTimeout(() => {
      setMessage("");
      setMessageType("");
    }, 4000);
  };

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;

    fetch("http://127.0.0.1:8000/api/user", {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data && data.name) {
          setUser({
            name: data.name,
            email: data.email,
            role: data.role,
          });
          localStorage.setItem("name", data.name);
          localStorage.setItem("email", data.email);
          localStorage.setItem("role", data.role);
        }
      })
      .catch(() => {
        // ignore fetch errors
      });
  }, []);

  const handleChangePassword = async () => {
    if (!newPassword.trim()) {
      showMessage("Please enter the new password.", "error");
      return;
    }

    if (!confirmPassword.trim()) {
      showMessage("Please confirm the new password.", "error");
      return;
    }

    if (newPassword !== confirmPassword) {
      showMessage("Passwords do not match.", "error");
      return;
    }

    try {
      const token = localStorage.getItem("token");
      const res = await fetch("http://127.0.0.1:8000/api/user/change-password", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ password: newPassword }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Failed to update password");
      }

      showMessage(data.message || "Password updated successfully.");
      setOpenModal(false);
      setNewPassword("");
      setConfirmPassword("");
    } catch (error) {
      showMessage(error.message || "Password update failed.", "error");
    }
  };

  return (
    <>
      <DashboardLayout>
        <div className="pf-page">
          <div className="pf-card">
            <h1>My Profile</h1>

            {message && (
              <div className={`message ${messageType}`}>
                {message}
              </div>
            )}

            <div className="pf-grid">
              <div className="pf-field">
                <label>Name</label>
                <input value={user.name} readOnly />
              </div>

              <div className="pf-field">
                <label>Email</label>
                <input value={user.email} readOnly />
              </div>

              <div className="pf-field">
                <label>Role</label>
                <input value={user.role} readOnly />
              </div>

              <div className="pf-field">
                <label>Password</label>
                <input type="password" value="••••••••" readOnly />
              </div>
            </div>

            <div className="pf-actions">
              <button
                className="pf-btn"
                onClick={() => setOpenModal(true)}
              >
                Change Password
              </button>
            </div>
          </div>
        </div>
      </DashboardLayout>

      {/* MODAL */}
      {openModal && (
        <div className="pf-modal-overlay">
          <div className="pf-modal-box">
            <h2>Change Password</h2>

            <div className="pf-modal-field">
              <label>New Password</label>
              <input
                type="password"
                placeholder="Enter new password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>

            <div className="pf-modal-field">
              <label>Confirm Password</label>
              <input
                type="password"
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>

            <div className="pf-modal-actions">
              <button
                className="pf-close"
                onClick={() => setOpenModal(false)}
              >
                Close
              </button>

              <button className="pf-save" onClick={handleChangePassword}>
                Change Password
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default Profile;