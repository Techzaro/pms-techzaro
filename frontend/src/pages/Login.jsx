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
import { MdVisibility, MdVisibilityOff } from "react-icons/md";
import API_URL from "../config/api";
import { saveSession, clearAllSessions, authToken } from "../utils/auth";
import { useNotification } from "../context/NotificationContext";
import { showSuccessMessage } from "../utils/notify";
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
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({ email: "", password: "", form: "" });
  const { submitting, run } = useSubmit();

  const [showPassword, setShowPassword] = useState(false);

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
          password,
          remember_me: rememberMe
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
        if (res.status === 429) {
          msg = data.message || "Too many failed login attempts. Please try again in 15 minutes.";
        } else if (res.status === 401) {
          msg = "Incorrect email or password. Please try again.";
        } else if (res.status === 403) {
          msg = data.message || "Your account has been deactivated. Please contact admin.";
        } else if (res.status === 422) {
          msg = data.message || "Please enter valid email and password.";
        } else if (res.status === 404) {
          msg = data.message || "Organization does not exist. Please contact administration.";
        } else {
          msg = data.message || "Something went wrong. Please try again.";
        }
        setFieldErrors({ email: "", password: "", form: msg });
        return;
      }

      if (data.success) {
        saveSession(data.role, data.token, data.user || {}, rememberMe, data.expires_at);

        if (data.tenant_slug) {
          localStorage.setItem("tenant_slug", data.tenant_slug);
        }

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
   * redirectToDashboard — Navigates to the user's organization dashboard.
   * Uses tenant_slug from login response to build /org/{slug}/dashboard.
   * Preserves ?redirect= parameter for post-login redirect.
   */
  const redirectToDashboard = (role) => {
    const slug = localStorage.getItem("tenant_slug") || "";
    const searchParams = new URLSearchParams(window.location.search);
    const redirectPath = searchParams.get("redirect");

    // If there's a safe internal redirect path, use it
    if (redirectPath && redirectPath.startsWith('/org/')) {
      window.location.href = redirectPath;
      return;
    }

    // Default: go to org dashboard
    if (slug) {
      window.location.href = `/org/${slug}/dashboard`;
    } else {
      // Fallback: no slug available (shouldn't happen for valid login)
      window.location.href = "/login";
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
      notify.error("Password confirmation does not match");
      return;
    }

    try {
      setChangingPassword(true);

      const token = authToken();
      const tenantSlug = localStorage.getItem("tenant_slug") || "";

      const res = await fetch(`${API_URL}/user/first-time-change-password`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "Authorization": `Bearer ${token}`,
          ...(tenantSlug ? { "X-Tenant-ID": tenantSlug } : {}),
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

      showSuccessMessage("Password", "changed");
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
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); document.getElementById("fp-confirm-password")?.focus(); } }}
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
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleFirstTimePasswordChange(); } }}
              placeholder="Confirm New Password"
              label="Confirm New Password"
              showStrength={false}
              showRules={false}
            />

            <div className="button-area">
              <button
                onClick={handleFirstTimePasswordChange}
                disabled={changingPassword || !newPassword || !confirmPassword}
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
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); document.getElementById("login-password")?.focus(); } }}
            className={fieldErrors.email ? "field-error" : ""}
          />
          {fieldErrors.email && <span className="field-error-text">{fieldErrors.email}</span>}

          {/* Hardened Password Field Wrapper */}
          <div style={{ position: "relative", width: "100%", display: "block", marginBottom: "6px" }}>
            <input
              id="login-password"
              type={showPassword ? "text" : "password"}
              placeholder="Enter Password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setFieldErrors(prev => ({ ...prev, password: "", form: "" })); }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleLogin(); } }}
              className={fieldErrors.password ? "field-error" : ""}
              style={{
                width: "100%",
                paddingRight: "45px",
                margin: 0, 
                boxSizing: "border-box",
                display: "block"
              }}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              title={showPassword ? "Hide password" : "Show password"}
              style={{
                position: "absolute",
                right: "4px", // Fixed to the right corner
                top: "0",
                bottom: "0", 
                width: "40px", // OVERRIDES the 100% width from Login.css
                minWidth: "auto", 
                height: "100%",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                padding: "0",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#64748b"
              }}
            >
              {showPassword ? <MdVisibilityOff size={20} /> : <MdVisibility size={20} />}
            </button>
          </div>
          {fieldErrors.password && <span className="field-error-text">{fieldErrors.password}</span>}

          <div className="bottom-area">
            <div className="options">
              <label className="remember-box">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                />
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