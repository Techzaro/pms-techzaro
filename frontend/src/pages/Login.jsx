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
import { useTranslation } from "react-i18next";
import { MdVisibility, MdVisibilityOff } from "react-icons/md";
import API_URL from "../config/api";
import { saveSession, clearAllSessions, authToken, setTenantSlug, getTenantSlug } from "../utils/auth";
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
  const { t } = useTranslation();
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

  // Note: email policy (allowing/disallowing personal emails) is enforced by the server
  // based on organization settings. Client-side blocking removed so server decides.

  /**
   * handleLogin — Validates form fields and sends login request to API.
   * On success: saves session and redirects based on role.
   * On first login with must_change_password flag: shows password change form.
   */
  const handleLogin = async () => {
    const errors = { email: "", password: "", form: "" };

    if (!email.trim()) {
      errors.email = t("Please enter your email address.", { defaultValue: "Please enter your email address." });
    }

    if (!password.trim()) {
      errors.password = t("Please enter your password.", { defaultValue: "Please enter your password." });
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
        throw new Error(text || t("Unable to login", { defaultValue: "Unable to login" }));
      }

      if (!res.ok) {
        let msg = "";
        if (res.status === 429) {
          msg = data.message || t("Too many failed login attempts. Please try again in 15 minutes.", { defaultValue: "Too many failed login attempts. Please try again in 15 minutes." });
        } else if (res.status === 401) {
          msg = data.message || t("Incorrect email or password. Please try again.", { defaultValue: "Incorrect email or password. Please try again." });
        } else if (res.status === 403) {
          msg = data.message || t("Login using personal email addresses is not allowed", { defaultValue: "Login using personal email addresses is not allowed" });
        } else if (res.status === 422) {
          msg = data.message || t("Please enter valid email and password.", { defaultValue: "Please enter valid email and password." });
        } else if (res.status === 404) {
          msg = data.message || t("Organization does not exist. Please contact administration.", { defaultValue: "Organization does not exist. Please contact administration." });
        } else {
          msg = data.message || t("Something went wrong. Please try again.", { defaultValue: "Something went wrong. Please try again." });
        }
        setFieldErrors({ email: "", password: "", form: msg });
        return;
      }

      if (data.success) {
        saveSession(data.role, data.token, data.user || {}, rememberMe, data.expires_at);

        if (data.tenant_slug) {
          setTenantSlug(data.tenant_slug);
        }

        if (data.must_change_password) {
          setMustChangePassword(true);
          setPassword("");
        } else {
          redirectToDashboard(data.role);
        }
      } else {
        setFieldErrors({ email: "", password: "", form: data.message || t("Incorrect email or password. Please try again.", { defaultValue: "Incorrect email or password. Please try again." }) });
      }
    });
  };

  /**
   * redirectToDashboard — Navigates to the user's organization dashboard.
   * Uses tenant_slug from login response to build /org/{slug}/dashboard.
   * Preserves ?redirect= parameter for post-login redirect.
   */
  const redirectToDashboard = (role) => {
    const slug = getTenantSlug();
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
      notify.error(t("Please enter a new password.", { defaultValue: "Please enter a new password." }));
      return;
    }

    if (!isPasswordValid(newPassword)) {
      notify.error(t("Password does not meet all requirements.", { defaultValue: "Password does not meet all requirements." }));
      return;
    }

    if (newPassword !== confirmPassword) {
      notify.error(t("Password confirmation does not match", { defaultValue: "Password confirmation does not match" }));
      return;
    }

    try {
      setChangingPassword(true);

      const token = authToken();
      const tenantSlug = getTenantSlug();

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
        throw new Error(data.message || t("Failed to change password. Please try again.", { defaultValue: "Failed to change password. Please try again." }));
      }

      // If backend issued a new token, keep the session by saving it; otherwise clear sessions and ask to re-login.
      if (data.token) {
        saveSession(data.role || 'member', data.token, data.user || {}, rememberMe, data.expires_at);
        if (data.tenant_slug) {
          setTenantSlug(data.tenant_slug);
        }
        showSuccessMessage('Password', 'changed');
        setMustChangePassword(false);
        setNewPassword('');
        setConfirmPassword('');
        setEmail('');
        setPassword('');
        // Redirect to dashboard using saved role
        redirectToDashboard(data.role || 'member');
      } else {
        clearAllSessions();
        showSuccessMessage("Password", "changed");
        setMustChangePassword(false);
        setNewPassword("");
        setConfirmPassword("");
        setEmail("");
        setPassword("");
      }

    } catch (error) {
      notify.error(error.message || t("Failed to change password. Please try again.", { defaultValue: "Failed to change password. Please try again." }));
    } finally {
      setChangingPassword(false);
    }
  };

  if (mustChangePassword) {
    return (
      <div className="login-page">
        <div className="login-left">
          <div className="overlay">
            <h1>{t("TECHXARO ONE", { defaultValue: "TECHXARO ONE" })}</h1>
            <p>{t("Manage Projects, Teams & Tasks Professionally", { defaultValue: "Manage Projects, Teams & Tasks Professionally" })}</p>
          </div>
        </div>

        <div className="login-right">
          <div className="login-box">
            <h2>{t("Change Password", { defaultValue: "Change Password" })}</h2>
            <p className="subtitle">
              {t("This is your first login. Please change your password to continue.", { defaultValue: "This is your first login. Please change your password to continue." })}
            </p>

            <PasswordInput
              id="fp-new-password"
              name="newPassword"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); document.getElementById("fp-confirm-password")?.focus(); } }}
              placeholder={t("Enter New Password", { defaultValue: "Enter New Password" })}
              label={t("New Password", { defaultValue: "New Password" })}
              showStrength={true}
              showRules={true}
            />

            <PasswordInput
              id="fp-confirm-password"
              name="confirmPassword"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleFirstTimePasswordChange(); } }}
              placeholder={t("Confirm New Password", { defaultValue: "Confirm New Password" })}
              label={t("Confirm New Password", { defaultValue: "Confirm New Password" })}
              showStrength={false}
              showRules={false}
            />

            <div className="button-area">
              <button
                onClick={handleFirstTimePasswordChange}
                disabled={changingPassword || !newPassword || !confirmPassword}
              >
                {changingPassword ? t("Changing...", { defaultValue: "Changing..." }) : t("Change Password & Login", { defaultValue: "Change Password & Login" })}
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
          <h1>{t("TECHXARO ONE", { defaultValue: "TECHXARO ONE" })}</h1>
          <p>{t("Manage Projects, Teams & Tasks Professionally", { defaultValue: "Manage Projects, Teams & Tasks Professionally" })}</p>
        </div>
      </div>

      <div className="login-right">
        <div className="login-box">
          <h2>{t("Welcome", { defaultValue: "Welcome" })}</h2>
          <p className="subtitle">{t("Login to continue your work", { defaultValue: "Login to continue your work" })}</p>

          {fieldErrors.form && <span className="field-error-text form-error">{fieldErrors.form}</span>}

          <input
            type="email"
            placeholder={t("Enter Email", { defaultValue: "Enter Email" })}
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
              placeholder={t("Enter Password", { defaultValue: "Enter Password" })}
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
              title={showPassword ? t("Hide password", { defaultValue: "Hide password" }) : t("Show password", { defaultValue: "Show password" })}
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
                {t("Remember Me", { defaultValue: "Remember Me" })}
              </label>
              <Link to="/forgot-password" className="forgot-password">{t("Forgot Password?", { defaultValue: "Forgot Password?" })}</Link>
            </div>

            <div className="button-area">
              <LoadingButton onClick={handleLogin} loading={submitting}>
                {t("Login", { defaultValue: "Login" })}
              </LoadingButton>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Login;