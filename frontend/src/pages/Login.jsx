/**
 * Login page component.
 * Handles user authentication and redirects based on role.
 * Shows first-time password change popup if required.
 */
import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import API_URL from "../config/api";
import { saveSession, clearAllSessions, authToken } from "../utils/auth";
import "./Login.css";

function Login() {

  const [searchParams, setSearchParams] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("");

  useEffect(() => {
    const urlMessage = searchParams.get("message");
    if (urlMessage) {
      setMessage(urlMessage);
      setMessageType("error");
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordMessageType, setPasswordMessageType] = useState("");

  const showMessage = (text, type = "success") => {
    setMessage(text);
    setMessageType(type);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setTimeout(() => {
      setMessage("");
      setMessageType("");
    }, 4000);
  };

  const showPasswordMessage = (text, type = "success") => {
    setPasswordMessage(text);
    setPasswordMessageType(type);
  };

  const handleLogin = async () => {
    if (!email.trim()) {
      showMessage("Please enter your email address.", "error");
      return;
    }

    if (!password.trim()) {
      showMessage("Please enter your password.", "error");
      return;
    }

    try {
      setLoading(true);

      const res = await fetch(`${API_URL}/login`, {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email,
          password
        })
      });

      const text = await res.text();
      let data;

      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(text || "Unable to login");
      }

      if (!res.ok) {
        if (res.status === 401) {
          throw new Error("Incorrect email or password. Please try again.");
        } else if (res.status === 403) {
          throw new Error(data.message || "Your account has been deactivated. Please contact admin.");
        } else if (res.status === 422) {
          throw new Error(data.message || "Please enter valid email and password.");
        } else {
          throw new Error(data.message || "Something went wrong. Please try again.");
        }
      }

      if (data.status) {
        saveSession(data.role, data.token, data.user || {});

        if (data.must_change_password) {
          setMustChangePassword(true);
          setPassword("");
        } else {
          redirectToDashboard(data.role);
        }
      } else {
        showMessage(data.message || "Incorrect email or password. Please try again.", "error");
      }
    } catch (error) {
      console.log(error);
      showMessage(error.message || "Something went wrong. Please try again.", "error");
    } finally {
      setLoading(false);
    }
  };

  const redirectToDashboard = (role) => {
    if (role === "admin") {
      window.location.href = "/admin/dashboard";
    } else if (role === "manager") {
      window.location.href = "/manager/dashboard";
    } else if (role === "teamlead" || role === "team_lead") {
      window.location.href = "/teamlead/dashboard";
    } else {
      window.location.href = "/member/dashboard";
    }
  };

  const handleFirstTimePasswordChange = async () => {
    showPasswordMessage("", "");

    if (!newPassword.trim()) {
      showPasswordMessage("Please enter a new password.", "error");
      return;
    }

    if (newPassword.length < 6) {
      showPasswordMessage("Password must be at least 6 characters long.", "error");
      return;
    }

    if (newPassword !== confirmPassword) {
      showPasswordMessage("Passwords do not match. Please re-enter.", "error");
      return;
    }

    try {
      setChangingPassword(true);

      const token = authToken();

      const res = await fetch(`${API_URL}/user/first-time-change-password`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({
          new_password: newPassword,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Failed to change password. Please try again.");
      }

      clearAllSessions();

      showMessage("Password changed successfully. Please login with your new password.", "success");
      setMustChangePassword(false);
      setNewPassword("");
      setConfirmPassword("");
      setEmail("");
      setPassword("");

    } catch (error) {
      showPasswordMessage(error.message || "Failed to change password. Please try again.", "error");
    } finally {
      setChangingPassword(false);
    }
  };

  if (mustChangePassword) {
    return (
      <div className="login-page">
        <div className="login-left">
          <div className="overlay">
            <img
              src="https://cdn-icons-png.flaticon.com/512/5968/5968705.png"
              alt="Techxaro Logo"
              className="logo"
            />
            <h1>TECHXARO PMS</h1>
            <p>Manage Projects, Teams & Tasks Professionally</p>
          </div>
        </div>

        <div className="login-right">
          <div className="login-box">
            <h2>Change Password</h2>
            <p className="subtitle">
              This is your first login. Please change your password to continue.
            </p>

            {message && (
              <div className={`message ${messageType}`}>
                {message}
              </div>
            )}

            {passwordMessage && (
              <div className={`message ${passwordMessageType}`}>
                {passwordMessage}
              </div>
            )}

            <input
              type="password"
              placeholder="Enter New Password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />

            <input
              type="password"
              placeholder="Confirm New Password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />

            <div className="button-area">
              <button
                onClick={handleFirstTimePasswordChange}
                disabled={changingPassword}
              >
                {changingPassword ? "Changing..." : "Change Password & Login"}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="login-left">
        <div className="overlay">
          <img
            src="https://cdn-icons-png.flaticon.com/512/5968/5968705.png"
            alt="Techxaro Logo"
            className="logo"
          />
          <h1>TECHXARO PMS</h1>
          <p>Manage Projects, Teams & Tasks Professionally</p>
        </div>
      </div>

      <div className="login-right">
        <div className="login-box">
          <h2>Welcome</h2>
          <p className="subtitle">Login to continue your work</p>

          {message && (
            <div className={`message ${messageType}`}>
              {message}
            </div>
          )}

          <input
            type="email"
            placeholder="Enter Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <input
            type="password"
            placeholder="Enter Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <div className="bottom-area">
            <div className="options">
              <label className="remember-box">
                <input type="checkbox" />
                Remember Me
              </label>
              <span className="forgot-password">Forgot Password?</span>
            </div>

            <div className="button-area">
              <button onClick={handleLogin} disabled={loading}>
                {loading ? "Loading..." : "Login"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Login;
