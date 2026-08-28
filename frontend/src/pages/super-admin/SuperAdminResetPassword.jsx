import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams, Link } from "react-router-dom";
import { api } from "./api/superAdminApi";
import "../../pages/ResetPassword.css";

function SuperAdminResetPassword() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const email = searchParams.get("email");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({ password: "", confirmPassword: "" });

  const getPasswordStrength = (pw) => {
    let score = 0;
    if (pw.length >= 8) score++;
    if (/[A-Z]/.test(pw)) score++;
    if (/[a-z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[@$!%*?&#]/.test(pw)) score++;
    return score;
  };

  const getStrengthLabel = (score) => {
    if (score <= 1) return { labelKey: "Very Weak", defaultLabel: "Very Weak", color: "#dc2626", bg: "#fef2f2" };
    if (score === 2) return { labelKey: "Weak", defaultLabel: "Weak", color: "#ea580c", bg: "#fff7ed" };
    if (score === 3) return { labelKey: "Fair", defaultLabel: "Fair", color: "#ca8a04", bg: "#fefce8" };
    if (score === 4) return { labelKey: "Strong", defaultLabel: "Strong", color: "#16a34a", bg: "#f0fdf4" };
    return { labelKey: "Very Strong", defaultLabel: "Very Strong", color: "#15803d", bg: "#f0fdf4" };
  };

  const validate = () => {
    const errors = { password: "", confirmPassword: "" };
    let valid = true;

    if (!password) {
      errors.password = t("Please enter a new password.", { defaultValue: "Please enter a new password." });
      valid = false;
    } else if (password.length < 8) {
      errors.password = t("Password must be at least 8 characters long.", { defaultValue: "Password must be at least 8 characters long." });
      valid = false;
    } else if (!/[A-Z]/.test(password)) {
      errors.password = t("Password must contain at least one uppercase letter.", { defaultValue: "Password must contain at least one uppercase letter." });
      valid = false;
    } else if (!/[a-z]/.test(password)) {
      errors.password = t("Password must contain at least one lowercase letter.", { defaultValue: "Password must contain at least one lowercase letter." });
      valid = false;
    } else if (!/[0-9]/.test(password)) {
      errors.password = t("Password must contain at least one number.", { defaultValue: "Password must contain at least one number." });
      valid = false;
    } else if (!/[@$!%*?&#]/.test(password)) {
      errors.password = t("Password must contain at least one special character (@$!%*?&#).", { defaultValue: "Password must contain at least one special character (@$!%*?&#)." });
      valid = false;
    }

    if (!confirmPassword) {
      errors.confirmPassword = t("Please confirm your password.", { defaultValue: "Please confirm your password." });
      valid = false;
    } else if (password !== confirmPassword) {
      errors.confirmPassword = t("Password confirmation does not match", { defaultValue: "Password confirmation does not match" });
      valid = false;
    }

    setFieldErrors(errors);
    return valid;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!validate()) return;

    if (!token || !email) {
      setError(t("Invalid or expired reset link. Please request a new one.", { defaultValue: "Invalid or expired reset link. Please request a new one." }));
      return;
    }

    setLoading(true);

    try {
      await api.resetPassword(email, token, password);
      setSuccess(true);
    } catch (err) {
      setError(t(err.message || "Failed to reset password. Please try again.", { defaultValue: err.message || "Failed to reset password. Please try again." }));
    } finally {
      setLoading(false);
    }
  };

  if (!token || !email) {
    return (
      <div className="reset-page">
        <div className="reset-left">
          <div className="reset-left-overlay">
            <img
              src="https://cdn-icons-png.flaticon.com/512/5968/5968705.png"
              alt="TechXaro Logo"
              className="reset-left-logo"
            />
            <h1>{t('TECHXARO', { defaultValue: 'TECHXARO' })}</h1>
            <p>{t('Organization Management System', { defaultValue: 'Organization Management System' })}</p>
          </div>
        </div>

        <div className="reset-right">
          <div className="reset-box">
            <div className="reset-error-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <line x1="15" y1="9" x2="9" y2="15"/>
                <line x1="9" y1="9" x2="15" y2="15"/>
              </svg>
            </div>
            <h2>{t('Invalid Reset Link', { defaultValue: 'Invalid Reset Link' })}</h2>
            <p className="reset-error-text">
              {t('This password reset link is invalid or has expired. Please request a new one.', { defaultValue: 'This password reset link is invalid or has expired. Please request a new one.' })}
            </p>
            <Link to="/super-admin/forgot-password" className="reset-submit-btn" style={{ textAlign: "center", textDecoration: "none" }}>
              {t('Request New Link', { defaultValue: 'Request New Link' })}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="reset-page">
        <div className="reset-left">
          <div className="reset-left-overlay">
            <img
              src="https://cdn-icons-png.flaticon.com/512/5968/5968705.png"
              alt="TechXaro Logo"
              className="reset-left-logo"
            />
            <h1>{t('TECHXARO', { defaultValue: 'TECHXARO' })}</h1>
            <p>{t('Organization Management System', { defaultValue: 'Organization Management System' })}</p>
          </div>
        </div>

        <div className="reset-right">
          <div className="reset-box">
            <div className="reset-success-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                <polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
            </div>
            <h2>{t('Password Reset Successful', { defaultValue: 'Password Reset Successful' })}</h2>
            <p className="reset-success-text">
              {t('Your password has been reset successfully. You can now log in with your new password.', { defaultValue: 'Your password has been reset successfully. You can now log in with your new password.' })}
            </p>
            <Link to="/super-admin/login" className="reset-submit-btn" style={{ textAlign: "center", textDecoration: "none" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="19" y1="12" x2="5" y2="12"/>
                <polyline points="12 19 5 12 12 5"/>
              </svg>
              {t('Go to Login', { defaultValue: 'Go to Login' })}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const strength = getPasswordStrength(password);
  const strengthInfo = getStrengthLabel(strength);

  return (
    <div className="reset-page">
      <div className="reset-left">
        <div className="reset-left-overlay">
          <img
            src="https://cdn-icons-png.flaticon.com/512/5968/5968705.png"
            alt="TechXaro Logo"
            className="reset-left-logo"
          />
          <h1>{t('TECHXARO', { defaultValue: 'TECHXARO' })}</h1>
          <p>{t('Organization Management System', { defaultValue: 'Organization Management System' })}</p>
        </div>
      </div>

      <div className="reset-right">
        <div className="reset-box">
          <div className="reset-top-link">
            <Link to="/super-admin/login" className="reset-back-link">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="19" y1="12" x2="5" y2="12"/>
                <polyline points="12 19 5 12 12 5"/>
              </svg>
              {t('Back to Login', { defaultValue: 'Back to Login' })}
            </Link>
          </div>

          <h2>{t('Reset Password', { defaultValue: 'Reset Password' })}</h2>
          <p className="reset-subtitle">
            {t("Enter your new password below. Make sure it's strong and secure.", { defaultValue: "Enter your new password below. Make sure it's strong and secure." })}
          </p>

          {error && <div className="reset-error-box">{error}</div>}

          <form onSubmit={handleSubmit}>
            <label className="reset-label">{t('New Password', { defaultValue: 'New Password' })}</label>
            <div className="reset-input-wrapper">
              <input
                type={showPassword ? "text" : "password"}
                placeholder={t("Enter new password", { defaultValue: "Enter new password" })}
                value={password}
                onChange={(e) => { setPassword(e.target.value); setFieldErrors(prev => ({ ...prev, password: "" })); }}
                className={fieldErrors.password ? "field-error" : ""}
              />
              <button
                type="button"
                className="reset-toggle-pw"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
              >
                {showPassword ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                    <line x1="1" y1="1" x2="23" y2="23"/>
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                )}
              </button>
            </div>
            {fieldErrors.password && <span className="reset-field-error">{fieldErrors.password}</span>}

            {password && (
              <div className="reset-strength">
                <div className="reset-strength-bar">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div
                      key={i}
                      className="reset-strength-segment"
                      style={{
                        backgroundColor: i <= strength ? strengthInfo.color : "#e5e7eb",
                      }}
                    />
                  ))}
                </div>
                <span className="reset-strength-label" style={{ color: strengthInfo.color }}>
                  {t(strengthInfo.labelKey, { defaultValue: strengthInfo.defaultLabel })}
                </span>
              </div>
            )}

            <div className="reset-password-rules">
              <p className="reset-rules-title">{t('Password must contain:', { defaultValue: 'Password must contain:' })}</p>
              <div className="reset-rules-grid">
                <span className={password.length >= 8 ? "rule-met" : ""}>
                  {password.length >= 8 ? "✓" : "○"} {t('At least 8 characters', { defaultValue: 'At least 8 characters' })}
                </span>
                <span className={/[A-Z]/.test(password) ? "rule-met" : ""}>
                  {/[A-Z]/.test(password) ? "✓" : "○"} {t('One uppercase letter', { defaultValue: 'One uppercase letter' })}
                </span>
                <span className={/[a-z]/.test(password) ? "rule-met" : ""}>
                  {/[a-z]/.test(password) ? "✓" : "○"} {t('One lowercase letter', { defaultValue: 'One lowercase letter' })}
                </span>
                <span className={/[0-9]/.test(password) ? "rule-met" : ""}>
                  {/[0-9]/.test(password) ? "✓" : "○"} {t('One number', { defaultValue: 'One number' })}
                </span>
                <span className={/[@$!%*?&#]/.test(password) ? "rule-met" : ""}>
                  {/[@$!%*?&#]/.test(password) ? "✓" : "○"} {t('One special character', { defaultValue: 'One special character' })}
                </span>
              </div>
            </div>

            <label className="reset-label">{t('Confirm Password', { defaultValue: 'Confirm Password' })}</label>
            <div className="reset-input-wrapper">
              <input
                type={showConfirmPassword ? "text" : "password"}
                placeholder={t("Confirm new password", { defaultValue: "Confirm new password" })}
                value={confirmPassword}
                onChange={(e) => { setConfirmPassword(e.target.value); setFieldErrors(prev => ({ ...prev, confirmPassword: "" })); }}
                className={fieldErrors.confirmPassword ? "field-error" : ""}
              />
              <button
                type="button"
                className="reset-toggle-pw"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                tabIndex={-1}
              >
                {showConfirmPassword ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                    <line x1="1" y1="1" x2="23" y2="23"/>
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                )}
              </button>
            </div>
            {fieldErrors.confirmPassword && <span className="reset-field-error">{fieldErrors.confirmPassword}</span>}

            <button
              type="submit"
              disabled={loading}
              className="reset-submit-btn"
              style={{ width: "100%", marginTop: "16px" }}
            >
              {loading ? t("Resetting...", { defaultValue: "Resetting..." }) : t("Reset Password", { defaultValue: "Reset Password" })}
            </button>
          </form>
        </div>

        <div className="reset-footer">
          &copy; {new Date().getFullYear()} TechXaro. {t('All rights reserved.', { defaultValue: 'All rights reserved.' })}
        </div>
      </div>
    </div>
  );
}

export default SuperAdminResetPassword;
