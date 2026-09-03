/**
 * Login.jsx — Login Page Component
 *
 * Handles user authentication with email/password credentials.
 * Features:
 * - Form validation for email and password fields
 * - Role-based redirect after login (admin, manager, teamlead, member)
 * - Inline email verification for new users (6-digit code)
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

  // Flow steps: login | verify_email | change_password
  const [flowStep, setFlowStep] = useState("login");
  const [loginData, setLoginData] = useState(null);

  // Email verification state
  const [verifySubStep, setVerifySubStep] = useState("prompt"); // prompt | code
  const [verifyCode, setVerifyCode] = useState(["", "", "", "", "", ""]);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verifyCountdown, setVerifyCountdown] = useState(0);

  // First-time password change state
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  useEffect(() => {
    const urlMessage = searchParams.get("message");
    if (urlMessage) {
      notify.error(urlMessage);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (verifyCountdown <= 0) return;
    const timer = setTimeout(() => setVerifyCountdown(verifyCountdown - 1), 1000);
    return () => clearTimeout(timer);
  }, [verifyCountdown]);

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
        headers: { "Accept": "application/json", "Content-Type": "application/json" },
        _notifHandled: true,
        body: JSON.stringify({ email, password, remember_me: rememberMe })
      });

      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch { throw new Error(text || "Unable to login"); }

      if (!res.ok) {
        let msg = "";
        if (res.status === 429) msg = data.message || "Too many failed login attempts. Please try again in 15 minutes.";
        else if (res.status === 401) msg = data.message || "Incorrect email or password. Please try again.";
        else if (res.status === 403) msg = data.message || "Login using personal email addresses is not allowed";
        else if (res.status === 422) msg = data.message || "Please enter valid email and password.";
        else if (res.status === 404) msg = data.message || "Organization does not exist. Please contact administration.";
        else msg = data.message || "Something went wrong. Please try again.";
        setFieldErrors({ email: "", password: "", form: msg });
        return;
      }

      if (data.success) {
        saveSession(data.role, data.token, data.user || {}, rememberMe, data.expires_at);
        if (data.tenant_slug) setTenantSlug(data.tenant_slug);

        setLoginData(data);

        if (data.must_change_password) {
          // First-time user: go straight to password change (verification handled by dashboard banner)
          setFlowStep("change_password");
          setPassword("");
        } else if (data.needs_email_verification) {
          // Returning user with unverified email: show verification prompt
          setFlowStep("verify_email");
          setPassword("");
        } else {
          redirectToDashboard(data.role);
        }
      } else {
        setFieldErrors({ email: "", password: "", form: data.message || "Incorrect email or password." });
      }
    });
  };

  const redirectToDashboard = (role) => {
    const slug = getTenantSlug();
    const searchParams = new URLSearchParams(window.location.search);
    const redirectPath = searchParams.get("redirect");
    if (redirectPath && redirectPath.startsWith('/org/')) {
      window.location.href = redirectPath;
      return;
    }
    if (slug) {
      window.location.href = `/org/${slug}/dashboard`;
    } else {
      window.location.href = "/login";
    }
  };

  // ─── Email Verification Handlers ──────────────────────────

  const handleSendCode = async () => {
    setVerifyLoading(true);
    try {
      const res = await fetch(`${API_URL}/email/send-code`, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${authToken()}` },
      });
      const data = await res.json();
      if (data.success) {
        setVerifyCountdown(60);
        setVerifyCode(["", "", "", "", "", ""]);
        setVerifySubStep("code");
        setTimeout(() => document.getElementById("vcode-0")?.focus(), 100);
      }
    } catch {}
    finally { setVerifyLoading(false); }
  };

  const handleVerifyCodeChange = (index, value) => {
    if (!/^\d*$/.test(value)) return;
    const newCode = [...verifyCode];
    newCode[index] = value.slice(-1);
    setVerifyCode(newCode);
    if (value && index < 5) document.getElementById(`vcode-${index + 1}`)?.focus();
    if (newCode.every((d) => d !== "") && newCode.join("").length === 6) {
      handleVerifySubmit(newCode.join(""));
    }
  };

  const handleVerifyKeyDown = (index, e) => {
    if (e.key === "Backspace" && !verifyCode[index] && index > 0) {
      document.getElementById(`vcode-${index - 1}`)?.focus();
    }
  };

  const handleVerifyPaste = (e) => {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted.length === 6) {
      const newCode = pasted.split("");
      setVerifyCode(newCode);
      document.getElementById("vcode-5")?.focus();
      handleVerifySubmit(pasted);
    }
  };

  const handleVerifySubmit = async (codeStr) => {
    setVerifyLoading(true);
    try {
      const res = await fetch(`${API_URL}/email/verify-code`, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${authToken()}` },
        body: JSON.stringify({ code: codeStr }),
      });
      const data = await res.json();
      if (data.success) {
        if (loginData?.must_change_password) {
          setFlowStep("change_password");
          setVerifyCode(["", "", "", "", "", ""]);
        } else {
          redirectToDashboard(loginData?.role || "member");
        }
      } else {
        setVerifyCode(["", "", "", "", "", ""]);
        document.getElementById("vcode-0")?.focus();
      }
    } catch { setVerifyCode(["", "", "", "", "", ""]); }
    finally { setVerifyLoading(false); }
  };

  const handleSkipVerification = () => {
    if (loginData?.must_change_password) {
      setFlowStep("change_password");
    } else {
      redirectToDashboard(loginData?.role || "member");
    }
  };

  // ─── Password Change Handler ──────────────────────────

  const handleFirstTimePasswordChange = async () => {
    if (!newPassword.trim()) { notify.error("Please enter a new password."); return; }
    if (!isPasswordValid(newPassword)) { notify.error("Password does not meet all requirements."); return; }
    if (newPassword !== confirmPassword) { notify.error("Password confirmation does not match."); return; }

    try {
      setChangingPassword(true);
      const token = authToken();
      const tenantSlug = getTenantSlug();

      const res = await fetch(`${API_URL}/user/first-time-change-password`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}`, ...(tenantSlug ? { "X-Tenant-ID": tenantSlug } : {}) },
        body: JSON.stringify({ new_password: newPassword }),
        _notifHandled: true,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to change password.");

      if (data.token) {
        saveSession(data.role || 'member', data.token, data.user || {}, rememberMe, data.expires_at);
        if (data.tenant_slug) setTenantSlug(data.tenant_slug);
        showSuccessMessage('Password', 'changed');
        redirectToDashboard(data.role || 'member');
      } else {
        clearAllSessions();
        showSuccessMessage("Password", "changed");
        setFlowStep("login");
        setEmail(""); setPassword(""); setNewPassword(""); setConfirmPassword("");
      }
    } catch (error) {
      notify.error(error.message || "Failed to change password.");
    } finally { setChangingPassword(false); }
  };

  // ─── Render: Email Verification Step ──────────────────────────

  if (flowStep === "verify_email") {
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
            {verifySubStep === "prompt" ? (
              <>
                <h2>{t("Verify Your Email", { defaultValue: "Verify Your Email" })}</h2>
                <p className="subtitle">{t("Please verify your email to keep your account active. Unverified accounts may be suspended after 7 days.", { defaultValue: "Please verify your email to keep your account active. Unverified accounts may be suspended after 7 days." })}</p>
                <div className="button-area" style={{ display: "flex", gap: "10px", marginTop: "20px" }}>
                  <button onClick={handleSendCode} disabled={verifyLoading}
                    style={{ flex: 1, padding: "12px", borderRadius: "8px", border: "none", background: "#4f46e5", color: "#fff", fontSize: "14px", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
                    {verifyLoading && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ width: 14, height: 14, animation: "spin 0.8s linear infinite" }}><path d="M12 2a10 10 0 0 1 10 10" /></svg>}
                    {verifyLoading ? t("Processing...", { defaultValue: "Processing..." }) : t("Verify Now", { defaultValue: "Verify Now" })}
                  </button>
                  <button className="skip-btn" onClick={handleSkipVerification}
                    style={{ flex: 1, padding: "12px", borderRadius: "8px", border: "1px solid #d1d5db", background: "#fff", color: "#374151", fontSize: "14px", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
                    {t("Skip for now", { defaultValue: "Skip for now" })}
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2>{t("Enter Verification Code", { defaultValue: "Enter Verification Code" })}</h2>
                <p className="subtitle">{t("Enter the 6-digit code sent to your email", { defaultValue: "Enter the 6-digit code sent to your email" })}</p>

                <div className="verify-code-inputs" onPaste={handleVerifyPaste}>
                  {verifyCode.map((digit, i) => (
                    <input key={i} id={`vcode-${i}`} type="text" inputMode="numeric" maxLength={1} value={digit}
                      onChange={(e) => handleVerifyCodeChange(i, e.target.value)}
                      onKeyDown={(e) => handleVerifyKeyDown(i, e)} className="verify-code-input" autoFocus={i === 0} />
                  ))}
                </div>

                <div className="button-area">
                  <button onClick={handleSendCode} disabled={verifyCountdown > 0 || verifyLoading}
                    style={{ background: "none", border: "none", color: "#4f46e5", cursor: "pointer", padding: "4px", fontSize: "13px", marginBottom: "12px" }}>
                    {verifyCountdown > 0
                      ? t("Resend in {{s}}s", { s: verifyCountdown, defaultValue: `Resend in ${verifyCountdown}s` })
                      : t("Resend Code", { defaultValue: "Resend Code" })}
                  </button>
                </div>

                <div className="button-area">
                  <button onClick={() => setVerifySubStep("prompt")}
                    style={{ background: "none", border: "none", color: "#6b7280", cursor: "pointer", padding: "4px", fontSize: "13px" }}>
                    {t("← Back", { defaultValue: "← Back" })}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ─── Render: Change Password Step ──────────────────────────

  if (flowStep === "change_password") {
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

            <PasswordInput id="fp-new-password" name="newPassword" value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); document.getElementById("fp-confirm-password")?.focus(); } }}
              placeholder={t("Enter New Password", { defaultValue: "Enter New Password" })}
              label={t("New Password", { defaultValue: "New Password" })} showStrength={true} showRules={true} />

            <PasswordInput id="fp-confirm-password" name="confirmPassword" value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleFirstTimePasswordChange(); } }}
              placeholder={t("Confirm New Password", { defaultValue: "Confirm New Password" })}
              label={t("Confirm New Password", { defaultValue: "Confirm New Password" })} showStrength={false} showRules={false} />

            <div className="button-area">
              <button onClick={handleFirstTimePasswordChange} disabled={changingPassword || !newPassword || !confirmPassword}>
                {changingPassword ? t("Changing...", { defaultValue: "Changing..." }) : t("Change Password & Login", { defaultValue: "Change Password & Login" })}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Render: Login Step (default) ──────────────────────────

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

          <input type="email" placeholder={t("Enter Email", { defaultValue: "Enter Email" })} value={email}
            onChange={(e) => { setEmail(e.target.value); setFieldErrors(prev => ({ ...prev, email: "", form: "" })); }}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); document.getElementById("login-password")?.focus(); } }}
            className={fieldErrors.email ? "field-error" : ""} />
          {fieldErrors.email && <span className="field-error-text">{fieldErrors.email}</span>}

          <div style={{ position: "relative", width: "100%", display: "block", marginBottom: "6px" }}>
            <input id="login-password" type={showPassword ? "text" : "password"}
              placeholder={t("Enter Password", { defaultValue: "Enter Password" })} value={password}
              onChange={(e) => { setPassword(e.target.value); setFieldErrors(prev => ({ ...prev, password: "", form: "" })); }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleLogin(); } }}
              className={fieldErrors.password ? "field-error" : ""}
              style={{ width: "100%", paddingRight: "45px", margin: 0, boxSizing: "border-box", display: "block" }} />
            <button type="button" onClick={() => setShowPassword(!showPassword)}
              title={showPassword ? "Hide password" : "Show password"}
              style={{ position: "absolute", right: "4px", top: "0", bottom: "0", width: "40px", minWidth: "auto", height: "100%", background: "transparent", border: "none", cursor: "pointer", padding: "0", display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b" }}>
              {showPassword ? <MdVisibilityOff size={20} /> : <MdVisibility size={20} />}
            </button>
          </div>
          {fieldErrors.password && <span className="field-error-text">{fieldErrors.password}</span>}

          <div className="bottom-area">
            <div className="options">
              <label className="remember-box">
                <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} />
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
