/**
 * Login.jsx — Login Page Component
 *
 * Handles user authentication with email/password credentials.
 * Features:
 * - Form validation for email and password fields
 * - Role-based redirect after login (admin, manager, teamlead, member)
 * - First-time password change flow for new users
 * - Error handling with field-level and form-level error display
 * - URL message parameter support for post-logout messages
 * - Session persistence via saveSession utility
 */
import { useState, useEffect } from "react";
import { useSearchParams, Link } from "react-router-dom";
import API_URL from "../config/api";
import { saveSession, clearAllSessions, authToken } from "../utils/auth";
import { useNotification } from "../context/NotificationContext";
import { PasswordInput, isPasswordValid } from "../components/PasswordInput";
import { useSubmit } from "../hooks/useSubmit";
import LoadingButton from "../components/LoadingButton";
import "./Login.css";

/**
 * Login — Main login page component.
 * Manages login form state, authentication API call, password change flow,
 * and role-based redirection.
 */
function Login() {
  const notify = useNotification();

  const [searchParams, setSearchParams] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({ email: "", password: "", form: "" });
  const { submitting, run } = useSubmit();

  // Display URL message (e.g. from logout redirect) as error notification
  useEffect(() => {
    const urlMessage = searchParams.get("message");
    if (urlMessage) {
      notify.error(urlMessage);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // First-time password change state
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  /**
   * handleLogin — Validates form fields and sends login request to API.
   * On success: saves session and redirects based on role.
   * On first login with must_change_password flag: shows password change form.
   */
  const handleLogin = async () => {
    const errors = { email: "", password: "", form: "" };

    if (!email.trim()) {
      errors.email = "Please enter your professional email address.";
    }

    if (!password.trim()) {
      errors.password = "Please enter your password.";
    }

    if (errors.email || errors.password) {
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({ email: "", password: "", form: "" });

    await run(async () => {
      const res = await fetch(`${API_URL}/login`, {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json"
        },
        _notifHandled: true,
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
        let msg = "";
        if (res.status === 401) {
          msg = "Incorrect email or password. Please try again.";
        } else if (res.status === 403) {
          msg = data.message || "Your account has been deactivated. Please contact admin.";
        } else if (res.status === 422) {
          msg = data.message || "Please enter valid email and password.";
        } else {
          msg = data.message || "Something went wrong. Please try again.";
        }
        setFieldErrors({ email: "", password: "", form: msg });
        return;
      }

      if (data.success) {
        saveSession(data.role, data.token, data.user || {});

        if (data.must_change_password) {
          setMustChangePassword(true);
          setPassword("");
        } else {
          redirectToDashboard(data.role);
        }
      } else {
        setFieldErrors({ email: "", password: "", form: data.message || "Incorrect email or password. Please try again." });
      }
    });
  };

  /**
   * redirectToDashboard — Navigates to the appropriate dashboard based on user role.
   * Uses window.location.href for full page reload to ensure clean session state.
   */
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

  /**
   * handleFirstTimePasswordChange — Validates and submits new password for first-time login.
   * Clears all sessions after successful change and prompts user to login again.
   */
  const handleFirstTimePasswordChange = async () => {
    if (!newPassword.trim()) {
      notify.error("Please enter a new password.");
      return;
    }

    if (!isPasswordValid(newPassword)) {
      notify.error("Password does not meet all requirements.");
      return;
    }

    if (newPassword !== confirmPassword) {
      notify.error("Passwords do not match. Please re-enter.");
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
        _notifHandled: true,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Failed to change password. Please try again.");
      }

      clearAllSessions();

      notify.success("Password changed successfully. Please login with your new password.");
      setMustChangePassword(false);
      setNewPassword("");
      setConfirmPassword("");
      setEmail("");
      setPassword("");

    } catch (error) {
      notify.error(error.message || "Failed to change password. Please try again.");
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

            <PasswordInput
              id="fp-new-password"
              name="newPassword"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Enter New Password"
              label="New Password"
              showStrength={true}
              showRules={true}
            />

            <PasswordInput
              id="fp-confirm-password"
              name="confirmPassword"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm New Password"
              label="Confirm New Password"
              showStrength={false}
              showRules={false}
            />

            <div className="button-area">
              <button
                onClick={handleFirstTimePasswordChange}
                disabled={changingPassword || !isPasswordValid(newPassword) || newPassword !== confirmPassword}
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

          {fieldErrors.form && <span className="field-error-text form-error">{fieldErrors.form}</span>}

          <input
            type="email"
            placeholder="Enter Professional Email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setFieldErrors(prev => ({ ...prev, email: "", form: "" })); }}
            className={fieldErrors.email ? "field-error" : ""}
          />
          {fieldErrors.email && <span className="field-error-text">{fieldErrors.email}</span>}

          <input
            type="password"
            placeholder="Enter Password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setFieldErrors(prev => ({ ...prev, password: "", form: "" })); }}
            className={fieldErrors.password ? "field-error" : ""}
          />
          {fieldErrors.password && <span className="field-error-text">{fieldErrors.password}</span>}

          <div className="bottom-area">
            <div className="options">
              <label className="remember-box">
                <input type="checkbox" />
                Remember Me
              </label>
              <Link to="/forgot-password" className="forgot-password">Forgot Password?</Link>
            </div>

            <div className="button-area">
              <LoadingButton onClick={handleLogin} loading={submitting}>
                Login
              </LoadingButton>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Login;
